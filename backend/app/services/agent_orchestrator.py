"""
AI Agent Orchestrator & Teacher Assistant Agent for UDAAN.

Coordinates specialist educational agents:
  1. Course Understanding Agent (DocumentProcessor)
  2. Course Planning Agent (CoursePlanner)
  3. Learning Resource Agent (RAGService)
  4. Student Engagement Agent (EngagementService)
  5. Intervention Planning Agent (InterventionService)
  6. Notification Agent (NotificationService)
  7. Follow-up & Progress Monitoring Agent (InterventionService/EngagementService)
  8. Teacher Assistant Agent (Classroom Summaries, Worksheets, Reports)

Maintains execution telemetry and audit records in AgentTask and AgentExecutionLog.
"""

import json
import logging
import datetime
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    User, CoursePlan, CourseLesson, StudentLearningAssignment,
    EngagementAlert, LearningIntervention, InterventionParticipant,
    AgentTask, AgentExecutionLog, ConceptMastery, DiagnosticRecord
)
from app.services import (
    document_processor, rag_service, course_planner,
    engagement_service, intervention_service
)

logger = logging.getLogger("udaan.course.orchestrator")


def log_agent_execution(
    db: Session,
    agent_name: str,
    action_taken: str,
    entities_count: int = 0,
    details: Optional[Dict[str, Any]] = None,
    status: str = "success"
) -> AgentExecutionLog:
    """Records an auditable trace of an autonomous agent decision/action."""
    log = AgentExecutionLog(
        agent_name=agent_name,
        action_taken=action_taken,
        entities_affected_count=entities_count,
        details_json=json.dumps(details or {}),
        status=status,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(log)
    db.commit()
    return log


def run_full_engagement_and_intervention_cycle(
    db: Session,
    teacher: User,
    class_name: Optional[str] = None,
    enforce_quiet_hours: bool = True
) -> Dict[str, Any]:
    """
    Autonomous Periodic / On-Demand Orchestration Cycle:
    1. Runs Student Engagement Agent (detects inactivity, incomplete lessons, low scores).
    2. Runs Classroom Campaign Agent (detects shared misconceptions, drafts remedial activities).
    3. Logs execution telemetry.
    """
    target_class = class_name or teacher.class_name
    cycle_start = datetime.datetime.utcnow()

    # 1. Engagement Scan
    eng_result = engagement_service.scan_class_engagement(db, teacher, target_class, enforce_quiet_hours=enforce_quiet_hours)
    log_agent_execution(
        db,
        agent_name="StudentEngagementAgent",
        action_taken=f"Scanned {eng_result['total_students']} students for inactivity and overdue lessons",
        entities_count=eng_result["new_alerts_created"] + eng_result["notifications_sent"],
        details=eng_result,
    )

    # 2. Intervention Scan
    proposed = intervention_service.scan_for_classroom_campaigns(db, teacher, target_class)
    log_agent_execution(
        db,
        agent_name="InterventionPlanningAgent",
        action_taken=f"Evaluated class misconceptions; proposed {len(proposed)} remedial campaign(s)",
        entities_count=len(proposed),
        details={"proposed_ids": [p.id for p in proposed]},
    )

    return {
        "cycle_started_at": cycle_start.isoformat(),
        "class_name": target_class,
        "engagement": eng_result,
        "new_interventions_proposed": len(proposed),
        "status": "completed"
    }


def generate_weekly_teacher_report(
    db: Session,
    teacher: User,
    class_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Teacher Assistant Agent:
    Compiles a comprehensive weekly digest:
      - Course completion rates
      - Engagement distribution (active vs inactive)
      - Top recurring misconceptions with evidence
      - Intervention effectiveness (pre- vs post-mastery gains)
      - Recommended next pedagogical action
    """
    target_class = class_name or teacher.class_name
    now = datetime.datetime.utcnow()
    seven_days_ago = now - datetime.timedelta(days=7)

    # Students in class
    students = db.query(User).filter(
        User.role == "student",
        User.class_name == target_class
    ).all()
    student_ids = [s.id for s in students]
    total_students = len(students)

    # Course Plans
    plans = db.query(CoursePlan).filter(
        CoursePlan.class_name == target_class,
        CoursePlan.status == "published"
    ).all()

    # Assignments completion
    total_assignments = db.query(StudentLearningAssignment).filter(
        StudentLearningAssignment.class_name == target_class
    ).count()
    completed_assignments = db.query(StudentLearningAssignment).filter(
        StudentLearningAssignment.class_name == target_class,
        StudentLearningAssignment.status == "completed"
    ).count()
    completion_rate_pct = int(round((completed_assignments / max(1, total_assignments)) * 100))

    # Inactivity count
    active_count = 0
    inactive_count = 0
    for s in students:
        last = engagement_service.get_student_last_activity(db, s.id)
        if last and (now - last).days < 3:
            active_count += 1
        else:
            inactive_count += 1

    # Interventions in class
    interventions = db.query(LearningIntervention).filter(
        LearningIntervention.class_name == target_class
    ).order_by(LearningIntervention.created_at.desc()).limit(5).all()

    # Pre vs Post Gains across participants
    participants = db.query(InterventionParticipant).join(
        LearningIntervention, LearningIntervention.id == InterventionParticipant.intervention_id
    ).filter(
        LearningIntervention.class_name == target_class,
        InterventionParticipant.status == "completed"
    ).all()

    avg_pre = 0.0
    avg_post = 0.0
    if participants:
        avg_pre = round(sum(p.pre_mastery_score for p in participants) / len(participants), 3)
        post_scores = [p.post_mastery_score for p in participants if p.post_mastery_score is not None]
        avg_post = round(sum(post_scores) / max(1, len(post_scores)), 3) if post_scores else avg_pre

    # Diagnostics in last 7 days
    recent_diags = db.query(
        DiagnosticRecord.suspected_misconception,
        func.count(DiagnosticRecord.id)
    ).filter(
        DiagnosticRecord.user_id.in_(student_ids),
        DiagnosticRecord.created_at >= seven_days_ago
    ).group_by(DiagnosticRecord.suspected_misconception).all()

    top_misconceptions = [
        {"type": mtype, "occurrences": cnt} for mtype, cnt in recent_diags if mtype
    ]

    report = {
        "class_name": target_class,
        "report_generated_at": now.isoformat(),
        "period": "Last 7 Days",
        "cohort_summary": {
            "total_students": total_students,
            "active_students": active_count,
            "inactive_students": inactive_count,
            "engagement_rate_pct": int(round((active_count / max(1, total_students)) * 100)),
        },
        "curriculum_progress": {
            "published_courses": len(plans),
            "total_assigned_lessons": total_assignments,
            "completed_lessons": completed_assignments,
            "completion_rate_pct": completion_rate_pct,
        },
        "intervention_analytics": {
            "total_campaigns": len(interventions),
            "evaluated_participants": len(participants),
            "average_pre_intervention_mastery": f"{int(avg_pre * 100)}%",
            "average_post_intervention_mastery": f"{int(avg_post * 100)}%",
            "relative_gain_pct": f"+{max(0, int((avg_post - avg_pre) * 100))}%",
        },
        "top_struggles": top_misconceptions,
        "recommended_next_action": (
            "Focus Monday's 15-minute starter on 'Finding LCM for Unlike Denominators'. "
            "Pair students with peer buddies for tactile fraction-strip verification."
            if top_misconceptions else
            "Class engagement is balanced. Proceed with Lesson 3 on Signed Rational Addition."
        )
    }

    log_agent_execution(
        db,
        agent_name="TeacherAssistantAgent",
        action_taken=f"Generated weekly report for {target_class}",
        entities_count=total_students,
        details={"completion_rate": completion_rate_pct, "active_count": active_count}
    )

    return report
