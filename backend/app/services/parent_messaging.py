"""Shared response shaping for parent-teacher message threads."""
from __future__ import annotations

import datetime

from app.models import ParentTeacherMessage
from app.schemas import MessageReplyResponse, ParentMessageResponse


def message_is_unread(message: ParentTeacherMessage, role: str) -> bool:
    """Role-aware unread flag used by both the parent and teacher inboxes."""
    read_at = message.parent_read_at if role == "parent" else message.teacher_read_at
    other_role = "teacher" if role == "parent" else "parent"

    # A brand-new message written by the parent is unread for the teacher.
    if role == "teacher" and message.teacher_read_at is None:
        return True
    # A teacher-initiated thread is unread for the parent until they open it.
    if role == "parent" and message.parent_read_at is None:
        return True

    for reply in message.replies:
        if reply.author_role != other_role:
            continue
        if read_at is None or (reply.created_at and reply.created_at > read_at):
            return True
    return False


def message_response(message: ParentTeacherMessage, role: str) -> ParentMessageResponse:
    replies = []
    for reply in sorted(message.replies, key=lambda r: r.created_at or datetime.datetime.min):
        author = reply.author
        replies.append(MessageReplyResponse(
            id=reply.id,
            author_id=reply.author_id,
            author_name=author.full_name if author else reply.author_role.title(),
            author_role=reply.author_role,
            body=reply.body,
            recommended_activity=reply.recommended_activity,
            meeting_requested=bool(reply.meeting_requested),
            created_at=reply.created_at,
        ))

    return ParentMessageResponse(
        id=message.id,
        parent_id=message.parent_id,
        parent_name=message.parent.full_name if message.parent else "Parent",
        teacher_id=message.teacher_id,
        teacher_name=message.teacher.full_name if message.teacher else "Teacher",
        student_id=message.student_id,
        student_name=message.student.full_name if message.student else "Student",
        category=message.category,
        subject=message.subject,
        body=message.body,
        initiated_by_role=getattr(message, "initiated_by_role", "parent") or "parent",
        status=message.status,
        is_unread=message_is_unread(message, role),
        parent_read_at=message.parent_read_at,
        teacher_read_at=message.teacher_read_at,
        resolved_at=message.resolved_at,
        created_at=message.created_at,
        last_activity_at=message.last_activity_at or message.created_at,
        replies=replies,
    )
