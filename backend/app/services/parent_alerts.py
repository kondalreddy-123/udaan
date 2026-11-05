"""
Evidence-based parent notifications (Phase 4).

Design rules
------------
* A single wrong answer must never trigger an alert.
* Every trigger needs repeated, measurable evidence from real attempts.
* Thresholds live in ``app.config.settings`` and can be tuned by operators.
* Alerts are supportive, non-judgemental, and localised into the parent's
  language at creation time.
* A per-parent/per-concept cooldown prevents duplicate or excessive alerts.
* External delivery (email) is optional. When it is not configured, the alert
  is still recorded in-app and the delivery status says ``not_configured``.
"""
from __future__ import annotations

import datetime
import logging
import smtplib
from email.message import EmailMessage
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Attempt, Concept, ConceptMastery, ParentContact, ParentNotification, ParentProfile,
    ParentStudentLink, ParentTeacherMessage, User,
)

logger = logging.getLogger("udaan.parent_alerts")

SUPPORTED_LANGUAGES = ("te", "en", "hi")

# ---------------------------------------------------------------------------
# Localised, plain-language copy. No BKT / mastery jargon is exposed to parents.
# ---------------------------------------------------------------------------
_COPY = {
    "repeated_mistakes": {
        "title": {
            "en": "Extra practice may help with {concept}",
            "te": "{concept} లో అదనపు సాధన సహాయపడవచ్చు",
            "hi": "{concept} में थोड़ा और अभ्यास मदद कर सकता है",
        },
        "body": {
            "en": "{student} is finding {concept} difficult right now. Practising a few short questions can help. The teacher can support if needed.",
            "te": "{student} ఇప్పుడు {concept} లో కొంచెం కష్టపడుతున్నారు. కొన్ని చిన్న ప్రశ్నలు సాధన చేస్తే సహాయపడుతుంది. అవసరమైతే ఉపాధ్యాయుడు సహాయం చేస్తారు.",
            "hi": "{student} को अभी {concept} में थोड़ी कठिनाई हो रही है। कुछ छोटे सवालों का अभ्यास मदद करेगा। ज़रूरत हो तो शिक्षक सहायता करेंगे।",
        },
    },
    "low_mastery": {
        "title": {
            "en": "Support with {concept}",
            "te": "{concept} లో సహాయం",
            "hi": "{concept} में सहायता",
        },
        "body": {
            "en": "{student} is still building confidence in {concept}. A short 10-minute practice at home would help. This is normal and improves with practice.",
            "te": "{student} ఇంకా {concept} లో నమ్మకం పెంచుకుంటున్నారు. ఇంట్లో రోజుకు 10 నిమిషాలు సాధన చేస్తే మంచిది. ఇది సాధారణం, సాధనతో మెరుగుపడుతుంది.",
            "hi": "{student} अभी {concept} में आत्मविश्वास बना रहे हैं। घर पर रोज़ 10 मिनट अभ्यास करना अच्छा रहेगा। यह सामान्य है और अभ्यास से सुधरता है।",
        },
    },
    "no_improvement": {
        "title": {
            "en": "A new way to practise {concept}",
            "te": "{concept} ను మరో విధంగా సాధన చేద్దాం",
            "hi": "{concept} का दूसरे तरीके से अभ्यास करें",
        },
        "body": {
            "en": "{student} has practised {concept} several times without much change yet. A different explanation from the teacher may help.",
            "te": "{student} {concept} ను చాలాసార్లు సాధన చేశారు, ఇంకా పెద్ద మార్పు లేదు. ఉపాధ్యాయుడు మరో విధంగా వివరిస్తే సహాయపడవచ్చు.",
            "hi": "{student} ने {concept} का कई बार अभ्यास किया है, फिर भी बड़ा बदलाव नहीं आया। शिक्षक द्वारा दूसरे तरीके से समझाना मदद कर सकता है।",
        },
    },
    "decline": {
        "title": {
            "en": "Let's check in on {concept}",
            "te": "{concept} గురించి ఒకసారి చూద్దాం",
            "hi": "{concept} पर एक बार चर्चा करें",
        },
        "body": {
            "en": "{student}'s recent results in {concept} have dipped a little. A short revision and a talk with the teacher can help.",
            "te": "{student} యొక్క ఇటీవలి {concept} ఫలితాలు కొంచెం తగ్గాయి. చిన్నసారి మళ్లీ చదివి, ఉపాధ్యాయుడితో మాట్లాడితే సహాయపడుతుంది.",
            "hi": "{student} के {concept} में हाल के नतीजे थोड़े कम हुए हैं। छोटा दोहराव और शिक्षक से बातचीत मदद करेगी।",
        },
    },
    "teacher_reply": {
        "title": {
            "en": "New message from {teacher}",
            "te": "{teacher} నుండి కొత్త సందేశం",
            "hi": "{teacher} की ओर से नया संदेश",
        },
        "body": {
            "en": "{teacher} replied about {student}: \"{subject}\". Open UDAAN to read the message and reply.",
            "te": "{teacher} {student} గురించి సమాధానం ఇచ్చారు: \"{subject}\". సందేశాన్ని చదవడానికి UDAAN తెరవండి.",
            "hi": "{teacher} ने {student} के बारे में जवाब दिया: \"{subject}\". संदेश पढ़ने के लिए UDAAN खोलें।",
        },
    },
    "teacher_initiated": {
        "title": {
            "en": "Message from {teacher}",
            "te": "{teacher} నుండి సందేశం",
            "hi": "{teacher} की ओर से संदेश",
        },
        "body": {
            "en": "{teacher} started a conversation about {student}: \"{subject}\". Open UDAAN to read the message and reply.",
            "te": "{teacher} {student} గురించి సంభాషణ ప్రారంభించారు: \"{subject}\". సందేశాన్ని చదవడానికి UDAAN తెరవండి.",
            "hi": "{teacher} ने {student} के बारे में बातचीत शुरू की: \"{subject}\". संदेश पढ़ने के लिए UDAAN खोलें।",
        },
    },
}


