"""ParentConnect service layer (Phase 5).

This module owns the business rules for verified parent contacts, weekly report
calculation, duplicate-safe generation, consent-aware delivery eligibility, and
delivery retries. All report statistics are derived from real stored attempts;
an inactive week is reported as inactive instead of inventing numbers.
"""
from __future__ import annotations

import datetime
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple

from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Attempt,
    Concept,
    ConceptMastery,
    DiagnosticRecord,
    ParentContact,
    ParentNotificationPreference,
    ParentProfile,
    ParentStudentLink,
    User,
    WeeklyProgressReport,
)
from app.services import parent_connect_delivery as delivery

logger = logging.getLogger("udaan.parent_connect")

SUPPORTED_LANGUAGES = ("te", "en", "hi")
CONTACT_TYPES = ("email", "sms")
LESSON_COMPLETION_MASTERY = 0.70
WEAK_MASTERY_THRESHOLD = 0.50
WEAK_ACCURACY_THRESHOLD = 50
STRENGTH_ACCURACY_THRESHOLD = 75
IMPROVEMENT_DELTA = 10

IST_TZ = datetime.timezone(
    datetime.timedelta(minutes=settings.PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES)
)

_EMAIL_RE = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
_PHONE_RE = re.compile(r"^[6-9]\d{9}$")


class ParentConnectError(Exception):
    """Domain error that routers translate into an HTTP response."""

    def __init__(self, message: str, status_code: int = 400, retry_after: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.retry_after = retry_after


# ---------------------------------------------------------------------------
# Time helpers (fixed UTC+05:30 avoids Windows tzdata dependency)
# ---------------------------------------------------------------------------
def utc_now() -> datetime.datetime:
    return datetime.datetime.utcnow()


def ist_now() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc).astimezone(IST_TZ)


def ist_date_start_utc(date_value: datetime.date) -> datetime.datetime:
    aware = datetime.datetime.combine(date_value, datetime.time.min, tzinfo=IST_TZ)
    return aware.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def ist_date_end_exclusive_utc(date_value: datetime.date) -> datetime.datetime:
    return ist_date_start_utc(date_value + datetime.timedelta(days=1))


def latest_completed_week(now: Optional[datetime.datetime] = None) -> Tuple[datetime.date, datetime.date]:
    """Return the most recent Saturday-through-Friday reporting period.

    The report is generated on Saturday morning, so the previous day (Friday) is
    the week end. On a Friday itself the *previous* Friday is used because the
    current Friday is not yet complete.
    """
    now_ist = now.astimezone(IST_TZ) if now and now.tzinfo else (now or ist_now())
    today = now_ist.date()
    days_since_friday = (today.weekday() - 4) % 7  # Friday == 4
    week_end = today - datetime.timedelta(days=days_since_friday)
    if week_end == today:
        week_end -= datetime.timedelta(days=7)
    week_start = week_end - datetime.timedelta(days=6)
    return week_start, week_end


def week_schedule_time_ist(week_end: datetime.date) -> datetime.datetime:
    """Saturday 09:00 IST following the reporting week."""
    saturday = week_end + datetime.timedelta(days=1)
    return datetime.datetime.combine(
        saturday,
        datetime.time(
            hour=settings.PARENT_CONNECT_SCHEDULE_HOUR,
            minute=settings.PARENT_CONNECT_SCHEDULE_MINUTE,
        ),
        tzinfo=IST_TZ,
    )


def is_week_due(week_end: datetime.date, now: Optional[datetime.datetime] = None) -> bool:
    now_ist = now.astimezone(IST_TZ) if now and now.tzinfo else (now or ist_now())
    return now_ist >= week_schedule_time_ist(week_end)


def format_week_label(week_start: datetime.date, week_end: datetime.date) -> str:
    return f"{week_start.isoformat()} – {week_end.isoformat()}"


# ---------------------------------------------------------------------------
# Contact normalisation and validation
# ---------------------------------------------------------------------------
def normalize_email(value: Optional[str]) -> str:
    clean = (value or "").strip().lower()
    if not clean or len(clean) > 255 or not _EMAIL_RE.match(clean):
        raise ParentConnectError("Please enter a valid email address.")
    return clean


def normalize_phone(value: Optional[str]) -> str:
    raw = (value or "").strip()
    if not raw:
        raise ParentConnectError("Please enter a valid Indian mobile number.")
    digits = re.sub(r"[\s\-().]", "", raw)
    if digits.startswith("+"):
        digits = digits[1:]
    if digits.startswith("00"):
        digits = digits[2:]
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    elif digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]
    if not _PHONE_RE.match(digits):
        raise ParentConnectError("Please enter a valid 10-digit Indian mobile number.")
    return f"+91{digits}"


def validate_contact(
    contact_type: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
) -> Tuple[str, Optional[str], Optional[str]]:
    """Validate exactly one channel. Returns (type, normalized_email, normalized_phone)."""
    channel = (contact_type or "").strip().lower()
    if channel not in CONTACT_TYPES:
        raise ParentConnectError("contact_type must be either 'email' or 'sms'.")
    if channel == "email":
        if phone:
            raise ParentConnectError("Register either an email or a mobile number, not both.")
        return "email", normalize_email(email), None
    if email:
        raise ParentConnectError("Register either an email or a mobile number, not both.")
    return "sms", None, normalize_phone(phone)


def mask_email(value: Optional[str]) -> Optional[str]:
    if not value or "@" not in value:
        return value
    local, domain = value.split("@", 1)
    visible = local[:1] if local else ""
    return f"{visible}***@{domain}"


def mask_phone(value: Optional[str]) -> Optional[str]:
    if not value:
        return value
    digits = value.lstrip("+")
    if len(digits) <= 4:
        return "***"
    return f"+{digits[:-4]}****{digits[-4:]}"


# ---------------------------------------------------------------------------
# OTP lifecycle
# ---------------------------------------------------------------------------
def generate_otp(length: Optional[int] = None) -> str:
    size = max(4, min(8, length or settings.PARENT_CONNECT_OTP_LENGTH))
    return "".join(str(secrets.randbelow(10)) for _ in range(size))


def hash_otp(parent_id: int, otp: str) -> str:
    message = f"{parent_id}:{otp}".encode("utf-8")
    return hmac.new(settings.SECRET_KEY.encode("utf-8"), message, hashlib.sha256).hexdigest()


def _otp_copy(language: str) -> Dict[str, str]:
    copy = {
        "en": {
            "subject": "Your UDAAN verification code",
            "heading": "Verify your UDAAN contact",
            "body": "Use this code to verify the contact where you want to receive weekly learning reports.",
            "code_label": "Verification code",
            "expiry": "This code expires in {minutes} minutes. Do not share it with anyone.",
            "sms": "UDAAN verification code: {otp}. Valid for {minutes} minutes. Do not share this code.",
        },
        "te": {
            "subject": "మీ UDAAN ధృవీకరణ కోడ్",
            "heading": "మీ UDAAN సంప్రదింపు వివరాలను ధృవీకరించండి",
            "body": "వారపు అభ్యాస నివేదికలు పొందాలనుకుంటున్న సంప్రదింపు వివరాలను ధృవీకరించడానికి ఈ కోడ్‌ను ఉపయోగించండి.",
            "code_label": "ధృవీకరణ కోడ్",
            "expiry": "ఈ కోడ్ {minutes} నిమిషాలలో ముగుస్తుంది. ఎవరితోనూ పంచుకోవద్దు.",
            "sms": "UDAAN ధృవీకరణ కోడ్: {otp}. {minutes} నిమిషాలు మాత్రమే. ఈ కోడ్‌ను పంచుకోవద్దు.",
        },
        "hi": {
            "subject": "आपका UDAAN सत्यापन कोड",
            "heading": "अपने UDAAN संपर्क को सत्यापित करें",
            "body": "साप्ताहिक अधिगम रिपोर्ट प्राप्त करने वाले संपर्क को सत्यापित करने के लिए इस कोड का उपयोग करें।",
            "code_label": "सत्यापन कोड",
            "expiry": "यह कोड {minutes} मिनट में समाप्त होगा। कृपया इसे किसी के साथ साझा न करें।",
            "sms": "UDAAN सत्यापन कोड: {otp}. {minutes} मिनट के लिए मान्य। यह कोड साझा न करें।",
        },
    }
    return copy.get(language) or copy["en"]


