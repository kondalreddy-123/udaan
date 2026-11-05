"""
Phase 4 frontend guard tests.

Static assertions that protect the accessibility, graceful degradation and
multilingual requirements of the parent notification / messaging UI. These are
not a browser suite; the live flow is exercised separately.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"


def _read(relative_path: str) -> str:
    path = FRONTEND_SRC / relative_path
    assert path.exists(), f"Expected frontend file at {path}"
    return path.read_text(encoding="utf-8")


def test_notifications_are_optional_voice_and_accessible():
    source = _read("components/ParentNotifications.jsx")

    # Voice is feature detected and the fallback still shows all text.
    assert "'speechSynthesis' in window" in source
    assert "voiceUnsupported" in source

    # Accessible structure: labelled region, live region, explicit alerts.
    assert 'aria-labelledby="pn-title"' in source
    assert 'aria-live="polite"' in source
    assert 'role="alert"' in source

    # Consent and notification preferences must be reachable from the UI.
    assert "notifications_consent" in source
    assert "notify_email" in source
    assert "email_notifications_available" in source


def test_parent_messages_only_offer_verified_children_and_deep_link():
    source = _read("components/ParentMessages.jsx")

    # Never offer a child whose guardian link is not verified.
    assert "verification_status === 'verified'" in source
    assert "getParentMe" in source
    assert "initialMessageId" in source
    assert "api.createParentMessage" in source
    assert "api.replyParentMessage" in source

    # Meeting requests and teacher recommendations are visible in the thread.
    assert "recommended_activity" in source
    assert "meeting_requested" in source
    assert 'role="alert"' in source


def test_teacher_messages_support_reply_recommendation_and_resolution():
    source = _read("components/TeacherMessages.jsx")

    assert "api.getTeacherMessages" in source
    assert "api.replyTeacherMessage" in source
    assert "api.resolveTeacherMessage" in source
    assert "recommended_activity" in source
    assert "meeting_requested" in source
    assert "resolution_note" in source
    assert 'aria-live="polite"' in source


def test_parent_profile_exposes_notifications_and_messages_without_duplication():
    source = _read("components/ParentOnboarding.jsx")

    assert "import ParentNotifications from './ParentNotifications'" in source
    assert "import ParentMessages from './ParentMessages'" in source
    assert "initialMessageId={focusMessageId}" in source
    assert "role=\"tablist\"" in source
    assert "role=\"tabpanel\"" in source


def test_teacher_dashboard_has_messages_view():
    dashboard = _read("components/TeacherDashboard.jsx")
    app = _read("App.jsx")

    assert "import TeacherMessages from './TeacherMessages'" in dashboard
    assert "viewMode === 'messages'" in dashboard
    assert "<TeacherMessages" in dashboard
    assert "lang={lang}" in dashboard
    assert "t={t}" in dashboard
    # Props must actually be supplied by the app shell.
    assert "lang={lang}" in app
    assert "t={t}" in app


def test_phase4_translation_keys_exist_in_telugu_english_and_hindi():
    catalog = _read("i18n/translations.js")

    keys = [
        "notificationsTitle",
        "notificationsIntro",
        "notifyConsent",
        "notifyInApp",
        "inAppAlwaysOn",
        "notifyEmail",
        "notifyVoice",
        "noNotifications",
        "messagesTitle",
        "messagesIntro",
        "msgNew",
        "msgCategory_learning_difficulty",
        "msgCategory_meeting_request",
        "msgSubject",
        "msgBody",
        "msgEmpty",
        "msgRecommendedActivity",
        "msgMeetingRequested",
        "msgReplySend",
        "msgResolve",
        "msgResolved",
        "teacherMessagesTitle",
        "teacherMessagesIntro",
        "talkToTeacher",
    ]

    for key in keys:
        occurrences = len(re.findall(rf"^\s*{re.escape(key)}:", catalog, re.MULTILINE))
        assert occurrences == 3, f"Expected {key} in en, te and hi (found {occurrences})"


def test_phase4_styles_keep_large_targets_and_focus_visibility():
    css = _read("index.css")

    assert ".po-tab" in css
    assert ".pn-toolbar" in css
    assert ".pm-layout" in css
    assert ".tm-layout" in css
    assert "min-height: 44px" in css
    assert "outline: 3px solid #fcd34d" in css