def _normalise_language(language: Optional[str]) -> str:
    return language if language in SUPPORTED_LANGUAGES else "en"


def _concept_title(concept: Optional[Concept], language: str, fallback: str) -> str:
    if not concept:
        return fallback
    if language == "te" and concept.title_te:
        return concept.title_te
    return concept.title_en or fallback


def _render(trigger: str, language: str, **values) -> tuple[str, str]:
    language = _normalise_language(language)
    template = _COPY.get(trigger)
    if not template:
        title = values.get("title") or "UDAAN update"
        body = values.get("body") or ""
        return title, body
    return template["title"][language].format(**values), template["body"][language].format(**values)


def _accuracy(attempts: Iterable[Attempt]) -> Optional[float]:
    rows = list(attempts)
    if not rows:
        return None
    return sum(1 for a in rows if a.is_correct) / len(rows)


def _group_by_day(attempts: Iterable[Attempt]) -> dict:
    grouped: dict = {}
    for attempt in attempts:
        when = attempt.created_at or datetime.datetime.utcnow()
        grouped.setdefault(when.date(), []).append(attempt)
    return grouped


def _delay_hours(hours: int) -> datetime.timedelta:
    return datetime.timedelta(hours=max(1, hours))


# ---------------------------------------------------------------------------
# Delivery
# ---------------------------------------------------------------------------
def email_is_configured() -> bool:
    return bool(settings.EMAIL_NOTIFICATIONS_ENABLED and settings.SMTP_HOST)


def _send_email(to_address: str, subject: str, body: str) -> bool:
    """Best-effort email delivery. Never raises and never logs credentials."""
    if not email_is_configured() or not to_address:
        return False
    try:
        message = EmailMessage()
        message["Subject"] = subject
        message["From"] = settings.SMTP_FROM
        message["To"] = to_address
        message.set_content(body)

        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=settings.SMTP_TIMEOUT_SECONDS) as server:
            if settings.SMTP_USE_TLS:
                server.starttls()
            if settings.SMTP_USER:
                server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(message)
        return True
    except Exception:  # pragma: no cover - depends on external provider
        logger.warning("Parent notification email delivery failed", exc_info=True)
        return False


def _get_profile(db: Session, parent_id: int) -> Optional[ParentProfile]:
    return db.query(ParentProfile).filter(ParentProfile.user_id == parent_id).first()


def _create_notification(
    db: Session,
    *,
    parent: User,
    student: User,
    trigger_type: str,
    title: str,
    body: str,
    language: str,
    category: str = "learning_support",
    severity: str = "support",
    concept_id: Optional[str] = None,
    message_id: Optional[int] = None,
    dedup_key: Optional[str] = None,
    now: Optional[datetime.datetime] = None,
) -> Optional[ParentNotification]:
    """Create one notification if the parent's consent and channels allow it."""
    now = now or datetime.datetime.utcnow()

    # Idempotency: a repeated call for the same logical event must not create
    # a second notification row or send a second email.
    if dedup_key:
        existing = db.query(ParentNotification).filter(
            ParentNotification.parent_id == parent.id,
            ParentNotification.dedup_key == dedup_key,
        ).first()
        if existing:
            return existing

    profile = _get_profile(db, parent.id)

    consent = profile.notifications_consent if profile else True
    wants_email = profile.notify_email if profile else False

    # In-app history is the guaranteed channel. When a parent has consented,
    # the notification is always recorded in the app even if they also asked
    # for email. Consent revocation is the only way to stop in-app alerts.
    if not consent:
        return None
    in_app = True

    email_status = "not_requested"
    email_sent_at = None
    if wants_email:
        contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
        verified_email = (
            contact.email
            if contact
            and bool(contact.is_verified)
            and (contact.contact_type or "email") == "email"
            and contact.email
            else None
        )
        if not email_is_configured():
            email_status = "not_configured"
        elif not verified_email:
            # Never send to an address the parent has not verified.
            email_status = "not_verified"
        elif _send_email(verified_email, title, body):
            email_status = "sent"
            email_sent_at = now
        else:
            email_status = "failed"

    record = ParentNotification(
        parent_id=parent.id,
        student_id=student.id,
        concept_id=concept_id,
        message_id=message_id,
        category=category,
        trigger_type=trigger_type,
        severity=severity,
        title=title,
        body=body,
        language=_normalise_language(language),
        is_read=False,
        in_app_delivered=bool(in_app),
        email_status=email_status,
        email_sent_at=email_sent_at,
        dedup_key=dedup_key,
        created_at=now,
    )
    db.add(record)
    return record