def send_contact_otp(contact: ParentContact, otp: str, language: str = "en") -> delivery.DeliveryResult:
    """Deliver an OTP through the configured provider. Never raises."""
    copy = _otp_copy(language)
    minutes = settings.PARENT_CONNECT_OTP_EXPIRE_MINUTES
    if contact.contact_type == "sms":
        message = copy["sms"].format(otp=otp, minutes=minutes)
        return delivery.send_sms(contact.phone or "", message, {"OTP": otp})
    if contact.contact_type == "email":
        html_body = f"""<!doctype html>
<html><body style="margin:0;padding:24px;background:#eef4f8;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:26px;border:1px solid #e2e8f0;">
    <div style="color:#0e7490;font-weight:800;letter-spacing:.2em;font-size:12px;">UDAAN</div>
    <h2 style="color:#0f172a;font-size:20px;margin:14px 0 8px;">{copy['heading']}</h2>
    <p style="color:#475569;font-size:14px;line-height:1.6;">{copy['body']}</p>
    <div style="background:#f1f5f9;border-radius:10px;padding:16px;text-align:center;margin:18px 0;">
      <div style="color:#64748b;font-size:11px;letter-spacing:.1em;text-transform:uppercase;">{copy['code_label']}</div>
      <div style="color:#0f172a;font-size:30px;font-weight:800;letter-spacing:.18em;margin-top:4px;">{otp}</div>
    </div>
    <p style="color:#64748b;font-size:12px;">{copy['expiry'].format(minutes=minutes)}</p>
  </div>
</body></html>"""
        text_body = f"UDAAN\n\n{copy['heading']}\n{copy['body']}\n\n{copy['code_label']}: {otp}\n\n{copy['expiry'].format(minutes=minutes)}"
        return delivery.send_email(
            contact.email or "",
            copy["subject"],
            html_body,
            text_body,
        )
    return delivery.DeliveryResult(channel=contact.contact_type or "unknown", status="failed", error="Missing contact")


def _language_for_parent(db: Session, parent: User) -> str:
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    if pref and pref.report_language in SUPPORTED_LANGUAGES:
        return pref.report_language
    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    if profile and profile.preferred_language in SUPPORTED_LANGUAGES:
        return profile.preferred_language
    return "en"


def get_or_create_contact(db: Session, parent: User) -> ParentContact:
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    if contact:
        return contact
    contact = ParentContact(
        parent_id=parent.id,
        guardian_name=parent.full_name,
        contact_type="email",
        notification_consent=True,
        weekly_reports_enabled=True,
    )
    db.add(contact)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    return contact


def get_or_create_preferences(db: Session, parent: User) -> ParentNotificationPreference:
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    if pref:
        return pref
    language = _language_for_parent(db, parent)
    pref = ParentNotificationPreference(
        parent_id=parent.id,
        frequency="weekly",
        enabled=True,
        preferred_channel="email",
        report_language=language,
    )
    db.add(pref)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        pref = db.query(ParentNotificationPreference).filter(
            ParentNotificationPreference.parent_id == parent.id
        ).first()
    return pref


def _issue_otp(contact: ParentContact) -> str:
    otp = generate_otp()
    now = utc_now()
    contact.otp_hash = hash_otp(contact.parent_id, otp)
    contact.otp_expires_at = now + datetime.timedelta(minutes=settings.PARENT_CONNECT_OTP_EXPIRE_MINUTES)
    contact.otp_sent_at = now
    contact.otp_attempts = 0
    contact.last_otp_channel = contact.contact_type
    return otp


def contact_snapshot(contact: Optional[ParentContact], preferences: Optional[ParentNotificationPreference] = None) -> Dict[str, Any]:
    if not contact:
        return {
            "registered": False,
            "contact_type": None,
            "destination": None,
            "is_verified": False,
            "verified_at": None,
            "notification_consent": False,
            "weekly_reports_enabled": False,
            "preferred_channel": getattr(preferences, "preferred_channel", None),
            "report_language": getattr(preferences, "report_language", None),
        }
    destination = mask_email(contact.email) if contact.contact_type == "email" else mask_phone(contact.phone)
    return {
        "registered": True,
        "guardian_name": contact.guardian_name,
        "relationship_type": contact.relationship_type,
        "contact_type": contact.contact_type,
        "destination": destination,
        "is_verified": bool(contact.is_verified),
        "verification_method": contact.verification_method,
        "verified_at": contact.verified_at,
        "notification_consent": bool(contact.notification_consent),
        "weekly_reports_enabled": bool(contact.weekly_reports_enabled),
        "preferred_channel": getattr(preferences, "preferred_channel", contact.contact_type),
        "report_language": getattr(preferences, "report_language", None),
        "otp_pending": bool(contact.otp_hash and contact.otp_expires_at and contact.otp_expires_at >= utc_now()),
        "otp_sent_at": contact.otp_sent_at,
    }


def register_contact(
    db: Session,
    parent: User,
    *,
    contact_type: str,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    guardian_name: Optional[str] = None,
    relationship_type: Optional[str] = None,
    notification_consent: bool = True,
    weekly_reports_enabled: bool = True,
    report_language: Optional[str] = None,
    send_otp: bool = True,
) -> Tuple[ParentContact, Optional[str], Optional[delivery.DeliveryResult]]:
    """Register or change a parent contact and issue a fresh OTP.

    Changing the channel, email, or phone resets verification. Re-submitting the
    exact already-verified value does not force another verification.
    """
    channel, clean_email, clean_phone = validate_contact(contact_type, email, phone)
    contact = get_or_create_contact(db, parent)
    if contact is None:  # pragma: no cover - defensive
        raise ParentConnectError("Could not save the contact. Please try again.", 500)

    same_channel = contact.contact_type == channel
    same_value = (
        (channel == "email" and (contact.email or "") == (clean_email or ""))
        or (channel == "sms" and (contact.phone or "") == (clean_phone or ""))
    )
    changed = not (same_channel and same_value)

    contact.contact_type = channel
    contact.email = clean_email if channel == "email" else None
    contact.phone = clean_phone if channel == "sms" else None
    contact.guardian_name = (guardian_name or contact.guardian_name or parent.full_name or "").strip() or parent.full_name
    contact.relationship_type = (relationship_type or contact.relationship_type or "parent").strip().lower()
    contact.notification_consent = bool(notification_consent)
    contact.weekly_reports_enabled = bool(weekly_reports_enabled)

    if changed:
        contact.is_verified = False
        contact.verified_at = None
        contact.verification_method = None
        contact.otp_hash = None
        contact.otp_expires_at = None
        contact.otp_sent_at = None
        contact.otp_attempts = 0

    pref = get_or_create_preferences(db, parent)
    pref.preferred_channel = channel
    if report_language:
        lang = str(report_language).strip().lower()
        if lang not in SUPPORTED_LANGUAGES:
            raise ParentConnectError("report_language must be one of: te, en, hi.")
        pref.report_language = lang
    pref.enabled = bool(weekly_reports_enabled and notification_consent)

    if not send_otp:
        db.commit()
        db.refresh(contact)
        return contact, None, None

    if not changed and contact.is_verified:
        # No need for another OTP when the verified value did not change.
        db.commit()
        db.refresh(contact)
        return contact, None, None

    otp = _issue_otp(contact)
    db.commit()
    db.refresh(contact)
    language = _language_for_parent(db, parent)
    result = send_contact_otp(contact, otp, language)
    if result.status == "sent":
        logger.info("ParentConnect OTP sent for parent %s via %s", parent.id, contact.contact_type)
    else:
        logger.warning(
            "ParentConnect OTP not delivered for parent %s: %s",
            parent.id,
            result.status,
        )
    return contact, otp, result


