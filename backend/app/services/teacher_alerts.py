"""In-app notifications for teachers about verified parent messages.

Teacher accounts do not have a separate verified email/channel record, so
notifications are deliberately in-app only. The parent's own reply
notifications continue to use ``parent_alerts`` (which checks the verified
parent contact before any email is attempted).
"""
from __future__ import annotations

import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models import ParentTeacherMessage, TeacherNotification, User


def _existing(
    db: Session, teacher_id: int, dedup_key: str
) -> Optional[TeacherNotification]:
    if not dedup_key:
        return None
    return (
        db.query(TeacherNotification)
        .filter(
            TeacherNotification.teacher_id == teacher_id,
            TeacherNotification.dedup_key == dedup_key,
        )
        .first()
    )


def _create(
    db: Session,
    *,
    teacher: User,
    parent: User,
    student: User,
    message: ParentTeacherMessage,
    dedup_key: str,
    title: str,
    body: str,
    category: str,
    reply_id: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> Optional[TeacherNotification]:
    existing = _existing(db, teacher.id, dedup_key)
    if existing:
        return existing

    record = TeacherNotification(
        teacher_id=teacher.id,
        parent_id=parent.id,
        student_id=student.id,
        message_id=message.id,
        reply_id=reply_id,
        category=category,
        title=title,
        body=body,
        language="en",
        is_read=False,
        in_app_delivered=True,
        dedup_key=dedup_key,
        created_at=now or datetime.datetime.utcnow(),
    )
    db.add(record)
    return record


def notify_teacher_of_parent_message(
    db: Session,
    message: ParentTeacherMessage,
    *,
    now: Optional[datetime.datetime] = None,
) -> Optional[TeacherNotification]:
    """One notification per parent-initiated thread."""
    teacher = db.query(User).filter(User.id == message.teacher_id, User.role == "teacher").first()
    parent = db.query(User).filter(User.id == message.parent_id, User.role == "parent").first()
    student = db.query(User).filter(User.id == message.student_id, User.role == "student").first()
    if not teacher or not parent or not student:
        return None

    student_name = student.full_name.split(" ")[0] if student.full_name else "your student"
    return _create(
        db,
        teacher=teacher,
        parent=parent,
        student=student,
        message=message,
        dedup_key=f"msg:{message.id}:parent:new",
        title=f"New parent message about {student_name}",
        body=(
            f"{parent.full_name} sent a message about {student.full_name}: "
            f"\"{message.subject}\". Open the student profile to read and reply."
        ),
        category="parent_message",
        now=now,
    )


def notify_teacher_of_parent_reply(
    db: Session,
    message: ParentTeacherMessage,
    *,
    reply_id: int,
    now: Optional[datetime.datetime] = None,
) -> Optional[TeacherNotification]:
    """One notification per parent reply (never duplicated)."""
    teacher = db.query(User).filter(User.id == message.teacher_id, User.role == "teacher").first()
    parent = db.query(User).filter(User.id == message.parent_id, User.role == "parent").first()
    student = db.query(User).filter(User.id == message.student_id, User.role == "student").first()
    if not teacher or not parent or not student:
        return None

    student_name = student.full_name.split(" ")[0] if student.full_name else "your student"
    return _create(
        db,
        teacher=teacher,
        parent=parent,
        student=student,
        message=message,
        dedup_key=f"msg:{message.id}:parent-reply:{reply_id}",
        title=f"New reply from {parent.full_name}",
        body=(
            f"{parent.full_name} replied about {student.full_name} in "
            f"\"{message.subject}\". Open the student profile to read and reply."
        ),
        category="parent_reply",
        reply_id=reply_id,
        now=now,
    )


def unread_count(
    db: Session, teacher_id: int, *, student_id: Optional[int] = None
) -> int:
    query = db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher_id,
        TeacherNotification.is_read.is_(False),
    )
    if student_id is not None:
        query = query.filter(TeacherNotification.student_id == student_id)
    return query.count()


def mark_message_notifications_read(
    db: Session,
    *,
    teacher_id: int,
    message_id: int,
    now: Optional[datetime.datetime] = None,
) -> int:
    """Mark every notification for one thread read when the teacher opens it."""
    now = now or datetime.datetime.utcnow()
    rows = (
        db.query(TeacherNotification)
        .filter(
            TeacherNotification.teacher_id == teacher_id,
            TeacherNotification.message_id == message_id,
            TeacherNotification.is_read.is_(False),
        )
        .all()
    )
    for row in rows:
        row.is_read = True
        row.read_at = now
    return len(rows)