# ---------------------------------------------------------------------------
# Evidence evaluation
# ---------------------------------------------------------------------------
def _triggers_for_concept(
    *,
    mastery: ConceptMastery,
    concept_attempts: list,
    now: datetime.datetime,
) -> Optional[str]:
    """Return the strongest justified trigger for one concept, or None.

    Only repeated evidence is accepted. Trigger order also acts as a priority:
    a recent repeated-error pattern is more actionable than a general low score.
    """
    if not concept_attempts:
        return None

    wrong = [a for a in concept_attempts if not a.is_correct]
    distinct_wrong_questions = {a.question_id for a in wrong}
    days = sorted(_group_by_day(concept_attempts).keys())
    overall = _accuracy(concept_attempts) or 0.0

    # 1. Repeated mistakes across more than one question (not one bad answer).
    if (
        len(wrong) >= settings.PARENT_ALERT_REPEATED_WRONG
        and len(distinct_wrong_questions) >= 2
        and overall <= 0.6
    ):
        return "repeated_mistakes"

    # 2. Persistently low mastery after enough real assessment across 2+ days.
    if (
        (mastery.attempts_count or len(concept_attempts)) >= settings.PARENT_ALERT_MIN_ATTEMPTS
        and (mastery.mastery_score or 0.0) < settings.PARENT_ALERT_LOW_MASTERY
        and len(days) >= 2
    ):
        return "low_mastery"

    # 3. Several consecutive learning sessions with no upward movement.
    sessions_needed = max(2, settings.PARENT_ALERT_NO_IMPROVEMENT_SESSIONS)
    if len(days) >= sessions_needed and len(concept_attempts) >= settings.PARENT_ALERT_MIN_ATTEMPTS + 2:
        grouped = _group_by_day(concept_attempts)
        recent_days = days[-sessions_needed:]
        accuracies = [_accuracy(grouped[d]) or 0.0 for d in recent_days]
        if all(score <= 0.5 for score in accuracies) and (accuracies[-1] - accuracies[0]) <= 0.05:
            return "no_improvement"

    # 4. Genuine recent decline compared with the preceding weeks.
    recent_start = now - datetime.timedelta(days=7)
    prior_start = now - datetime.timedelta(days=21)
    recent = [a for a in concept_attempts if (a.created_at or now) >= recent_start]
    prior = [
        a for a in concept_attempts
        if prior_start <= (a.created_at or now) < recent_start
    ]
    recent_acc = _accuracy(recent)
    prior_acc = _accuracy(prior)
    if (
        len(recent) >= 3
        and len(prior) >= 3
        and recent_acc is not None
        and prior_acc is not None
        and recent_acc < 0.6
        and prior_acc - recent_acc >= settings.PARENT_ALERT_DECLINE_DELTA
    ):
        return "decline"

    return None