def resend_contact_otp(
    db: Session,
    parent: User,
) -> Tuple[ParentContact, str, delivery.DeliveryResult]:
    contact = get_or_create_contact(db, parent)
    if not contact or not (contact.email or contact.phone):
        raise ParentConnectError("Register an email or mobile number before requesting a code.", 400)
    if contact.otp_sent_at:
        elapsed = (utc_now() - contact.otp_sent_at).total_seconds()
        if elapsed < settings.PARENT_CONNECT_OTP_RESEND_SECONDS:
            retry_after = max(1, int(settings.PARENT_CONNECT_OTP_RESEND_SECONDS - elapsed))
            raise ParentConnectError(
                f"Please wait {retry_after} seconds before requesting another code.",
                429,
                retry_after=retry_after,
            )
    if contact.is_verified:
        raise ParentConnectError("This contact is already verified.", 400)
    otp = _issue_otp(contact)
    db.commit()
    db.refresh(contact)
    result = send_contact_otp(contact, otp, _language_for_parent(db, parent))
    return contact, otp, result


def verify_contact_otp(
    db: Session,
    parent: User,
    otp: str,
) -> ParentContact:
    contact = get_or_create_contact(db, parent)
    if not contact or not contact.otp_hash:
        raise ParentConnectError("No verification code is pending. Please request a new code.", 400)
    now = utc_now()
    if not contact.otp_expires_at or contact.otp_expires_at < now:
        contact.otp_hash = None
        contact.otp_expires_at = None
        db.commit()
        raise ParentConnectError("This verification code has expired. Please request a new code.", 400)
    max_attempts = max(1, settings.PARENT_CONNECT_OTP_MAX_ATTEMPTS)
    if (contact.otp_attempts or 0) >= max_attempts:
        raise ParentConnectError("Too many incorrect attempts. Please request a new code.", 429)

    clean = re.sub(r"\s+", "", otp or "")
    if not clean or not hmac.compare_digest(contact.otp_hash, hash_otp(parent.id, clean)):
        contact.otp_attempts = (contact.otp_attempts or 0) + 1
        db.commit()
        remaining = max(0, max_attempts - contact.otp_attempts)
        raise ParentConnectError(
            f"Incorrect verification code. {remaining} attempt(s) remaining.",
            400,
        )

    contact.is_verified = True
    contact.verified_at = now
    contact.verification_method = f"{contact.contact_type}_otp"
    contact.otp_hash = None
    contact.otp_expires_at = None
    contact.otp_attempts = 0

    pref = get_or_create_preferences(db, parent)
    pref.preferred_channel = contact.contact_type
    db.commit()
    db.refresh(contact)
    return contact


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------
def update_preferences(
    db: Session,
    parent: User,
    *,
    enabled: Optional[bool] = None,
    preferred_channel: Optional[str] = None,
    report_language: Optional[str] = None,
    notification_consent: Optional[bool] = None,
    weekly_reports_enabled: Optional[bool] = None,
    delivery_day: Optional[str] = None,
    delivery_time: Optional[str] = None,
) -> Tuple[ParentContact, ParentNotificationPreference]:
    contact = get_or_create_contact(db, parent)
    pref = get_or_create_preferences(db, parent)

    if notification_consent is not None:
        contact.notification_consent = bool(notification_consent)
    if weekly_reports_enabled is not None:
        contact.weekly_reports_enabled = bool(weekly_reports_enabled)
    if enabled is not None:
        pref.enabled = bool(enabled)
    if delivery_day is not None:
        pref.delivery_day = str(delivery_day).strip()
    if delivery_time is not None:
        pref.delivery_time = str(delivery_time).strip()
    if preferred_channel is not None:
        channel = str(preferred_channel).strip().lower()
        if channel not in CONTACT_TYPES:
            raise ParentConnectError("preferred_channel must be either 'email' or 'sms'.")
        pref.preferred_channel = channel
    if report_language is not None:
        lang = str(report_language).strip().lower()
        if lang not in SUPPORTED_LANGUAGES:
            raise ParentConnectError("report_language must be one of: te, en, hi.")
        pref.report_language = lang

    # Consent is the master switch for every phase-5 delivery.
    if not contact.notification_consent:
        contact.weekly_reports_enabled = False
        pref.enabled = False
    if not contact.weekly_reports_enabled:
        pref.enabled = False

    db.commit()
    db.refresh(contact)
    db.refresh(pref)
    return contact, pref


def delivery_eligibility(db: Session, parent: User, student: User) -> Dict[str, Any]:
    """Return whether a verified, consented contact may receive a report."""
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student.id,
        ParentStudentLink.status == "verified",
    ).first()
    if not link:
        return {"eligible": False, "reason": "skipped_no_relationship", "channel": None, "destination": None, "language": _language_for_parent(db, parent)}

    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    language = _language_for_parent(db, parent)

    if not contact or not (contact.email or contact.phone):
        return {"eligible": False, "reason": "skipped_no_contact", "channel": None, "destination": None, "language": language}
    if not contact.is_verified:
        return {"eligible": False, "reason": "skipped_unverified", "channel": contact.contact_type, "destination": None, "language": language}
    if not contact.notification_consent or not contact.weekly_reports_enabled:
        return {"eligible": False, "reason": "skipped_consent", "channel": contact.contact_type, "destination": None, "language": language}
    if pref and not pref.enabled:
        return {"eligible": False, "reason": "skipped_disabled", "channel": contact.contact_type, "destination": None, "language": language}

    channel = contact.contact_type if contact.contact_type in CONTACT_TYPES else "email"
    destination = contact.email if channel == "email" else contact.phone
    return {
        "eligible": True,
        "reason": None,
        "channel": channel,
        "destination": destination,
        "language": language,
        "contact": contact,
        "preferences": pref,
    }


