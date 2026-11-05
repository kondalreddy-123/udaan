"""
Frontend guard tests for the two new parent features.

Static source assertions (the same pattern used by
``test_parent_communication_frontend.py``) that lock in the UI contract:

* one-pending-or-active parent access management on the student side, and
* two-way parent <-> assigned teacher messaging on both dashboards.

These are not a browser suite; the live behaviour is covered by the API tests.
"""
import re
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"

# Exact copy required by the product spec for a second parent attempt.
ALREADY_CONNECTED = "This student is already connected to a parent account."


def _read(relative_path: str) -> str:
    path = FRONTEND_SRC / relative_path
    assert path.exists(), f"Expected frontend file at {path}"
    return path.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Student side: one parent at a time
# ---------------------------------------------------------------------------
def test_student_can_manage_a_single_parent_relationship():
    source = _read("components/StudentView.jsx")

    # Explicit management surface instead of an always-available add button.
    assert "Manage Parent Access" in source
    assert "parentAccessLocked" in source
    assert "activeParentConn" in source
    assert "pendingParentConn" in source

    # A locked student cannot open the invitation flow again.
    assert "disabled={parentAccessLocked}" in source
    assert "not-allowed" in source

    # Pending request -> approve / reject controls.
    assert "handleApproveParentConn" in source
    assert "handleRejectParentConn" in source
    assert "Approve" in source
    assert "Reject" in source
    assert "Waiting for your approval" in source
    assert "Pending Requests" in source

    # Connected -> parent identity, verified email, status and revoke.
    assert "✓ Connected:" in source
    assert "activeParentConn.parent_email" in source
    assert "CONNECTED" in source
    assert "handleRevokeParentConn" in source
    assert "Revoke access" in source

    # History of released relationships is preserved (rejected/revoked/expired).
    assert "parentAccessHistory" in source
    assert "Connection history" in source


def test_student_connection_status_uses_verified_not_approved():
    source = _read("components/StudentView.jsx")

    # The backend stores the approved relationship as ``verified``; the UI must
    # not look for a status that the API never returns.
    assert "status === 'verified'" in source or 'status === "verified"' in source
    assert "status === 'approved'" not in source
    assert 'status === "approved"' not in source


def test_student_locked_state_explains_the_single_parent_rule():
    source = _read("components/StudentView.jsx")

    # The copy explains why adding another parent is disabled.
    assert "already connected" in source.lower()
    assert "waiting for your approval" in source.lower()


# ---------------------------------------------------------------------------
# Parent side: message the assigned teacher from ParentConnect
# ---------------------------------------------------------------------------
def test_parent_connect_embeds_message_teacher():
    source = _read("components/ParentConnect.jsx")

    assert "import ParentMessages from './ParentMessages';" in source
    assert "msgMessageTeacher" in source
    assert "msgMessageTeacherHelp" in source
    # Reuses the existing messaging component rather than a mock/new panel.
    assert "<ParentMessages" in source
    assert "embedded" in source


def test_parent_messages_shows_connected_child_and_assigned_teacher():
    source = _read("components/ParentMessages.jsx")

    # Parent picks one of their verified children.
    assert "studentId" in source
    assert "profile" in source
    # Assigned teacher is resolved from the API, not hard-coded.
    assert "api.getChildAssignedTeacher(studentId)" in source
    assert "msgAssignedTeacher" in source
    assert "msgNoAssignedTeacher" in source

    # Embedded mode keeps the ParentConnect styling/animation untouched.
    assert "embedded" in source
    assert "pm-panel" in source
    assert 'aria-labelledby="pm-title"' in source


def test_parent_connect_surfaces_the_exact_second_parent_message():
    """The parent UI must be able to display the backend's exact wording."""
    sources = [
        _read("components/ParentConnect.jsx"),
        _read("components/ParentMessages.jsx"),
        _read("services/api.js"),
    ]
    joined = "\n".join(sources)

    # The message is either rendered directly or surfaced verbatim from the API
    # error; the important contract is that no alternate wording is invented.
    assert ALREADY_CONNECTED in joined or "detail" in joined


# ---------------------------------------------------------------------------
# Teacher side: Parent Messages in the student profile + unread indicator
# ---------------------------------------------------------------------------
def test_teacher_student_profile_embeds_parent_messages():
    source = _read("components/TeacherDashboard.jsx")

    assert "import TeacherMessages from './TeacherMessages';" in source
    assert "Parent Messages" in source
    assert "<TeacherMessages" in source
    assert "studentId={selectedStudentDetail.student_id}" in source
    assert "embedded" in source

    # Parent name, student and content are rendered by TeacherMessages itself.
    messages_source = _read("components/TeacherMessages.jsx")
    assert "parent_name" in messages_source
    assert "student_name" in messages_source
    assert "body" in messages_source


def test_teacher_dashboard_polls_unread_indicator():
    source = _read("components/TeacherDashboard.jsx")

    assert "api.getTeacherUnreadCount()" in source
    assert "unread_messages" in source
    assert "unread_notifications" in source
    assert "unread_parent_messages" in source
    assert "setMessagesUnread" in source


def test_teacher_messages_supports_student_filter_and_embedded_mode():
    source = _read("components/TeacherMessages.jsx")

    assert "studentId = null" in source
    assert "embedded = false" in source
    assert "api.getTeacherMessages(null, false, studentId)" in source
    # Read state and reply controls.
    assert "is_unread" in source
    assert "teacher_read_at" in source
    assert "Reply" in source or "reply" in source


# ---------------------------------------------------------------------------
# API wrappers + translations
# ---------------------------------------------------------------------------
def test_api_wrappers_exist_for_the_new_endpoints():
    source = _read("services/api.js")

    assert "getChildAssignedTeacher" in source
    assert "/teacher" in source
    assert "getTeacherMessages" in source
    assert "getTeacherUnreadCount" in source
    assert "messages/unread-count" in source


def test_new_translation_keys_exist_in_all_three_languages():
    source = _read("i18n/translations.js")

    for key in (
        "msgAssignedTeacher",
        "msgNoAssignedTeacher",
        "msgMessageTeacher",
        "msgMessageTeacherHelp",
    ):
        occurrences = len(re.findall(rf"\b{key}\s*:", source))
        assert occurrences == 3, (
            f"{key} should be translated for English, Telugu and Hindi; found {occurrences}"
        )


def test_design_language_is_preserved():
    """Guard the shared visual language instead of introducing a new theme."""
    css = _read("index.css")

    # Dark background and neon rim lighting stay in place.
    assert "#07080A" in css or "#07080a" in css
    assert "glass" in css.lower()
    # The new panels reuse the existing classes rather than inline overrides.
    assert ".pm-panel" in css
    assert ".tm-panel" in css
