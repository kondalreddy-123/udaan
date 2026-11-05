"""Delivery providers for ParentConnect (Phase 5).

External delivery is deliberately honest: a message is only reported as
``sent`` when the configured provider accepts it. Missing credentials produce
``not_configured``; provider failures produce ``failed`` with a sanitised error.

Credentials are read only from backend environment variables (via settings) and
are never returned to the frontend or written to logs.
"""
from __future__ import annotations

import base64
import datetime
import html
import json
import logging
import smtplib
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Any, Dict, Optional

from app.config import settings

logger = logging.getLogger("udaan.parent_connect.delivery")

# Cloudflare (fronting the Resend/MSG91 APIs) rejects urllib's default
# ``Python-urllib/x.y`` User-Agent with "403 error code: 1010" before the
# request ever reaches the provider. Always identify ourselves explicitly.
_HTTP_USER_AGENT = "UDAAN-ParentConnect/1.0 (+https://udaan-navigator.vercel.app)"


@dataclass
class DeliveryResult:
    channel: str
    status: str  # sent, failed, not_configured
    provider_message_id: Optional[str] = None
    error: Optional[str] = None


def _safe_error(exc: BaseException) -> str:
    text = f"{type(exc).__name__}: {exc}"
    text = text.replace("\n", " ").replace("\r", " ")
    # Never allow credentials to leak through provider error bodies.
    for secret in (
        settings.SMTP_PASSWORD,
        settings.RESEND_API_KEY,
        settings.MSG91_AUTH_KEY,
        settings.TWILIO_AUTH_TOKEN,
    ):
        if secret:
            text = text.replace(secret, "***")
    return text[:480]


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------
def email_provider() -> str:
    provider = (settings.PARENT_CONNECT_EMAIL_PROVIDER or "disabled").lower()
    if provider not in ("smtp", "resend"):
        return "disabled"
    return provider


def email_is_configured() -> bool:
    provider = email_provider()
    if provider == "smtp":
        return bool(settings.SMTP_HOST)
    if provider == "resend":
        return bool(settings.RESEND_API_KEY)
    return False


def email_provider_label() -> str:
    provider = email_provider()
    return provider if provider != "disabled" else "not_configured"


def _send_email_smtp(to_address: str, subject: str, html_body: str, text_body: str) -> DeliveryResult:
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = settings.PARENT_CONNECT_EMAIL_FROM or settings.SMTP_FROM
    message["To"] = to_address
    message.set_content(text_body or "Please open this email in an HTML-capable client.")
    message.add_alternative(html_body, subtype="html")

    with smtplib.SMTP(
        settings.SMTP_HOST,
        settings.SMTP_PORT,
        timeout=settings.SMTP_TIMEOUT_SECONDS,
    ) as server:
        if settings.SMTP_USE_TLS:
            server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(message)
    return DeliveryResult(channel="email", status="sent", provider_message_id=None)