# ---------------------------------------------------------------------------
# Report calculation
# ---------------------------------------------------------------------------
_LOCAL_COPY = {
    "en": {
        "strength": "{topic}: {accuracy}% accuracy across {attempts} questions.",
        "improvement": "{topic}: accuracy improved from {previous}% to {current}%.",
        "practice": "{topic}: {accuracy}% accuracy; needs more guided practice.",
        "practice_low_mastery": "{topic}: current understanding is {mastery}%.",
        "rec_weak": "Spend 10 focused minutes on {topic} using UDAAN guided practice.",
        "rec_detective": "Review this week's incorrect answers together in Find My Mistakes.",
        "rec_consistency": "Plan three short 10-minute practice sessions next week to build consistency.",
        "rec_keep": "Keep the current routine going; regular short practice is working.",
        "rec_inactive": "Plan one short 10-minute UDAAN session this week to restart learning.",
        "rec_inactive_together": "Open UDAAN together and choose one familiar topic for a gentle restart.",
        "comparison": "Compared with last week: {questions} questions ({questions_delta}), {accuracy}% accuracy ({accuracy_delta} points), and {minutes} minutes of learning ({minutes_delta} minutes).",
        "comparison_up": "Accuracy improved by {delta} points compared with last week.",
        "comparison_down": "Accuracy is {delta} points lower than last week; a short review can help.",
        "comparison_same": "Accuracy is steady compared with last week.",
        "strength_mastery": "{topic}: understanding is now {mastery}%.",
        "topic_unknown": "Topic {concept}",
    },
    "te": {
        "strength": "{topic}: {attempts} ప్రశ్నలలో {accuracy}% ఖచ్చితత్వం.",
        "improvement": "{topic}: ఖచ్చితత్వం {previous}% నుండి {current}%కి మెరుగుపడింది.",
        "practice": "{topic}: {accuracy}% ఖచ్చితత్వం; మరింత మార్గదర్శక సాధన అవసరం.",
        "practice_low_mastery": "{topic}: ప్రస్తుత అవగాహన {mastery}%.",
        "rec_weak": "{topic}పై UDAAN మార్గదర్శక సాధనతో 10 నిమిషాలు కేంద్రీకృతంగా సాధన చేయండి.",
        "rec_detective": "ఈ వారం తప్పు సమాధానాలను 'నా తప్పులను కనుగొనండి'లో కలిసి సమీక్షించండి.",
        "rec_consistency": "వచ్చే వారం మూడు చిన్న 10 నిమిషాల సాధన సెషన్లు ప్లాన్ చేయండి.",
        "rec_keep": "ప్రస్తుత దినచర్యను కొనసాగించండి; క్రమమైన చిన్న సాధన ఫలితమిస్తోంది.",
        "rec_inactive": "నేర్చుకోవడం మళ్లీ ప్రారంభించడానికి ఈ వారం ఒక 10 నిమిషాల UDAAN సెషన్ ప్లాన్ చేయండి.",
        "rec_inactive_together": "కలిసి UDAAN తెరిచి, తెలిసిన ఒక అంశంతో సున్నితంగా మళ్లీ ప్రారంభించండి.",
        "comparison": "గత వారంతో పోలిస్తే: {questions} ప్రశ్నలు ({questions_delta}), {accuracy}% ఖచ్చితత్వం ({accuracy_delta} పాయింట్లు), {minutes} నిమిషాల అభ్యాసం ({minutes_delta} నిమిషాలు).",
        "comparison_up": "గత వారంతో పోలిస్తే ఖచ్చితత్వం {delta} పాయింట్లు మెరుగుపడింది.",
        "comparison_down": "గత వారం కంటే ఖచ్చితత్వం {delta} పాయింట్లు తక్కువగా ఉంది; చిన్న సమీక్ష సహాయపడుతుంది.",
        "comparison_same": "గత వారంతో పోలిస్తే ఖచ్చితత్వం స్థిరంగా ఉంది.",
        "strength_mastery": "{topic}: అవగాహన ఇప్పుడు {mastery}%.",
        "topic_unknown": "అంశం {concept}",
    },
    "hi": {
        "strength": "{topic}: {attempts} प्रश्नों में {accuracy}% सटीकता.",
        "improvement": "{topic}: सटीकता {previous}% से {current}% तक सुधरी.",
        "practice": "{topic}: {accuracy}% सटीकता; अधिक मार्गदर्शित अभ्यास चाहिए.",
        "practice_low_mastery": "{topic}: वर्तमान समझ {mastery}% है.",
        "rec_weak": "{topic} पर UDAAN के मार्गदर्शित अभ्यास के साथ 10 मिनट ध्यान केंद्रित करें.",
        "rec_detective": "इस सप्ताह के गलत उत्तरों को 'अपनी गलतियाँ खोजें' में साथ में देखें.",
        "rec_consistency": "अगले सप्ताह तीन छोटे 10 मिनट के अभ्यास सत्र योजना बनाएं.",
        "rec_keep": "वर्तमान दिनचर्या जारी रखें; नियमित छोटा अभ्यास काम कर रहा है.",
        "rec_inactive": "सीखना फिर शुरू करने के लिए इस सप्ताह एक छोटा 10 मिनट का UDAAN सत्र योजना बनाएं.",
        "rec_inactive_together": "साथ में UDAAN खोलें और किसी परिचित विषय से धीरे से फिर शुरुआत करें.",
        "comparison": "पिछले सप्ताह की तुलना में: {questions} प्रश्न ({questions_delta}), {accuracy}% सटीकता ({accuracy_delta} अंक), और {minutes} मिनट अधिगम ({minutes_delta} मिनट).",
        "comparison_up": "पिछले सप्ताह की तुलना में सटीकता {delta} अंक बढ़ी.",
        "comparison_down": "पिछले सप्ताह से सटीकता {delta} अंक कम है; छोटी समीक्षा मदद कर सकती है.",
        "comparison_same": "पिछले सप्ताह की तुलना में सटीकता स्थिर है.",
        "strength_mastery": "{topic}: समझ अब {mastery}% है.",
        "topic_unknown": "विषय {concept}",
    },
}


def _copy(language: str) -> Dict[str, str]:
    return _LOCAL_COPY.get(language) or _LOCAL_COPY["en"]


def _concept_titles(db: Session, concept_ids: Iterable[str]) -> Dict[str, str]:
    ids = {cid for cid in concept_ids if cid}
    if not ids:
        return {}
    rows = db.query(Concept.id, Concept.title_en, Concept.title_te).filter(Concept.id.in_(ids)).all()
    titles: Dict[str, str] = {}
    for cid, title_en, title_te in rows:
        titles[cid] = (title_en or "").strip() or (title_te or "").strip() or cid
    return titles


def _mastery_map(db: Session, student_id: int, concept_ids: Iterable[str]) -> Dict[str, float]:
    ids = {cid for cid in concept_ids if cid}
    if not ids:
        return {}
    rows = db.query(ConceptMastery.concept_id, ConceptMastery.mastery_score).filter(
        ConceptMastery.user_id == student_id,
        ConceptMastery.concept_id.in_(ids),
    ).all()
    return {cid: float(score or 0.0) for cid, score in rows}


def _attempts_in_week(
    db: Session,
    student_id: int,
    week_start: datetime.date,
    week_end: datetime.date,
) -> List[Attempt]:
    start_utc = ist_date_start_utc(week_start)
    end_utc = ist_date_end_exclusive_utc(week_end)
    return db.query(Attempt).filter(
        Attempt.user_id == student_id,
        Attempt.created_at >= start_utc,
        Attempt.created_at < end_utc,
    ).order_by(Attempt.created_at.asc()).all()


def _compute_student_streak(db: Session, student_id: int, as_of_date: Optional[datetime.date] = None) -> int:
    cutoff_utc = ist_date_end_exclusive_utc(as_of_date) if as_of_date else utc_now()
    attempts = (
        db.query(Attempt)
        .filter(Attempt.user_id == student_id, Attempt.created_at < cutoff_utc)
        .order_by(Attempt.created_at.desc())
        .all()
    )
    if not attempts:
        return 0
    ref_date = as_of_date or ist_now().date()
    attempt_dates = sorted(
        {
            (a.created_at + datetime.timedelta(minutes=settings.PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES)).date()
            for a in attempts
            if a.created_at
        },
        reverse=True,
    )
    streak = 0
    check_date = ref_date
    for d in attempt_dates:
        if d == check_date or d == check_date - datetime.timedelta(days=1):
            streak += 1
            check_date = d
        elif d < check_date - datetime.timedelta(days=1):
            break
    return streak


