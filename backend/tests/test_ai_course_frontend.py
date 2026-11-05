"""Static frontend contract tests for the AI Course & Engagement Orchestrator.

The live behaviour is covered by ``test_course_orchestrator.py``; these tests
lock the UI contract that:

* the teacher dashboard exposes the AI Course & Engagement Center,
* a generated plan is presented as a draft until it is explicitly approved and
  published, and
* the student dashboard renders the published learning plan plus the UDAAN
  Learning Assistant (read / snooze / complete-intervention controls).
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
FRONTEND_SRC = REPO_ROOT / "frontend" / "src"


def _read(relative_path: str) -> str:
    path = FRONTEND_SRC / relative_path
    assert path.exists(), f"Expected frontend file at {path}"
    return path.read_text(encoding="utf-8")


def test_teacher_dashboard_wires_ai_course_center():
    dashboard = _read("components/TeacherDashboard.jsx")
    assert "AiCourseCenter" in dashboard
    assert "AI Course & Engagement" in dashboard
    assert "setViewMode('ai')" in dashboard
    assert "<AiCourseCenter" in dashboard
    # The selected classroom is passed through so the orchestrator is scoped.
    assert "className={selectedClass}" in dashboard


def test_ai_center_requires_teacher_approval_before_publish():
    source = _read("components/AiCourseCenter.jsx")

    # Uploads create drafts only, and the UI says so.
    assert "approveCoursePlan" in source
    assert "publishCoursePlan" in source
    assert "Draft only" in source
    assert "Students are not notified until you approve and publish" in source

    # Publishing is disabled while the plan is still a draft.
    assert "selectedPlan.status === 'draft'" in source

    # Teacher controls that were requested by the spec.
    for marker in (
        "Run engagement scan",
        "Detect misconceptions",
        "Approve & assign",
        "Worksheet",
        "Approve plan",
        "Publish to students",
    ):
        assert marker in source, f"missing teacher control: {marker}"


def test_ai_center_uses_real_api_response_fields():
    source = _read("components/AiCourseCenter.jsx")
    # These fields come from engagement_service/agent_orchestrator responses.
    for marker in (
        "engagement.notifications_sent",
        "engagement.new_alerts_created",
        "completion_rate_pct",
        "total_campaigns",
        "evaluated_participants",
        "recommended_next_action",
        "item.occurrences",
        "item.target_misconception",
    ):
        assert marker in source, f"missing API field binding: {marker}"


def test_student_dashboard_renders_learning_plan_and_assistant():
    student_view = _read("components/StudentView.jsx")
    assert "MyLearningPlan" in student_view
    assert "<MyLearningPlan" in student_view

    source = _read("components/MyLearningPlan.jsx")
    assert "getStudentLearningPlan" in source
    assert "getLearningAssistantNotifications" in source
    assert "recordLearningEvent" in source
    assert "markLearningNotificationRead" in source
    assert "snoozeLearningNotification" in source
    assert "completeStudentIntervention" in source
    # Bilingual assistant copy.
    assert "title_te" in source
    assert "body_te" in source


def test_api_exposes_orchestrator_endpoints():
    source = _read("services/api.js")
    for marker in (
        "/course/materials/upload",
        "/course/plans",
        "/course/engagement/overview",
        "/course/engagement/scan",
        "/course/interventions",
        "/course/reports/weekly",
        "/course/reports/worksheet",
        "/student/learning-plan",
        "/student/notifications",
        "/student/interventions/",
    ):
        assert marker in source, f"missing API endpoint wrapper: {marker}"
    assert "uploadRequest" in source