def evaluate_student_alerts(
    db: Session,
    student: User,
    now: Optional[datetime.datetime] = None,
) -> list[ParentNotification]:
    """Evaluate a student's real attempt history and create justified alerts.

    Safe to call on every attempt sync and on notification reads; the cooldown
    and dedup key make repeated calls idempotent.
    """
    now = now or datetime.datetime.utcnow()
    window_start = now - datetime.timedelta(days=max(1, settings.PARENT_ALERT_WINDOW_DAYS))

    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == student.id,
        ParentStudentLink.status == "verified",
    ).all()
    if not links:
        return []

    parents = []
    for link in links:
        parent = db.query(User).filter(User.id == link.parent_id, User.role == "parent").first()
        if parent:
            parents.append(parent)
    if not parents:
        return []

    masteries = db.query(ConceptMastery).filter(ConceptMastery.user_id == student.id).all()
    if not masteries:
        return []

    created: list[ParentNotification] = []
    cooldown_start = now - _delay_hours(settings.PARENT_ALERT_COOLDOWN_HOURS)

    # Evaluate the weakest concepts first so the per-run cap surfaces the most
    # important support need rather than an arbitrary concept.
    for mastery in sorted(masteries, key=lambda m: m.mastery_score or 0.0):
        concept = db.query(Concept).filter(Concept.id == mastery.concept_id).first()
        concept_label = _concept_title(concept, "en", mastery.concept_id)
        attempts = db.query(Attempt).filter(
            Attempt.user_id == student.id,
            Attempt.concept_id == mastery.concept_id,
            Attempt.created_at >= window_start,
        ).order_by(Attempt.created_at.asc()).all()
        if not attempts:
            continue

        trigger = _triggers_for_concept(mastery=mastery, concept_attempts=attempts, now=now)
        if not trigger:
            continue

        # One alert per family per concept in the cooldown window, even if the
        # trigger naturally shifts from e.g. low_mastery to no_improvement.
        for parent in parents:
            if len(created) >= max(1, settings.PARENT_ALERT_MAX_PER_RUN):
                return created

            recent_concept_alert = db.query(ParentNotification).filter(
                ParentNotification.parent_id == parent.id,
                ParentNotification.student_id == student.id,
                ParentNotification.concept_id == mastery.concept_id,
                ParentNotification.created_at >= cooldown_start,
            ).first()
            if recent_concept_alert:
                continue

            # Re-check exact dedup key to stay idempotent across concurrent calls.
            dedup_key = f"{student.id}:{mastery.concept_id}:{trigger}"
            duplicate = db.query(ParentNotification).filter(
                ParentNotification.parent_id == parent.id,
                ParentNotification.dedup_key == dedup_key,
                ParentNotification.created_at >= cooldown_start,
            ).first()
            if duplicate:
                continue

            profile = _get_profile(db, parent.id)
            language = _normalise_language(profile.preferred_language if profile else "en")
            title, body = _render(
                trigger,
                language,
                student=student.full_name.split(" ")[0] if student.full_name else "Your child",
                concept=_concept_title(concept, language, concept_label),
            )
            record = _create_notification(
                db,
                parent=parent,
                student=student,
                trigger_type=trigger,
                title=title,
                body=body,
                language=language,
                concept_id=mastery.concept_id,
                dedup_key=dedup_key,
                now=now,
            )
            if record:
                created.append(record)

    return created


def notify_parent_of_teacher_reply(
    db: Session,
    message: ParentTeacherMessage,
    teacher: User,
    *,
    reply_id: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> Optional[ParentNotification]:
    """Tell a parent about a teacher reply (one notification per reply)."""
    now = now or datetime.datetime.utcnow()
    parent = db.query(User).filter(User.id == message.parent_id, User.role == "parent").first()
    student = db.query(User).filter(User.id == message.student_id).first()
    if not parent or not student:
        return None

    profile = _get_profile(db, parent.id)
    language = _normalise_language(profile.preferred_language if profile else "en")
    title, body = _render(
        "teacher_reply",
        language,
        teacher=teacher.full_name,
        student=student.full_name.split(" ")[0] if student.full_name else "your child",
        subject=message.subject,
    )
    return _create_notification(
        db,
        parent=parent,
        student=student,
        trigger_type="teacher_reply",
        title=title,
        body=body,
        language=language,
        category="teacher_message",
        severity="info",
        message_id=message.id,
        dedup_key=f"msg:{message.id}:reply:{reply_id or 'new'}",
        now=now,
    )


def notify_parent_of_teacher_message(
    db: Session,
    message: ParentTeacherMessage,
    teacher: User,
    *,
    now: Optional[datetime.datetime] = None,
) -> Optional[ParentNotification]:
    """Tell a parent that a teacher started a new conversation (one per thread)."""
    now = now or datetime.datetime.utcnow()
    parent = db.query(User).filter(User.id == message.parent_id, User.role == "parent").first()
    student = db.query(User).filter(User.id == message.student_id).first()
    if not parent or not student:
        return None

    profile = _get_profile(db, parent.id)
    language = _normalise_language(profile.preferred_language if profile else "en")
    title, body = _render(
        "teacher_initiated",
        language,
        teacher=teacher.full_name,
        student=student.full_name.split(" ")[0] if student.full_name else "your child",
        subject=message.subject,
    )
    return _create_notification(
        db,
        parent=parent,
        student=student,
        trigger_type="teacher_initiated",
        title=title,
        body=body,
        language=language,
        category="teacher_message",
        severity="info",
        message_id=message.id,
        dedup_key=f"msg:{message.id}:reply:new",
        now=now,
    )