def _topic_stats(
    db: Session,
    student_id: int,
    attempts: List[Attempt],
) -> List[Dict[str, Any]]:
    grouped: Dict[str, Dict[str, Any]] = {}
    for attempt in attempts:
        cid = attempt.concept_id
        bucket = grouped.setdefault(cid, {"concept_id": cid, "attempts": 0, "correct": 0})
        bucket["attempts"] += 1
        if attempt.is_correct:
            bucket["correct"] += 1
    titles = _concept_titles(db, grouped.keys())
    mastery = _mastery_map(db, student_id, grouped.keys())
    topics: List[Dict[str, Any]] = []
    for cid, bucket in grouped.items():
        attempts_count = bucket["attempts"]
        accuracy = round(bucket["correct"] / attempts_count * 100) if attempts_count else 0
        mastery_pct = round(mastery.get(cid, 0.0) * 100)
        status = "Mastered" if mastery_pct >= 70 else ("In Progress" if mastery_pct >= 40 else "Needs Practice")
        topics.append({
            "concept_id": cid,
            "title": titles.get(cid, cid),
            "attempts": attempts_count,
            "correct": bucket["correct"],
            "accuracy_pct": accuracy,
            "mastery_pct": mastery_pct,
            "status": status,
        })
    topics.sort(key=lambda item: (-item["attempts"], item["accuracy_pct"], item["title"]))
    return topics


def _activity_summary(
    attempts: List[Attempt],
    topics: List[Dict[str, Any]],
    mastery_scores: Dict[str, float],
    streak: int = 0,
) -> Dict[str, Any]:
    total = len(attempts)
    correct = sum(1 for attempt in attempts if attempt.is_correct)
    seconds = sum(float(attempt.time_spent_sec or 0) for attempt in attempts)
    active_days = len({
        (attempt.created_at + datetime.timedelta(minutes=settings.PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES)).date()
        for attempt in attempts
        if attempt.created_at
    })
    lessons_started = len({attempt.concept_id for attempt in attempts if attempt.concept_id})
    practiced_concepts = {attempt.concept_id for attempt in attempts if attempt.concept_id}
    lessons_completed = sum(
        1 for cid in practiced_concepts if mastery_scores.get(cid, 0.0) >= LESSON_COMPLETION_MASTERY
    )
    quiz_sessions = set()
    for attempt in attempts:
        if not attempt.created_at or not attempt.concept_id:
            continue
        local_date = (
            attempt.created_at + datetime.timedelta(minutes=settings.PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES)
        ).date()
        quiz_sessions.add((attempt.concept_id, local_date))
    return {
        "questions_attempted": total,
        "correct_answers": correct,
        "accuracy_pct": round(correct / total * 100) if total else 0,
        "learning_seconds": round(seconds),
        "learning_minutes": round(seconds / 60),
        "learning_streak": streak,
        "active_days": active_days,
        "lessons_started": lessons_started,
        "lessons_completed": lessons_completed,
        "quizzes_attempted": len(quiz_sessions),
        "hints_used": sum(int(attempt.hints_used or 0) for attempt in attempts),
    }


def _build_strengths(topics: List[Dict[str, Any]], language: str) -> List[str]:
    copy = _copy(language)
    strengths = []
    for topic in topics:
        if topic["attempts"] >= 2 and topic["accuracy_pct"] >= STRENGTH_ACCURACY_THRESHOLD:
            strengths.append(copy["strength"].format(
                topic=topic["title"],
                accuracy=topic["accuracy_pct"],
                attempts=topic["attempts"],
            ))
        elif topic["attempts"] >= 2 and topic["mastery_pct"] >= 75:
            strengths.append(copy["strength_mastery"].format(
                topic=topic["title"],
                mastery=topic["mastery_pct"],
            ))
    return strengths[:3]


def _build_improvements(
    current_topics: List[Dict[str, Any]],
    previous_topics: List[Dict[str, Any]],
    language: str,
) -> List[str]:
    if not previous_topics:
        return []
    copy = _copy(language)
    previous = {topic["concept_id"]: topic for topic in previous_topics}
    improvements = []
    for topic in current_topics:
        before = previous.get(topic["concept_id"])
        if not before or topic["attempts"] < 2:
            continue
        delta = topic["accuracy_pct"] - before["accuracy_pct"]
        if delta >= IMPROVEMENT_DELTA:
            improvements.append(copy["improvement"].format(
                topic=topic["title"],
                previous=before["accuracy_pct"],
                current=topic["accuracy_pct"],
            ))
    improvements.sort(key=lambda text: text, reverse=False)
    return improvements[:3]


def _build_needs_practice(topics: List[Dict[str, Any]], language: str) -> List[str]:
    copy = _copy(language)
    weak = []
    for topic in topics:
        if topic["attempts"] < 2:
            continue
        if topic["accuracy_pct"] < WEAK_ACCURACY_THRESHOLD:
            weak.append((topic["accuracy_pct"], copy["practice"].format(
                topic=topic["title"], accuracy=topic["accuracy_pct"]
            )))
        elif topic["mastery_pct"] and topic["mastery_pct"] < int(WEAK_MASTERY_THRESHOLD * 100):
            weak.append((topic["accuracy_pct"], copy["practice_low_mastery"].format(
                topic=topic["title"], mastery=topic["mastery_pct"]
            )))
    weak.sort(key=lambda item: item[0])
    return [text for _, text in weak[:3]]


def _call_gemini_recommendations(
    student_name: str,
    weak_topics: List[str],
    strengths: List[str],
    language: str,
) -> Optional[List[str]]:
    """Best-effort Gemini recommendations. Returns None when unavailable."""
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    language_name = {"te": "Telugu", "hi": "Hindi"}.get(language, "English")
    prompt = (
        "You are UDAAN's parent-facing learning coach. Based only on this real weekly data, "
        f"write 2-3 short, supportive, practical recommendations in {language_name}. "
        "Do not invent statistics. Return strict JSON: {\"recommendations\": [\"...\"]}.\n"
        f"Student: {student_name}\nWeak topics: {weak_topics or 'none'}\nStrengths: {strengths or 'none'}"
    )
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 300},
    }
    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=4) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            parsed = json.loads(text[start:end + 1])
            items = parsed.get("recommendations")
            if isinstance(items, list):
                clean = [str(item).strip() for item in items if str(item).strip()]
                if clean:
                    return clean[:3]
    except Exception as exc:  # pragma: no cover - external service
        logger.info("Gemini recommendation fallback used: %s", type(exc).__name__)
    return None


def _build_recommendations(
    student_name: str,
    activity: Dict[str, Any],
    topics: List[Dict[str, Any]],
    strengths: List[str],
    needs_practice: List[str],
    language: str,
    inactive: bool,
) -> Tuple[List[str], str]:
    copy = _copy(language)
    if inactive:
        return [copy["rec_inactive"], copy["rec_inactive_together"]], "rules"

    weak_titles = [topic["title"] for topic in topics if topic["accuracy_pct"] < WEAK_ACCURACY_THRESHOLD][:3]
    ai_items = _call_gemini_recommendations(student_name, weak_titles, strengths, language)
    if ai_items:
        return ai_items, "gemini"

    recommendations: List[str] = []
    for title in weak_titles[:2]:
        recommendations.append(copy["rec_weak"].format(topic=title))
    if activity["accuracy_pct"] < 60 and recommendations:
        recommendations.append(copy["rec_detective"])
    if activity["active_days"] < 3:
        recommendations.append(copy["rec_consistency"])
    if not recommendations:
        recommendations.append(copy["rec_keep"])
    return recommendations[:3], "rules"


def _comparison(
    current: Dict[str, Any],
    previous: Optional[Dict[str, Any]],
    language: str,
) -> Optional[Dict[str, Any]]:
    if not previous:
        return None
    copy = _copy(language)
    accuracy_delta = current["accuracy_pct"] - previous["accuracy_pct"]
    questions_delta = current["questions_attempted"] - previous["questions_attempted"]
    minutes_delta = current["learning_minutes"] - previous["learning_minutes"]
    summary = copy["comparison"].format(
        questions=current["questions_attempted"],
        questions_delta=f"{questions_delta:+d}",
        accuracy=current["accuracy_pct"],
        accuracy_delta=f"{accuracy_delta:+d}",
        minutes=current["learning_minutes"],
        minutes_delta=f"{minutes_delta:+d}",
    )
    if accuracy_delta >= IMPROVEMENT_DELTA:
        headline = copy["comparison_up"].format(delta=accuracy_delta)
    elif accuracy_delta <= -IMPROVEMENT_DELTA:
        headline = copy["comparison_down"].format(delta=abs(accuracy_delta))
    else:
        headline = copy["comparison_same"]
    return {
        "summary": summary,
        "headline": headline,
        "accuracy_delta": accuracy_delta,
        "questions_delta": questions_delta,
        "minutes_delta": minutes_delta,
        "previous_activity": previous,
    }