def _send_email_resend(to_address: str, subject: str, html_body: str, text_body: str) -> DeliveryResult:
    payload = {
        "from": settings.PARENT_CONNECT_EMAIL_FROM,
        "to": [to_address],
        "subject": subject,
        "html": html_body,
        "text": text_body,
    }
    request = urllib.request.Request(
        settings.RESEND_API_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": _HTTP_USER_AGENT,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=settings.EMAIL_TIMEOUT_SECONDS) as response:
            body = response.read().decode("utf-8", errors="replace")
        provider_id = None
        try:
            provider_id = json.loads(body).get("id")
        except Exception:
            provider_id = None
        return DeliveryResult(channel="email", status="sent", provider_message_id=provider_id)
    except urllib.error.HTTPError as exc:
        err_msg = ""
        try:
            err_body = exc.read().decode("utf-8", errors="replace")
            err_json = json.loads(err_body)
            err_msg = err_json.get("message") or err_json.get("error") or err_body
        except Exception:
            err_msg = str(exc)
        safe_msg = f"Resend API error ({exc.code}): {err_msg}"
        if settings.RESEND_API_KEY:
            safe_msg = safe_msg.replace(settings.RESEND_API_KEY, "***")
        logger.warning("Resend email delivery failed: %s", safe_msg)
        return DeliveryResult(channel="email", status="failed", error=safe_msg[:480])
    except urllib.error.URLError as exc:
        safe_msg = f"Resend network error: {exc.reason}"
        if settings.RESEND_API_KEY:
            safe_msg = safe_msg.replace(settings.RESEND_API_KEY, "***")
        return DeliveryResult(channel="email", status="failed", error=safe_msg[:480])


def send_email(
    to_address: str,
    subject: str,
    html_body: str,
    text_body: str = "",
) -> DeliveryResult:
    """Send one email. Never raises and never logs credentials."""
    if not to_address:
        return DeliveryResult(channel="email", status="failed", error="Missing recipient email")
    provider = email_provider()
    if not email_is_configured():
        return DeliveryResult(
            channel="email",
            status="not_configured",
            error="Email provider is not configured on the backend",
        )
    try:
        if provider == "smtp":
            return _send_email_smtp(to_address, subject, html_body, text_body)
        if provider == "resend":
            return _send_email_resend(to_address, subject, html_body, text_body)
        return DeliveryResult(channel="email", status="not_configured", error="Unknown email provider")
    except Exception as exc:  # pragma: no cover - depends on external provider
        logger.warning("ParentConnect email delivery failed: %s", _safe_error(exc))
        return DeliveryResult(channel="email", status="failed", error=_safe_error(exc))


# ---------------------------------------------------------------------------
# SMS
# ---------------------------------------------------------------------------
def sms_provider() -> str:
    provider = (settings.PARENT_CONNECT_SMS_PROVIDER or "disabled").lower()
    if provider not in ("msg91", "twilio"):
        return "disabled"
    return provider


def sms_is_configured() -> bool:
    provider = sms_provider()
    if provider == "msg91":
        return bool(settings.MSG91_AUTH_KEY and settings.MSG91_TEMPLATE_ID)
    if provider == "twilio":
        return bool(
            settings.TWILIO_ACCOUNT_SID
            and settings.TWILIO_AUTH_TOKEN
            and settings.TWILIO_FROM_NUMBER
        )
    return False


def sms_provider_label() -> str:
    provider = sms_provider()
    return provider if provider != "disabled" else "not_configured"


def _send_sms_msg91(
    phone: str,
    message: str,
    variables: Optional[Dict[str, str]],
) -> DeliveryResult:
    digits = phone.lstrip("+")
    if digits.startswith("91") and len(digits) == 12:
        mobile = digits[2:]
    else:
        mobile = digits
    payload: Dict[str, Any] = {
        "template_id": settings.MSG91_TEMPLATE_ID,
        "recipients": [{"mobiles": mobile}],
    }
    # DLT-approved flow templates require named variables. Operators configure
    # the same names in their MSG91 template (OTP, LINK, MESSAGE).
    merged = {"MESSAGE": message}
    if variables:
        merged.update({str(k): str(v) for k, v in variables.items()})
    payload["recipients"][0].update(merged)
    if settings.MSG91_SENDER_ID:
        payload["sender"] = settings.MSG91_SENDER_ID

    request = urllib.request.Request(
        settings.MSG91_FLOW_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "authkey": settings.MSG91_AUTH_KEY,
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": _HTTP_USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=settings.SMS_TIMEOUT_SECONDS) as response:
        body = response.read().decode("utf-8", errors="replace")
    provider_id = None
    try:
        parsed = json.loads(body)
        provider_id = parsed.get("message") or parsed.get("request_id")
    except Exception:
        provider_id = None
    return DeliveryResult(channel="sms", status="sent", provider_message_id=provider_id)


def _send_sms_twilio(
    phone: str,
    message: str,
    variables: Optional[Dict[str, str]],
) -> DeliveryResult:
    url = (
        "https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.TWILIO_ACCOUNT_SID}/Messages.json"
    )
    data = urllib.parse.urlencode(
        {
            "From": settings.TWILIO_FROM_NUMBER,
            "To": phone,
            "Body": message,
        }
    ).encode("utf-8")
    auth = base64.b64encode(
        f"{settings.TWILIO_ACCOUNT_SID}:{settings.TWILIO_AUTH_TOKEN}".encode()
    ).decode()
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": _HTTP_USER_AGENT,
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=settings.SMS_TIMEOUT_SECONDS) as response:
        body = response.read().decode("utf-8", errors="replace")
    provider_id = None
    try:
        provider_id = json.loads(body).get("sid")
    except Exception:
        provider_id = None
    return DeliveryResult(channel="sms", status="sent", provider_message_id=provider_id)


def send_sms(
    phone: str,
    message: str,
    variables: Optional[Dict[str, str]] = None,
) -> DeliveryResult:
    """Send one SMS. Never raises and never logs credentials."""
    if not phone:
        return DeliveryResult(channel="sms", status="failed", error="Missing recipient phone")
    provider = sms_provider()
    if not sms_is_configured():
        return DeliveryResult(
            channel="sms",
            status="not_configured",
            error="SMS provider is not configured on the backend",
        )
    try:
        if provider == "msg91":
            return _send_sms_msg91(phone, message, variables)
        if provider == "twilio":
            return _send_sms_twilio(phone, message, variables)
        return DeliveryResult(channel="sms", status="not_configured", error="Unknown SMS provider")
    except urllib.error.HTTPError as exc:
        # Provider error bodies can contain request metadata; keep only status.
        return DeliveryResult(
            channel="sms",
            status="failed",
            error=f"Provider HTTP {exc.code}",
        )
    except Exception as exc:  # pragma: no cover - depends on external provider
        logger.warning("ParentConnect SMS delivery failed: %s", _safe_error(exc))
        return DeliveryResult(channel="sms", status="failed", error=_safe_error(exc))


# ---------------------------------------------------------------------------
# Secure report links
# ---------------------------------------------------------------------------
def build_report_link(token: str) -> str:
    base = settings.PARENT_CONNECT_PUBLIC_APP_URL
    return f"{base}/?report_token={urllib.parse.quote(token, safe='')}"


# ---------------------------------------------------------------------------
# Branded responsive email
# ---------------------------------------------------------------------------
_EMAIL_COPY = {
    "en": {
        "subject": "UDAAN weekly learning report for {student} ({week})",
        "preheader": "A weekly summary of real learning activity on UDAAN.",
        "brand": "UDAAN",
        "tagline": "Understanding-Driven Adaptive Academic Navigator",
        "title": "Weekly learning report",
        "for_student": "For {student}",
        "week": "Reporting week",
        "inactive_title": "A quiet week",
        "inactive_body": "There was no recorded learning activity this week. No performance statistics have been estimated. A short practice session this week can restart the learning streak.",
        "summary": "This week at a glance",
        "lessons": "Lessons completed",
        "lessons_started": "Lessons started",
        "quizzes": "Quizzes / practice sets",
        "accuracy": "Question accuracy",
        "time": "Learning time",
        "days": "Active days",
        "questions": "Questions attempted",
        "previous": "Compared with last week",
        "previous_none": "Not enough history from last week for a comparison.",
        "topics": "Topic performance",
        "topic": "Topic",
        "attempts": "Questions",
        "mastery": "Understanding",
        "strengths": "Strengths",
        "improvements": "Improvements",
        "practice": "Areas needing practice",
        "recommendations": "AI learning recommendations",
        "cta": "Open the detailed report",
        "cta_note": "This secure link expires on {expires}. Please do not forward it.",
        "footer": "You receive this report because you are a verified parent or guardian and agreed to weekly updates. You can change or stop these reports in your UDAAN profile.",
        "no_topics": "No topic data was recorded this week.",
        "no_strengths": "No strengths are reported for a week without activity.",
        "no_practice": "No practice areas are reported for a week without activity.",
        "teacher_note": "Your child's teacher can support with any topic that needs more practice.",
    },
    "te": {
        "subject": "UDAAN వారపు అభ్యాస నివేదిక — {student} ({week})",
        "preheader": "UDAAN లో నిజమైన అభ్యాస కార్యకలాపాల వారపు సారాంశం.",
        "brand": "UDAAN",
        "tagline": "అర్థం చేసుకుని నేర్చుకునే అనుకూల అభ్యాస సహాయకం",
        "title": "వారపు అభ్యాస నివేదిక",
        "for_student": "{student} కోసం",
        "week": "నివేదిక వారం",
        "inactive_title": "ఈ వారం ప్రశాంతంగా గడిచింది",
        "inactive_body": "ఈ వారం ఎలాంటి అభ్యాస కార్యకలాపం నమోదు కాలేదు. ఊహాత్మక గణాంకాలు ఇవ్వబడలేదు. ఈ వారం కొద్దిసేపు సాధన చేస్తే నేర్చుకునే వరుస మళ్లీ ప్రారంభమవుతుంది.",
        "summary": "ఈ వారం ఒక చూపులో",
        "lessons": "పూర్తి చేసిన పాఠాలు",
        "lessons_started": "ప్రారంభించిన పాఠాలు",
        "quizzes": "క్విజ్ / సాధన సెట్లు",
        "accuracy": "ప్రశ్నల ఖచ్చితత్వం",
        "time": "అభ్యాస సమయం",
        "days": "క్రియాశీల రోజులు",
        "questions": "ప్రయత్నించిన ప్రశ్నలు",
        "previous": "గత వారంతో పోలిక",
        "previous_none": "పోలిక కోసం గత వారం సరిపడిన చరిత్ర లేదు.",
        "topics": "అంశాల పనితీరు",
        "topic": "అంశం",
        "attempts": "ప్రశ్నలు",
        "mastery": "అవగాహన",
        "strengths": "బలాలు",
        "improvements": "మెరుగుదలలు",
        "practice": "అదనపు సాధన అవసరమైన అంశాలు",
        "recommendations": "AI అభ్యాస సూచనలు",
        "cta": "వివరమైన నివేదిక తెరవండి",
        "cta_note": "ఈ సురక్షిత లింక్ {expires}న ముగుస్తుంది. దయచేసి ఇతరులకు పంపవద్దు.",
        "footer": "మీరు ధృవీకరించబడిన తల్లిదండ్రులు/సంరక్షకులు మరియు వారపు నవీకరణలకు అంగీకరించినందున ఈ నివేదిక వస్తోంది. UDAAN ప్రొఫైల్‌లో దీన్ని మార్చవచ్చు లేదా ఆపవచ్చు.",
        "no_topics": "ఈ వారం ఎలాంటి అంశాల డేటా నమోదు కాలేదు.",
        "no_strengths": "కార్యకలాపం లేని వారానికి బలాలు నివేదించబడవు.",
        "no_practice": "కార్యకలాపం లేని వారానికి సాధన అంశాలు నివేదించబడవు.",
        "teacher_note": "అదనపు సాధన అవసరమైన ఏ అంశంలోనైనా మీ పిల్లల ఉపాధ్యాయుడు సహాయం చేయగలరు.",
    },
    "hi": {
        "subject": "UDAAN साप्ताहिक अधिगम रिपोर्ट — {student} ({week})",
        "preheader": "UDAAN पर वास्तविक अधिगम गतिविधि का साप्ताहिक सारांश।",
        "brand": "UDAAN",
        "tagline": "समझ से सीखने वाला अनुकूली अधिगम साथी",
        "title": "साप्ताहिक अधिगम रिपोर्ट",
        "for_student": "{student} के लिए",
        "week": "रिपोर्ट सप्ताह",
        "inactive_title": "शांत सप्ताह",
        "inactive_body": "इस सप्ताह कोई अधिगम गतिविधि दर्ज नहीं हुई। कोई अनुमानित आँकड़े नहीं दिए गए हैं। इस सप्ताह थोड़ा अभ्यास करने से सीखने की लय फिर शुरू हो सकती है।",
        "summary": "इस सप्ताह एक नज़र में",
        "lessons": "पूरे किए गए पाठ",
        "lessons_started": "शुरू किए गए पाठ",
        "quizzes": "क्विज़ / अभ्यास सेट",
        "accuracy": "प्रश्नों की सटीकता",
        "time": "अधिगम समय",
        "days": "सक्रिय दिन",
        "questions": "प्रयास किए गए प्रश्न",
        "previous": "पिछले सप्ताह से तुलना",
        "previous_none": "तुलना के लिए पिछले सप्ताह का पर्याप्त इतिहास नहीं है।",
        "topics": "विषय-वार प्रदर्शन",
        "topic": "विषय",
        "attempts": "प्रश्न",
        "mastery": "समझ",
        "strengths": "ताकत",
        "improvements": "सुधार",
        "practice": "अधिक अभ्यास वाले विषय",
        "recommendations": "AI अधिगम सुझाव",
        "cta": "विस्तृत रिपोर्ट खोलें",
        "cta_note": "यह सुरक्षित लिंक {expires} को समाप्त होगा। कृपया इसे आगे न भेजें।",
        "footer": "आपको यह रिपोर्ट इसलिए मिलती है क्योंकि आप सत्यापित माता-पिता/अभिभावक हैं और साप्ताहिक अपडेट के लिए सहमत हैं। आप UDAAN प्रोफ़ाइल में इसे बदल या बंद कर सकते हैं।",
        "no_topics": "इस सप्ताह कोई विषय डेटा दर्ज नहीं हुआ।",
        "no_strengths": "गतिविधि के बिना सप्ताह के लिए ताकत की रिपोर्ट नहीं दी जाती।",
        "no_practice": "गतिविधि के बिना सप्ताह के लिए अभ्यास विषयों की रिपोर्ट नहीं दी जाती।",
        "teacher_note": "जिस विषय में अधिक अभ्यास की ज़रूरत हो, उसमें आपके बच्चे के शिक्षक सहायता कर सकते हैं।",
    },
}


def _email_copy(language: str) -> Dict[str, str]:
    return _EMAIL_COPY.get(language) or _EMAIL_COPY["en"]


def _e(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def render_report_email(
    report_data: Dict[str, Any],
    *,
    link: str,
    token_expires_at: Optional[datetime.datetime] = None,
    language: str = "en",
) -> tuple[str, str, str]:
    """Return (subject, html, text) for a weekly report email."""
    copy = _email_copy(language)
    student = report_data.get("student_name") or "Student"
    week_start = report_data.get("week_start") or ""
    week_end = report_data.get("week_end") or ""
    week_label = f"{week_start} – {week_end}" if week_start and week_end else ""
    subject = copy["subject"].format(student=student, week=week_label)

    activity = report_data.get("activity") or {}
    inactive = bool(report_data.get("inactive"))
    topics = report_data.get("topics") or []
    strengths = report_data.get("strengths") or []
    improvements = report_data.get("improvements") or []
    practice = report_data.get("needs_practice") or []
    recommendations = report_data.get("recommendations") or []
    previous = report_data.get("previous_week")
    comparison = report_data.get("comparison")

    expires_label = ""
    if token_expires_at:
        expires_label = token_expires_at.strftime("%d %b %Y, %H:%M UTC")

    def stat_card(label: str, value: Any, accent: str = "#0ea5e9") -> str:
        return f"""
        <td style="width:50%;padding:8px;vertical-align:top;">
          <div style="background:#ffffff;border:1px solid #e2e8f0;border-left:4px solid {accent};border-radius:10px;padding:14px;">
            <div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;font-weight:700;">{_e(label)}</div>
            <div style="font-size:24px;line-height:1.2;color:#0f172a;font-weight:800;margin-top:4px;">{_e(value)}</div>
          </div>
        </td>"""

    stats = [
        (copy["lessons"], activity.get("lessons_completed", 0), "#10b981"),
        (copy["lessons_started"], activity.get("lessons_started", 0), "#0ea5e9"),
        (copy["quizzes"], activity.get("quizzes_attempted", 0), "#8b5cf6"),
        (copy["accuracy"], f"{activity.get('accuracy_pct', 0)}%", "#f59e0b"),
        (copy["time"], f"{activity.get('learning_minutes', 0)} min", "#14b8a6"),
        (copy["days"], activity.get("active_days", 0), "#ec4899"),
    ]
    stat_rows = ""
    for i in range(0, len(stats), 2):
        stat_rows += "<tr>" + "".join(stat_card(*s) for s in stats[i:i + 2]) + "</tr>"

    topic_rows = ""
    if topics:
        for topic in topics[:8]:
            topic_rows += f"""
            <tr>
              <td style="padding:10px 8px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;">{_e(topic.get('title'))}</td>
              <td style="padding:10px 8px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:center;">{_e(topic.get('attempts', 0))}</td>
              <td style="padding:10px 8px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:center;">{_e(topic.get('accuracy_pct', 0))}%</td>
              <td style="padding:10px 8px;border-bottom:1px solid #eef2f7;color:#334155;font-size:13px;text-align:right;">{_e(topic.get('mastery_pct', 0))}%</td>
            </tr>"""
    else:
        topic_rows = f'<tr><td colspan="4" style="padding:14px 8px;color:#64748b;font-size:13px;">{_e(copy["no_topics"])}</td></tr>'

    def bullet_list(items: list, empty_text: str, icon: str, color: str) -> str:
        if not items:
            return f'<p style="margin:0;color:#64748b;font-size:13px;">{_e(empty_text)}</p>'
        rows = "".join(
            f'<div style="margin:7px 0;color:#334155;font-size:13px;line-height:1.5;"><span style="color:{color};font-weight:700;">{icon}</span> {_e(item)}</div>'
            for item in items[:6]
        )
        return rows

    comparison_html = ""
    if previous:
        comparison_html = f"""
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-top:8px;">
          <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:6px;">{_e(copy['previous'])}</div>
          <div style="color:#475569;font-size:13px;line-height:1.7;">
            {_e(comparison.get('summary', ''))}
          </div>
        </div>"""
    else:
        comparison_html = f'<p style="margin:8px 0 0;color:#64748b;font-size:13px;">{_e(copy["previous_none"])}</p>'

    inactive_html = ""
    if inactive:
        inactive_html = f"""
        <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:16px;margin:16px 0;">
          <div style="font-weight:800;color:#9a3412;font-size:16px;margin-bottom:4px;">{_e(copy['inactive_title'])}</div>
          <div style="color:#9a3412;font-size:13px;line-height:1.6;">{_e(copy['inactive_body'])}</div>
        </div>"""

    html_body = f"""<!doctype html>
<html lang="{_e(language)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>{_e(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">{_e(copy['preheader'])}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef4f8;padding:22px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 12px 32px rgba(15,23,42,.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0f172a 0%,#0b4a6f 55%,#0e7490 100%);padding:26px 26px 22px;">
              <div style="color:#67e8f9;font-size:13px;font-weight:800;letter-spacing:.22em;">{_e(copy['brand'])}</div>
              <div style="color:#e2e8f0;font-size:11px;letter-spacing:.06em;margin-top:4px;">{_e(copy['tagline'])}</div>
              <h1 style="margin:18px 0 4px;color:#ffffff;font-size:25px;line-height:1.25;">{_e(copy['title'])}</h1>
              <div style="color:#bae6fd;font-size:14px;">{_e(copy['for_student'].format(student=student))}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 22px 6px;">
              <div style="color:#64748b;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;">{_e(copy['week'])}</div>
              <div style="color:#0f172a;font-size:15px;font-weight:700;margin-top:2px;">{_e(week_label)}</div>
              {inactive_html}
              <h2 style="color:#0f172a;font-size:17px;margin:18px 0 10px;">{_e(copy['summary'])}</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">{stat_rows}</table>
              <div style="margin-top:14px;">
                <div style="font-weight:700;color:#0f172a;font-size:14px;margin-bottom:6px;">{_e(copy['previous'])}</div>
                {comparison_html}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px 4px;">
              <h2 style="color:#0f172a;font-size:17px;margin:10px 0 8px;">{_e(copy['topics'])}</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:10px;border-collapse:separate;overflow:hidden;">
                <tr style="background:#f1f5f9;">
                  <th align="left" style="padding:9px 8px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">{_e(copy['topic'])}</th>
                  <th style="padding:9px 8px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">{_e(copy['attempts'])}</th>
                  <th style="padding:9px 8px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">{_e(copy['accuracy'])}</th>
                  <th align="right" style="padding:9px 8px;color:#475569;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">{_e(copy['mastery'])}</th>
                </tr>
                {topic_rows}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 22px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="top" style="width:50%;padding-right:8px;">
                    <h3 style="color:#047857;font-size:14px;margin:0 0 6px;">{_e(copy['strengths'])}</h3>
                    {bullet_list(strengths, copy['no_strengths'], '✓', '#10b981')}
                  </td>
                  <td valign="top" style="width:50%;padding-left:8px;">
                    <h3 style="color:#b45309;font-size:14px;margin:0 0 6px;">{_e(copy['improvements'])}</h3>
                    {bullet_list(improvements, copy['previous_none'], '↑', '#0ea5e9')}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:14px 22px 4px;">
              <h3 style="color:#b91c1c;font-size:14px;margin:0 0 6px;">{_e(copy['practice'])}</h3>
              {bullet_list(practice, copy['no_practice'], '•', '#f59e0b')}
            </td>
          </tr>
          <tr>
            <td style="padding:14px 22px 4px;">
              <h3 style="color:#0f172a;font-size:14px;margin:0 0 6px;">{_e(copy['recommendations'])}</h3>
              {bullet_list(recommendations, copy['teacher_note'], '→', '#8b5cf6')}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 22px 26px;" align="center">
              <a href="{_e(link)}" style="display:inline-block;background:#0e7490;color:#ffffff;text-decoration:none;font-weight:800;font-size:14px;padding:13px 22px;border-radius:10px;">{_e(copy['cta'])}</a>
              <div style="color:#94a3b8;font-size:11px;margin-top:10px;line-height:1.5;">{_e(copy['cta_note'].format(expires=expires_label))}</div>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:16px 22px;border-top:1px solid #e2e8f0;">
              <div style="color:#64748b;font-size:11px;line-height:1.6;">{_e(copy['footer'])}</div>
              <div style="color:#94a3b8;font-size:10px;margin-top:8px;">{_e(copy['brand'])} · {_e(copy['tagline'])}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""

    text_lines = [
        f"{copy['brand']} — {copy['title']}",
        copy["for_student"].format(student=student),
        f"{copy['week']}: {week_label}",
        "",
    ]
    if inactive:
        text_lines += [copy["inactive_title"], copy["inactive_body"], ""]
    else:
        text_lines += [
            f"{copy['lessons']}: {activity.get('lessons_completed', 0)}",
            f"{copy['lessons_started']}: {activity.get('lessons_started', 0)}",
            f"{copy['quizzes']}: {activity.get('quizzes_attempted', 0)}",
            f"{copy['accuracy']}: {activity.get('accuracy_pct', 0)}%",
            f"{copy['time']}: {activity.get('learning_minutes', 0)} min",
            f"{copy['days']}: {activity.get('active_days', 0)}",
            "",
        ]
    if comparison:
        text_lines += [f"{copy['previous']}: {comparison.get('summary', '')}", ""]
    text_lines.append(copy["cta"] + f": {link}")
    text_lines.append(copy["cta_note"].format(expires=expires_label))
    text = "\n".join(text_lines)
    return subject, html_body, text
