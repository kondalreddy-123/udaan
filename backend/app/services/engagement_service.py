"""
Student Engagement Agent for UDAAN.

Monitors real learning activity, assignments, and concept attempts across the
class to detect:
  1. Inactive students (no activity for >= configurable days, default 3).
  2. Incomplete or overdue assigned lessons.
  3. Repeated unsuccessful attempts or persistent misconceptions.
  4. Declining learning performance.

Generates EngagementAlerts and sends encouraging, non-judgmental
notifications respecting quiet hours, student snoozes, and duplicate suppression.
"""

import json
import logging
import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.models import (
    User, StudentLearningAssignment, StudentActivityEvent, Attempt,
    ConceptMastery, DiagnosticRecord, EngagementAlert, StudentNotification,
    TeacherConfig
)

logger = logging.getLogger("udaan.course.engagement")

DEFAULT_INACTIVE_DAYS_THRESHOLD = 3
MAX_DAILY_NOTIFICATIONS_PER_STUDENT = 3
QUIET_HOURS_START = 22  # 10:00 PM
QUIET_HOURS_END = 7     # 7:00 AM


def is_in_quiet_hours(dt: Optional[datetime.datetime] = None) -> bool:
    """Checks whether current time is within student quiet hours (10 PM - 7 AM)."""
    now = dt or datetime.datetime.utcnow()
    # Assuming Indian Standard Time (UTC + 5:30) for local school time check
    ist_hour = (now.hour + 5 + (now.minute + 30) // 60) % 24
    return ist_hour >= QUIET_HOURS_START or ist_hour < QUIET_HOURS_END


def can_send_notification(
    db: Session,
    student_id: int,
    category: str,
    now: Optional[datetime.datetime] = None,
    enforce_quiet_hours: bool = True
) -> Tuple[bool, str]:
    """
    Evaluates whether a notification is permitted:
    1. Checks quiet hours.
    2. Checks student snooze status.
    3. Checks daily rate limits (max 3/day).
    4. Suppresses duplicate unread reminders in the same category within 24h.
    """
    ts = now or datetime.datetime.utcnow()

    if enforce_quiet_hours and is_in_quiet_hours(ts):
        return False, "quiet_hours"

    # Check active snooze on any recent notification
    snoozed = db.query(StudentNotification).filter(
        StudentNotification.student_id == student_id,
        StudentNotification.is_snoozed == True,
        StudentNotification.snoozed_until.isnot(None),
        StudentNotification.snoozed_until > ts,
    ).first()
    if snoozed:
        return False, f"snoozed_until_{snoozed.snoozed_until.isoformat()}"

    # Rate limiting: max reminders today
    start_of_day = ts.replace(hour=0, minute=0, second=0, microsecond=0)
    count_today = db.query(func.count(StudentNotification.id)).filter(
        StudentNotification.student_id == student_id,
        StudentNotification.created_at >= start_of_day,
    ).scalar() or 0

    if count_today >= MAX_DAILY_NOTIFICATIONS_PER_STUDENT:
        return False, "daily_limit_reached"

    # Duplicate suppression: same category unread within last 24 hours
    since_24h = ts - datetime.timedelta(hours=24)
    duplicate = db.query(StudentNotification).filter(
        StudentNotification.student_id == student_id,
        StudentNotification.category == category,
        StudentNotification.is_read == False,
        StudentNotification.created_at >= since_24h,
    ).first()
    if duplicate:
        return False, "duplicate_suppressed"

    return True, "allowed"


def get_student_last_activity(db: Session, student_id: int) -> Optional[datetime.datetime]:
    """Determines the most recent real activity timestamp across attempts and events."""
    last_event = db.query(func.max(StudentActivityEvent.created_at)).filter(
        StudentActivityEvent.student_id == student_id
    ).scalar()

    last_attempt = db.query(func.max(Attempt.created_at)).filter(
        Attempt.user_id == student_id
    ).scalar()

    last_assignment = db.query(func.max(StudentLearningAssignment.last_activity_at)).filter(
        StudentLearningAssignment.student_id == student_id
    ).scalar()

    timestamps = [t for t in (last_event, last_attempt, last_assignment) if t is not None]
    return max(timestamps) if timestamps else None


def scan_class_engagement(
    db: Session,
    teacher: User,
    class_name: Optional[str] = None,
    enforce_quiet_hours: bool = True
) -> Dict[str, Any]:
    """
    Student Engagement Agent:
    Scans real activity records for all students in the teacher's class.
    Identifies inactive students, incomplete assignments, and repeated misconceptions.
    Generates alerts and supportive bilingual notifications.
    """
    target_class = class_name or teacher.class_name
    now = datetime.datetime.utcnow()

    # Load teacher config if available
    cfg = db.query(TeacherConfig).filter(TeacherConfig.teacher_id == teacher.id).first()
    inactive_days = DEFAULT_INACTIVE_DAYS_THRESHOLD

    students = db.query(User).filter(
        User.role == "student",
        User.class_name == target_class
    ).all()

    active_count = 0
    inactive_count = 0
    incomplete_count = 0
    alerts_created = 0
    notifications_sent = 0
    struggling_students = []

    for student in students:
        last_act = get_student_last_activity(db, student.id)
        days_inactive = (now - last_act).days if last_act else 999

        is_student_active = (days_inactive < inactive_days)
        if is_student_active:
            active_count += 1
        else:
            inactive_count += 1

        # 1. Inactivity Alert Check
        if days_inactive >= inactive_days:
            existing_alert = db.query(EngagementAlert).filter(
                EngagementAlert.student_id == student.id,
                EngagementAlert.alert_type == "inactive_days",
                EngagementAlert.is_resolved == False,
            ).first()

            if not existing_alert:
                alert = EngagementAlert(
                    student_id=student.id,
                    teacher_id=teacher.id,
                    class_name=target_class,
                    alert_type="inactive_days",
                    severity="medium" if days_inactive <= 5 else "high",
                    details_json=json.dumps({
                        "days_inactive": days_inactive,
                        "last_active": last_act.isoformat() if last_act else "Never",
                        "summary": f"No learning activity recorded for {days_inactive} days."
                    }),
                    is_resolved=False,
                    created_at=now,
                )
                db.add(alert)
                alerts_created += 1

            # Friendly, non-judgmental reminder to student
            allowed, reason = can_send_notification(db, student.id, "reminder_inactive", now, enforce_quiet_hours)
            if allowed:
                db.add(StudentNotification(
                    student_id=student.id,
                    title_en="We Miss You in UDAAN!",
                    title_te="ఉడాన్‌లో మీ అభ్యాసాన్ని కొనసాగించండి!",
                    body_en="We noticed you haven't practiced for a few days. Your next lesson is waiting for you! Even 10 minutes today can help keep your learning streak strong.",
                    body_te="మీరు కొన్ని రోజులుగా సాధన చేయలేదని గమనించాము. మీ తదుపరి పాఠం సిద్ధంగా ఉంది! నేడు కేవలం 10 నిమిషాలు కేటాయించినా మీ అవగాహన మెరుగవుతుంది.",
                    category="reminder_inactive",
                    action_url="/student/practice",
                    priority="normal",
                    created_at=now,
                ))
                notifications_sent += 1

        # 2. Incomplete Lessons Check
        pending_assignments = db.query(StudentLearningAssignment).filter(
            StudentLearningAssignment.student_id == student.id,
            StudentLearningAssignment.status.in_(("assigned", "in_progress")),
        ).all()

        overdue_assignments = [
            a for a in pending_assignments
            if a.due_date and a.due_date < now
        ]

        if overdue_assignments:
            incomplete_count += 1
            existing_inc_alert = db.query(EngagementAlert).filter(
                EngagementAlert.student_id == student.id,
                EngagementAlert.alert_type == "incomplete_lesson",
                EngagementAlert.is_resolved == False,
            ).first()

            if not existing_inc_alert:
                first_due = overdue_assignments[0]
                db.add(EngagementAlert(
                    student_id=student.id,
                    teacher_id=teacher.id,
                    class_name=target_class,
                    alert_type="incomplete_lesson",
                    severity="low",
                    details_json=json.dumps({
                        "overdue_count": len(overdue_assignments),
                        "lesson_id": first_due.lesson_id,
                        "due_date": first_due.due_date.isoformat() if first_due.due_date else None,
                    }),
                    is_resolved=False,
                    created_at=now,
                ))
                alerts_created += 1

                allowed, _ = can_send_notification(db, student.id, "reminder_incomplete", now, enforce_quiet_hours)
                if allowed:
                    db.add(StudentNotification(
                        student_id=student.id,
                        title_en="Lesson Ready to Complete",
                        title_te="పాఠాన్ని పూర్తి చేయడానికి సిద్ధంగా ఉంది",
                        body_en="You have an assigned lesson ready for you. Take a quick step forward today to complete your milestones!",
                        body_te="మీ కోసం కేటాయించిన పాఠం సిద్ధంగా ఉంది. మీ లక్ష్యాలను పూర్తి చేయడానికి నేడు ఒక అడుగు ముందుకు వేయండి!",
                        category="reminder_incomplete",
                        action_url=f"/student/lesson/{first_due.lesson_id}",
                        priority="normal",
                        created_at=now,
                    ))
                    notifications_sent += 1

        # 3. Repeated Misconception / Low Performance Check
        struggling_masteries = db.query(ConceptMastery).filter(
            ConceptMastery.user_id == student.id,
            or_(
                ConceptMastery.streak_wrong >= 2,
                ConceptMastery.mastery_score < 0.40,
            )
        ).all()

        if struggling_masteries:
            struggling_students.append({
                "student_id": student.id,
                "student_name": student.full_name,
                "struggles": [
                    {"concept_id": m.concept_id, "score": m.mastery_score, "streak_wrong": m.streak_wrong}
                    for m in struggling_masteries
                ]
            })

    db.commit()

    return {
        "class_name": target_class,
        "total_students": len(students),
        "active_students": active_count,
        "inactive_students": inactive_count,
        "incomplete_lessons_students": incomplete_count,
        "struggling_students_count": len(struggling_students),
        "struggling_students": struggling_students,
        "new_alerts_created": alerts_created,
        "notifications_sent": notifications_sent,
    }