def build_weekly_report(
    db: Session,
    student: User,
    week_start: datetime.date,
    week_end: datetime.date,
    language: str = "en",
) -> Dict[str, Any]:
    """Build a report dictionary from real activity only."""
    language = language if language in SUPPORTED_LANGUAGES else "en"
    attempts = _attempts_in_week(db, student.id, week_start, week_end)
    topics = _topic_stats(db, student.id, attempts)
    mastery_scores = _mastery_map(db, student.id, [topic["concept_id"] for topic in topics])
    streak = _compute_student_streak(db, student.id, week_end)
    activity = _activity_summary(attempts, topics, mastery_scores, streak=streak)
    inactive = len(attempts) == 0

    topics_mastered = [t for t in topics if t.get("mastery_pct", 0) >= 70]
    topics_in_progress = [t for t in topics if 40 <= t.get("mastery_pct", 0) < 70]
    topics_needing_improvement = [t for t in topics if t.get("mastery_pct", 0) < 40 or t.get("accuracy_pct", 0) < 50]

    # Adaptive difficulties from real performance & misconceptions
    adaptive_difficulties: List[str] = []
    if not inactive:
        for t in topics:
            if t.get("accuracy_pct", 0) < 50 or t.get("mastery_pct", 0) < 45:
                adaptive_difficulties.append(
                    f"{t['title']}: Practice accuracy was {t.get('accuracy_pct')}% ({t.get('correct')}/{t.get('attempts')} correct). Needs conceptual reinforcement."
                )

    # Next recommended topics from curriculum
    all_concepts = db.query(Concept).all()
    mastered_cids = {t["concept_id"] for t in topics_mastered}
    recommended_next_topics = [
        getattr(c, "title_en", getattr(c, "title", c.id))
        for c in all_concepts if c.id not in mastered_cids
    ][:3]

    # Practical parent guidance and realistic weekly learning goal
    parent_recommendations = [
        "Encourage short, focused daily practice sessions of 15-20 minutes rather than one long session.",
        "Review mistake explanations together in the Learning Detective module to clarify concepts.",
        "Celebrate consistency: recognizing effort builds confidence and reinforces learning habits.",
    ]
    weekly_learning_goal = "Complete at least 20 practice questions across 3 sessions this week to advance mastery."

    previous_start = week_start - datetime.timedelta(days=7)
    previous_end = week_end - datetime.timedelta(days=7)
    previous_attempts = _attempts_in_week(db, student.id, previous_start, previous_end)
    previous_topics = _topic_stats(db, student.id, previous_attempts) if previous_attempts else []
    previous_mastery = _mastery_map(db, student.id, [topic["concept_id"] for topic in previous_topics])
    prev_streak = _compute_student_streak(db, student.id, previous_end)
    previous_activity = _activity_summary(previous_attempts, previous_topics, previous_mastery, streak=prev_streak) if previous_attempts else None

    strengths = [] if inactive else _build_strengths(topics, language)
    improvements = [] if inactive else _build_improvements(topics, previous_topics, language)
    needs_practice = [] if inactive else _build_needs_practice(topics, language)
    recommendations, recommendation_source = _build_recommendations(
        student.full_name or "Student",
        activity,
        topics,
        strengths,
        needs_practice,
        language,
        inactive,
    )
    comparison = _comparison(activity, previous_activity, language) if previous_activity else None

    diagnostic_count = 0
    try:
        start_utc = ist_date_start_utc(week_start)
        end_utc = ist_date_end_exclusive_utc(week_end)
        diagnostic_count = db.query(func.count(DiagnosticRecord.id)).filter(
            DiagnosticRecord.user_id == student.id,
            DiagnosticRecord.created_at >= start_utc,
            DiagnosticRecord.created_at < end_utc,
        ).scalar() or 0
    except Exception:  # pragma: no cover - diagnostic table optional in older DBs
        diagnostic_count = 0

    return {
        "student_id": student.id,
        "student_name": student.full_name,
        "class_name": student.class_name,
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "week_label": format_week_label(week_start, week_end),
        "language": language,
        "inactive": inactive,
        "activity": activity,
        "topics": topics,
        "topics_mastered": topics_mastered,
        "topics_in_progress": topics_in_progress,
        "topics_needing_improvement": topics_needing_improvement,
        "adaptive_difficulties": adaptive_difficulties,
        "recommended_next_topics": recommended_next_topics,
        "parent_recommendations": parent_recommendations,
        "weekly_learning_goal": weekly_learning_goal,
        "strengths": strengths,
        "improvements": improvements,
        "needs_practice": needs_practice,
        "recommendations": recommendations,
        "recommendation_source": recommendation_source,
        "previous_week": previous_activity,
        "comparison": comparison,
        "diagnostic_sessions": int(diagnostic_count),
        "generated_at": utc_now().isoformat() + "Z",
    }


def generate_report_for_pair(
    db: Session,
    parent: User,
    student: User,
    week_start: datetime.date,
    week_end: datetime.date,
    *,
    generated_by: str = "scheduler",
    language: Optional[str] = None,
) -> Tuple[WeeklyProgressReport, bool]:
    """Create (or return) the unique report for one student-parent-week."""
    existing = db.query(WeeklyProgressReport).filter(
        WeeklyProgressReport.student_id == student.id,
        WeeklyProgressReport.parent_id == parent.id,
        WeeklyProgressReport.week_start == week_start,
        WeeklyProgressReport.week_end == week_end,
    ).first()
    if existing:
        return existing, False

    report_language = language or _language_for_parent(db, parent)
    data = build_weekly_report(db, student, week_start, week_end, report_language)
    token = secrets.token_urlsafe(32)
    expires = utc_now() + datetime.timedelta(days=settings.PARENT_CONNECT_REPORT_LINK_DAYS)
    report = WeeklyProgressReport(
        student_id=student.id,
        parent_id=parent.id,
        week_start=week_start,
        week_end=week_end,
        report_data=json.dumps(data, ensure_ascii=False),
        delivery_status="pending",
        public_token=token,
        token_expires_at=expires,
        generated_by=generated_by,
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(WeeklyProgressReport).filter(
            WeeklyProgressReport.student_id == student.id,
            WeeklyProgressReport.parent_id == parent.id,
            WeeklyProgressReport.week_start == week_start,
            WeeklyProgressReport.week_end == week_end,
        ).first()
        if existing:
            return existing, False
        raise
    db.refresh(report)
    return report, True


# ---------------------------------------------------------------------------
# Delivery orchestration
# ---------------------------------------------------------------------------
def _sms_summary(report_data: Dict[str, Any], link: str, language: str) -> str:
    student = (report_data.get("student_name") or "Student").split()[0]
    week = report_data.get("week_label") or ""
    activity = report_data.get("activity") or {}
    copies = {
        "en": "UDAAN weekly update for {student} ({week}): {lessons} lesson(s) completed, {quizzes} practice set(s). Details: {link}",
        "te": "UDAAN వారపు నవీకరణ — {student} ({week}): {lessons} పాఠం(లు) పూర్తి, {quizzes} సాధన సెట్(లు). వివరాలు: {link}",
        "hi": "UDAAN साप्ताहिक अपडेट — {student} ({week}): {lessons} पाठ पूरे, {quizzes} अभ्यास सेट. विवरण: {link}",
    }
    if report_data.get("inactive"):
        copies = {
            "en": "UDAAN weekly update for {student} ({week}): no learning activity was recorded. Details: {link}",
            "te": "UDAAN వారపు నవీకరణ — {student} ({week}): ఈ వారం అభ్యాస కార్యకలాపం నమోదు కాలేదు. వివరాలు: {link}",
            "hi": "UDAAN साप्ताहिक अपडेट — {student} ({week}): इस सप्ताह कोई अधिगम गतिविधि दर्ज नहीं हुई. विवरण: {link}",
        }
    template = copies.get(language) or copies["en"]
    return template.format(
        student=student,
        week=week,
        lessons=activity.get("lessons_completed", 0),
        quizzes=activity.get("quizzes_attempted", 0),
        link=link,
    )


def deliver_report(
    db: Session,
    report: WeeklyProgressReport,
    *,
    force: bool = False,
    retry_count: int = 0,
) -> delivery.DeliveryResult:
    """Attempt delivery for a report according to consent and verification."""
    parent = db.query(User).filter(User.id == report.parent_id).first()
    student = db.query(User).filter(User.id == report.student_id).first()
    if not parent or not student:
        report.delivery_status = "failed"
        report.last_error = "Parent or student account no longer exists"
        db.commit()
        return delivery.DeliveryResult("email", "failed", error=report.last_error)

    eligibility = delivery_eligibility(db, parent, student)
    if not eligibility["eligible"]:
        report.delivery_status = eligibility["reason"]
        report.last_error = None
        db.commit()
        return delivery.DeliveryResult(
            eligibility.get("channel") or "unknown",
            "not_configured" if eligibility["reason"] == "skipped_no_contact" else "failed",
            error=eligibility["reason"],
        )

    contact: ParentContact = eligibility["contact"]
    language = eligibility["language"]
    report_data = json.loads(report.report_data or "{}")
    link = delivery.build_report_link(report.public_token or "")
    channel = contact.contact_type

    if channel == "sms":
        message = _sms_summary(report_data, link, language)
        result = delivery.send_sms(contact.phone or "", message)
    else:
        subject, html_body, text_body = delivery.render_report_email(
            report_data,
            link=link,
            token_expires_at=report.token_expires_at,
            language=language,
        )
        result = delivery.send_email(contact.email or "", subject, html_body, text_body)

    from app.models import NotificationLog

    log = NotificationLog(
        report_id=report.id,
        recipient=contact.email if channel == "email" else contact.phone,
        channel=channel,
        provider_message_id=result.provider_message_id,
        status=result.status,
        error_message=result.error,
        retry_count=retry_count,
    )
    db.add(log)

    report.delivery_channel = channel
    if result.status == "sent":
        report.delivery_status = "sent"
        report.sent_at = utc_now()
        report.last_error = None
    elif result.status == "not_configured":
        report.delivery_status = "not_configured"
        report.last_error = result.error
    else:
        report.delivery_status = "failed"
        report.last_error = (result.error or "Delivery failed")[:500]

    try:
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not persist ParentConnect delivery attempt for report %s", report.id)
    return result


def generate_and_deliver_for_pair(
    db: Session,
    parent: User,
    student: User,
    week_start: datetime.date,
    week_end: datetime.date,
    *,
    generated_by: str = "scheduler",
    force_delivery: bool = False,
) -> Tuple[WeeklyProgressReport, bool, Optional[delivery.DeliveryResult]]:
    report, created = generate_report_for_pair(
        db, parent, student, week_start, week_end, generated_by=generated_by
    )
    if created or force_delivery:
        result = deliver_report(db, report, force=force_delivery)
        db.refresh(report)
        return report, created, result
    return report, created, None


def generate_weekly_reports(
    db: Session,
    week_start: datetime.date,
    week_end: datetime.date,
    *,
    generated_by: str = "scheduler",
    retry_failed: bool = True,
) -> Dict[str, Any]:
    """Generate and deliver reports for every verified parent-child link."""
    links = db.query(ParentStudentLink).filter(ParentStudentLink.status == "verified").all()
    summary = {
        "week_start": week_start.isoformat(),
        "week_end": week_end.isoformat(),
        "links": len(links),
        "created": 0,
        "duplicates": 0,
        "sent": 0,
        "not_configured": 0,
        "skipped": 0,
        "failed": 0,
        "retried": 0,
    }
    seen_pairs = set()
    for link in links:
        pair = (link.parent_id, link.student_id)
        if pair in seen_pairs:
            continue
        seen_pairs.add(pair)
        parent = db.query(User).filter(User.id == link.parent_id, User.role.in_(["parent", "admin"])).first()
        student = db.query(User).filter(User.id == link.student_id, User.role == "student").first()
        if not parent or not student or not parent.is_active or not student.is_active:
            summary["skipped"] += 1
            continue
        try:
            report, created, result = generate_and_deliver_for_pair(
                db, parent, student, week_start, week_end, generated_by=generated_by
            )
        except Exception:
            db.rollback()
            logger.exception("ParentConnect report generation failed for parent %s student %s", link.parent_id, link.student_id)
            summary["failed"] += 1
            continue
        if created:
            summary["created"] += 1
        else:
            summary["duplicates"] += 1
        status = report.delivery_status
        if status == "sent":
            summary["sent"] += 1
        elif status == "not_configured":
            summary["not_configured"] += 1
        elif status == "failed":
            summary["failed"] += 1
        else:
            summary["skipped"] += 1

    if retry_failed:
        summary["retried"] = retry_failed_reports(db)
    return summary


def retry_failed_reports(
    db: Session,
    *,
    week_start: Optional[datetime.date] = None,
    limit: int = 50,
) -> int:
    """Retry failed deliveries that are still within the retry budget."""
    from app.models import NotificationLog

    query = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.delivery_status == "failed")
    if week_start:
        query = query.filter(WeeklyProgressReport.week_start == week_start)
    reports = query.order_by(WeeklyProgressReport.created_at.asc()).limit(max(1, limit)).all()
    retried = 0
    for report in reports:
        attempts = db.query(func.count(NotificationLog.id)).filter(
            NotificationLog.report_id == report.id
        ).scalar() or 0
        if attempts >= max(1, settings.PARENT_CONNECT_MAX_DELIVERY_RETRIES):
            continue
        result = deliver_report(db, report, retry_count=attempts)
        if result.status in ("sent", "failed"):
            retried += 1
    return retried


# ---------------------------------------------------------------------------
# Public link access
# ---------------------------------------------------------------------------
def get_report_by_token(db: Session, token: str) -> WeeklyProgressReport:
    report = db.query(WeeklyProgressReport).filter(
        WeeklyProgressReport.public_token == token
    ).first()
    if not report:
        raise ParentConnectError("This report link is invalid.", 404)
    if report.token_revoked_at:
        raise ParentConnectError("This report link has been revoked.", 410)
    if report.token_expires_at and report.token_expires_at < utc_now():
        raise ParentConnectError("This report link has expired.", 410)
    return report


def revoke_report_token(db: Session, report: WeeklyProgressReport) -> None:
    report.token_revoked_at = utc_now()
    db.commit()


def rotate_report_token(db: Session, report: WeeklyProgressReport) -> WeeklyProgressReport:
    report.public_token = secrets.token_urlsafe(32)
    report.token_expires_at = utc_now() + datetime.timedelta(days=settings.PARENT_CONNECT_REPORT_LINK_DAYS)
    report.token_revoked_at = None
    db.commit()
    db.refresh(report)
    return report


def report_summary(report: WeeklyProgressReport) -> Dict[str, Any]:
    data = json.loads(report.report_data or "{}")
    activity = data.get("activity") or {}
    return {
        "id": report.id,
        "student_id": report.student_id,
        "student_name": data.get("student_name"),
        "week_start": report.week_start,
        "week_end": report.week_end,
        "week_label": data.get("week_label"),
        "inactive": bool(data.get("inactive")),
        "activity": activity,
        "delivery_channel": report.delivery_channel,
        "delivery_status": report.delivery_status,
        "sent_at": report.sent_at,
        "created_at": report.created_at,
        "generated_by": report.generated_by,
        "recommendation_source": data.get("recommendation_source"),
    }


def report_detail(report: WeeklyProgressReport) -> Dict[str, Any]:
    data = json.loads(report.report_data or "{}")
    data["id"] = report.id
    data["delivery_channel"] = report.delivery_channel
    data["delivery_status"] = report.delivery_status
    data["sent_at"] = report.sent_at
    data["generated_by"] = report.generated_by
    data["public_link_active"] = bool(
        report.public_token
        and not report.token_revoked_at
        and (not report.token_expires_at or report.token_expires_at >= utc_now())
    )
    data["token_expires_at"] = report.token_expires_at
    return data


def can_parent_access_report(db: Session, parent: User, report: WeeklyProgressReport) -> bool:
    if parent.role == "admin":
        return True
    if report.parent_id != parent.id:
        return False
    return db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == report.student_id,
        ParentStudentLink.status == "verified",
    ).first() is not None


def provider_status() -> Dict[str, Any]:
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_name = days[settings.PARENT_CONNECT_SCHEDULE_WEEKDAY % 7]
    return {
        "email_provider": delivery.email_provider_label(),
        "email_configured": delivery.email_is_configured(),
        "sms_provider": delivery.sms_provider_label(),
        "sms_configured": delivery.sms_is_configured(),
        "scheduler_enabled": settings.PARENT_CONNECT_SCHEDULER_ENABLED,
        "schedule": f"{day_name} {settings.PARENT_CONNECT_SCHEDULE_HOUR:02d}:{settings.PARENT_CONNECT_SCHEDULE_MINUTE:02d} Asia/Kolkata",
        "timezone_offset_minutes": settings.PARENT_CONNECT_TIMEZONE_OFFSET_MINUTES,
        "report_link_days": settings.PARENT_CONNECT_REPORT_LINK_DAYS,
    }


def request_email_change(
    db: Session,
    parent: User,
    new_email: str,
) -> Tuple[ParentContact, str, delivery.DeliveryResult]:
    """Issues an OTP to verify a new email address before updating parent account."""
    clean_email = normalize_email(new_email)
    existing = db.query(User).filter(User.email == clean_email, User.id != parent.id).first()
    if existing:
        raise ParentConnectError("An account with this email address already exists.", 400)

    contact = get_or_create_contact(db, parent)
    now = utc_now()
    if contact.pending_email_otp_sent_at:
        elapsed = (now - contact.pending_email_otp_sent_at).total_seconds()
        if elapsed < settings.PARENT_CONNECT_OTP_RESEND_SECONDS:
            retry_after = max(1, int(settings.PARENT_CONNECT_OTP_RESEND_SECONDS - elapsed))
            raise ParentConnectError(f"Please wait {retry_after} seconds before requesting another code.", 429, retry_after=retry_after)

    otp = generate_otp()
    contact.pending_email = clean_email
    contact.pending_email_otp_hash = hash_otp(parent.id, otp)
    contact.pending_email_otp_expires_at = now + datetime.timedelta(minutes=settings.PARENT_CONNECT_OTP_EXPIRE_MINUTES)
    contact.pending_email_otp_sent_at = now
    contact.pending_email_otp_attempts = 0
    db.commit()

    subject = "Verify your new UDAAN email address"
    html_body = f"""<!doctype html><html><body style="font-family:sans-serif;padding:24px;background:#f8fafc;">
    <div style="max-width:500px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;">Verify New Email Address</h2>
      <p style="color:#475569;">Use this code to verify your new email address on UDAAN ParentConnect:</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
        <span style="font-size:32px;font-weight:800;letter-spacing:4px;color:#0e7490;">{otp}</span>
      </div>
      <p style="color:#64748b;font-size:12px;">Valid for {settings.PARENT_CONNECT_OTP_EXPIRE_MINUTES} minutes. If you did not request this change, please ignore.</p>
    </div></body></html>"""
    text_body = f"UDAAN verification code for new email: {otp} (expires in {settings.PARENT_CONNECT_OTP_EXPIRE_MINUTES} minutes)."

    result = delivery.send_email(clean_email, subject, html_body, text_body)
    return contact, otp, result


def verify_email_change(
    db: Session,
    parent: User,
    otp: str,
) -> ParentContact:
    """Verifies OTP and changes parent account email address."""
    contact = get_or_create_contact(db, parent)
    if not contact or not contact.pending_email_otp_hash or not contact.pending_email:
        raise ParentConnectError("No email change request is pending.", 400)

    now = utc_now()
    if not contact.pending_email_otp_expires_at or contact.pending_email_otp_expires_at < now:
        contact.pending_email = None
        contact.pending_email_otp_hash = None
        contact.pending_email_otp_expires_at = None
        db.commit()
        raise ParentConnectError("Verification code has expired. Please request a new code.", 400)

    max_attempts = settings.PARENT_CONNECT_OTP_MAX_ATTEMPTS
    if (contact.pending_email_otp_attempts or 0) >= max_attempts:
        raise ParentConnectError("Too many incorrect attempts. Please request a new code.", 429)

    clean_otp = re.sub(r"\s+", "", otp or "")
    if not hmac.compare_digest(contact.pending_email_otp_hash, hash_otp(parent.id, clean_otp)):
        contact.pending_email_otp_attempts = (contact.pending_email_otp_attempts or 0) + 1
        db.commit()
        remaining = max(0, max_attempts - contact.pending_email_otp_attempts)
        raise ParentConnectError(f"Invalid verification code. {remaining} attempt(s) remaining.", 400)

    new_email = contact.pending_email
    contact.email = new_email
    contact.is_verified = True
    contact.verified_at = now
    contact.verification_method = "email_otp"
    contact.pending_email = None
    contact.pending_email_otp_hash = None
    contact.pending_email_otp_expires_at = None
    contact.pending_email_otp_attempts = 0

    parent.email = new_email
    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    if profile:
        profile.is_verified = True

    db.commit()
    db.refresh(contact)
    return contact


def send_test_report_now(
    db: Session,
    parent: User,
    student_id: Optional[int] = None,
) -> Dict[str, Any]:
    """Immediately generates and sends a weekly report to the parent's verified email via Resend."""
    contact = get_or_create_contact(db, parent)
    if not contact or not contact.is_verified or not contact.email:
        raise ParentConnectError("Please verify your email address before sending test reports.", 400)

    query = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.status == "verified"
    )
    if student_id:
        query = query.filter(ParentStudentLink.student_id == student_id)
    link = query.first()

    if not link:
        raise ParentConnectError("No approved student connection found. Please connect to a student first.", 400)

    student = db.query(User).filter(User.id == link.student_id).first()
    if not student:
        raise ParentConnectError("Student not found.", 404)

    week_start, week_end = latest_completed_week()
    report, _ = generate_report_for_pair(
        db, parent, student, week_start, week_end, generated_by="test_manual"
    )

    result = deliver_report(db, report, force=True)
    db.refresh(report)

    return {
        "status": report.delivery_status,
        "channel": "email",
        "recipient": contact.email,
        "provider": delivery.email_provider_label(),
        "provider_message_id": result.provider_message_id if result else None,
        "error": report.last_error,
        "student_name": student.full_name,
        "week_label": format_week_label(week_start, week_end),
        "message": (
            f"Weekly progress report sent to {contact.email} via Resend."
            if report.delivery_status == "sent" else
            f"Report delivery status: {report.delivery_status}. {report.last_error or ''}"
        )
    }
