"""Acceptance tests for two-way parent <-> assigned teacher messaging.

Covers the parent compose flow (connected child + assigned teacher), the teacher
student-profile inbox, replies, read state, unread indicators, notification
deduplication and every authorization boundary (cross-parent, cross-student,
cross-teacher, revoked relationships).

All tests run against the real FastAPI app and the real SQLite database.
"""
import datetime
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import or_

from app.main import app
from app.database import SessionLocal
from app.models import (
    MessageReply,
    ParentContact,
    ParentNotification,
    ParentProfile,
    ParentStudentLink,
    ParentTeacherMessage,
    RelationshipAuditLog,
    TeacherNotification,
    User,
)
from app.auth import create_access_token, hash_password
from app.services import parent_alerts, teacher_alerts

client = TestClient(app)


def _uid(prefix="phase7"):
    return f"phase7_{prefix}_{uuid.uuid4().hex[:12]}"


def _klass():
    """Unique class name so seeded teachers never win assignment resolution."""
    return f"Phase7 Class {uuid.uuid4().hex[:8]}"


def _make_user(db, role, class_name="Class 8 - Section A", name=None, *, notify_email=False):
    user = User(
        email=f"{_uid(role)}@udaan.test",
        hashed_password=hash_password("udaan123"),
        full_name=name or f"Phase7 {role.title()}",
        role=role,
        class_name=class_name,
        grade=8,
        is_active=True,
        created_by="phase7_test",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if role == "parent":
        db.add(ParentProfile(
            user_id=user.id,
            preferred_language="en",
            contact_method="in_app",
            is_verified=True,
            notifications_consent=True,
            notify_in_app=True,
            notify_email=notify_email,
        ))
        db.commit()
        db.refresh(user)
    return user


def _headers(user):
    token = create_access_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"Authorization": f"Bearer {token}"}


def _link(db, parent, student):
    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="parent",
        status="verified",
        verification_method="teacher_assisted",
        verified_at=datetime.datetime.utcnow(),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _send_message(parent, student, *, subject="Help with fractions", body="Please help us practise fractions."):
    return client.post(
        "/api/parent/messages",
        json={
            "student_id": student.id,
            "category": "learning_difficulty",
            "subject": subject,
            "body": body,
        },
        headers=_headers(parent),
    )


def _cleanup(db):
    test_users = db.query(User).filter(User.email.like("phase7_%@udaan.test")).all()
    ids = {u.id for u in test_users}

    links = db.query(ParentStudentLink).filter(
        or_(ParentStudentLink.parent_id.in_(ids), ParentStudentLink.student_id.in_(ids))
    ).all() if ids else []
    link_ids = {link.id for link in links}
    all_ids = set(ids) | {link.parent_id for link in links} | {link.student_id for link in links}

    messages = db.query(ParentTeacherMessage).filter(
        or_(
            ParentTeacherMessage.parent_id.in_(all_ids),
            ParentTeacherMessage.teacher_id.in_(all_ids),
            ParentTeacherMessage.student_id.in_(all_ids),
        )
    ).all() if all_ids else []
    message_ids = {message.id for message in messages}

    if all_ids:
        db.query(TeacherNotification).filter(
            or_(
                TeacherNotification.teacher_id.in_(all_ids),
                TeacherNotification.parent_id.in_(all_ids),
                TeacherNotification.student_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
        db.query(ParentNotification).filter(
            or_(
                ParentNotification.parent_id.in_(all_ids),
                ParentNotification.student_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
        db.query(MessageReply).filter(MessageReply.author_id.in_(all_ids)).delete(synchronize_session=False)
    if message_ids:
        db.query(TeacherNotification).filter(
            TeacherNotification.message_id.in_(message_ids)
        ).delete(synchronize_session=False)
        db.query(ParentNotification).filter(
            ParentNotification.message_id.in_(message_ids)
        ).delete(synchronize_session=False)
        db.query(MessageReply).filter(MessageReply.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(ParentTeacherMessage).filter(
            ParentTeacherMessage.id.in_(message_ids)
        ).delete(synchronize_session=False)
    if link_ids:
        db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.link_id.in_(link_ids)
        ).delete(synchronize_session=False)
    if all_ids:
        db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.performed_by_id.in_(all_ids)
        ).delete(synchronize_session=False)
        db.query(ParentContact).filter(ParentContact.parent_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ParentStudentLink).filter(
            or_(ParentStudentLink.parent_id.in_(all_ids), ParentStudentLink.student_id.in_(all_ids))
        ).delete(synchronize_session=False)
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(all_ids)).delete(synchronize_session=False)

    # Remove stale notification rows left behind by interrupted runs so a
    # reused SQLite row id can never leak unread state into a later test.
    db.query(TeacherNotification).filter(
        TeacherNotification.message_id.isnot(None),
        ~TeacherNotification.message_id.in_(db.query(ParentTeacherMessage.id)),
    ).delete(synchronize_session=False)
    db.query(ParentNotification).filter(
        ParentNotification.message_id.isnot(None),
        ~ParentNotification.message_id.in_(db.query(ParentTeacherMessage.id)),
    ).delete(synchronize_session=False)

    db.commit()


@pytest.fixture
def db():
    session = SessionLocal()
    _cleanup(session)
    try:
        yield session
    finally:
        _cleanup(session)
        session.close()


# ---------------------------------------------------------------------------
# Scenario 1: parent sees connected child and the assigned teacher
# ---------------------------------------------------------------------------
def test_01_parent_sees_connected_child_and_assigned_teacher_only(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Child")
    other_student = _make_user(db, "student", class_name=class_name, name="Phase7 Other Child")
    other_parent = _make_user(db, "parent", name="Phase7 Other Parent")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Assigned Teacher"
    )
    _link(db, parent, student)
    _link(db, other_parent, other_student)

    children = client.get("/api/parent/links", headers=_headers(parent))
    assert children.status_code == 200, children.text
    child_ids = {child["student_id"] for child in children.json()}
    assert child_ids == {student.id}

    assigned = client.get(
        f"/api/parent/children/{student.id}/teacher", headers=_headers(parent)
    )
    assert assigned.status_code == 200, assigned.text
    body = assigned.json()
    assert body["teacher_id"] == teacher.id
    assert body["teacher_name"] == teacher.full_name
    assert body["student_name"] == student.full_name

    # A different verified parent cannot resolve another family's teacher.
    denied = client.get(
        f"/api/parent/children/{student.id}/teacher", headers=_headers(other_parent)
    )
    assert denied.status_code == 403

    # Nor can a parent probe a student they are not linked to.
    unlinked = _make_user(db, "parent", name="Phase7 Unlinked Parent")
    probe = client.get(
        f"/api/parent/children/{student.id}/teacher", headers=_headers(unlinked)
    )
    assert probe.status_code == 403


# ---------------------------------------------------------------------------
# Scenario 2: parent message reaches the assigned teacher with full context
# ---------------------------------------------------------------------------
def test_02_parent_message_reaches_assigned_teacher_inbox(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Message Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Message Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Message Teacher"
    )
    _link(db, parent, student)

    sent = _send_message(parent, student)
    assert sent.status_code == 201, sent.text
    payload = sent.json()
    assert payload["parent_id"] == parent.id
    assert payload["parent_name"] == parent.full_name
    assert payload["teacher_id"] == teacher.id
    assert payload["teacher_name"] == teacher.full_name
    assert payload["student_id"] == student.id
    assert payload["student_name"] == student.full_name
    assert payload["status"] == "open"
    assert payload["subject"] == "Help with fractions"
    assert payload["is_unread"] is False
    assert payload["created_at"]

    inbox = client.get("/api/teacher/messages", headers=_headers(teacher))
    assert inbox.status_code == 200, inbox.text
    threads = [item for item in inbox.json() if item["id"] == payload["id"]]
    assert len(threads) == 1
    thread = threads[0]
    assert thread["parent_name"] == parent.full_name
    assert thread["student_name"] == student.full_name
    assert thread["body"] == "Please help us practise fractions."
    assert thread["teacher_read_at"] is None
    assert thread["is_unread"] is True
    assert thread["created_at"]

    filtered = client.get(
        f"/api/teacher/messages?student_id={student.id}", headers=_headers(teacher)
    )
    assert filtered.status_code == 200
    assert {item["id"] for item in filtered.json()} == {payload["id"]}


# ---------------------------------------------------------------------------
# Scenario 3: opening a thread marks it read and clears unread badges
# ---------------------------------------------------------------------------
def test_03_teacher_unread_count_and_mark_read(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Badge Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Badge Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Badge Teacher"
    )
    _link(db, parent, student)
    message_id = _send_message(parent, student).json()["id"]

    before = client.get("/api/teacher/messages/unread-count", headers=_headers(teacher))
    assert before.status_code == 200, before.text
    assert before.json()["unread_messages"] == 1
    assert before.json()["unread_notifications"] == 1

    opened = client.get(f"/api/teacher/messages/{message_id}", headers=_headers(teacher))
    assert opened.status_code == 200, opened.text
    assert opened.json()["is_unread"] is False
    assert opened.json()["teacher_read_at"] is not None

    after = client.get("/api/teacher/messages/unread-count", headers=_headers(teacher))
    assert after.json()["unread_messages"] == 0
    assert after.json()["unread_notifications"] == 0

    notifications = db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher.id,
        TeacherNotification.message_id == message_id,
    ).all()
    assert notifications and all(row.is_read for row in notifications)
    assert all(row.read_at is not None for row in notifications)


# ---------------------------------------------------------------------------
# Scenario 4: teacher reply is visible to the parent with timestamps + read state
# ---------------------------------------------------------------------------
def test_04_teacher_reply_reaches_parent_with_timestamps_and_read_state(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Reply Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Reply Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Reply Teacher"
    )
    _link(db, parent, student)
    message_id = _send_message(parent, student).json()["id"]

    replied = client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={
            "body": "Let us practise two fraction questions every evening.",
            "recommended_activity": "LCM fraction worksheet",
            "meeting_requested": False,
        },
        headers=_headers(teacher),
    )
    assert replied.status_code == 200, replied.text
    assert replied.json()["status"] == "replied"
    assert replied.json()["teacher_read_at"] is not None

    history = client.get("/api/parent/messages", headers=_headers(parent))
    assert history.status_code == 200, history.text
    thread = next(item for item in history.json() if item["id"] == message_id)
    assert thread["is_unread"] is True
    assert len(thread["replies"]) == 1
    reply = thread["replies"][0]
    assert reply["author_role"] == "teacher"
    assert reply["author_name"] == teacher.full_name
    assert reply["body"] == "Let us practise two fraction questions every evening."
    assert reply["recommended_activity"] == "LCM fraction worksheet"
    assert reply["created_at"]

    alerts = client.get("/api/parent/notifications", headers=_headers(parent))
    assert alerts.status_code == 200, alerts.text
    reply_alerts = [
        item for item in alerts.json()
        if item["trigger_type"] == "teacher_reply" and item["message_id"] == message_id
    ]
    assert len(reply_alerts) == 1

    opened = client.get(f"/api/parent/messages/{message_id}", headers=_headers(parent))
    assert opened.status_code == 200, opened.text
    assert opened.json()["is_unread"] is False
    assert opened.json()["parent_read_at"] is not None


# ---------------------------------------------------------------------------
# Scenario 5: parent follow-up notifies the teacher exactly once
# ---------------------------------------------------------------------------
def test_05_parent_reply_notifies_teacher_once(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Followup Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Followup Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Followup Teacher"
    )
    _link(db, parent, student)
    message_id = _send_message(parent, student).json()["id"]

    # Teacher opens the original thread first, then the parent follows up.
    client.get(f"/api/teacher/messages/{message_id}", headers=_headers(teacher))
    follow_up = client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "We tried the worksheet. Can we meet on Friday?"},
        headers=_headers(parent),
    )
    assert follow_up.status_code == 200, follow_up.text
    assert follow_up.json()["status"] == "open"
    assert len(follow_up.json()["replies"]) == 1
    assert follow_up.json()["replies"][0]["author_role"] == "parent"

    db.expire_all()
    reply = db.query(MessageReply).filter(MessageReply.message_id == message_id).one()
    dedup_key = f"msg:{message_id}:parent-reply:{reply.id}"
    rows = db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher.id,
        TeacherNotification.dedup_key == dedup_key,
    ).all()
    assert len(rows) == 1

    # The service is idempotent even if called twice for the same parent reply.
    teacher_alerts.notify_teacher_of_parent_reply(
        db, db.query(ParentTeacherMessage).filter(ParentTeacherMessage.id == message_id).first(),
        reply_id=reply.id,
    )
    db.commit()
    rows = db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher.id,
        TeacherNotification.dedup_key == dedup_key,
    ).all()
    assert len(rows) == 1

    unread = client.get("/api/teacher/messages/unread-count", headers=_headers(teacher))
    # The original notification was cleared when the teacher opened the thread,
    # so only the parent's follow-up remains unread.
    assert unread.json()["unread_notifications"] == 1
    assert unread.json()["unread_messages"] == 1


# ---------------------------------------------------------------------------
# Scenario 6: parent -> teacher notification cannot be duplicated
# ---------------------------------------------------------------------------
def test_06_teacher_notification_for_new_message_is_idempotent(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Dedup Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Dedup Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Dedup Teacher"
    )
    _link(db, parent, student)
    message_id = _send_message(parent, student).json()["id"]

    db.expire_all()
    message = db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.id == message_id
    ).first()
    dedup_key = f"msg:{message_id}:parent:new"
    assert db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher.id,
        TeacherNotification.dedup_key == dedup_key,
    ).count() == 1

    teacher_alerts.notify_teacher_of_parent_message(db, message)
    db.commit()
    assert db.query(TeacherNotification).filter(
        TeacherNotification.teacher_id == teacher.id,
        TeacherNotification.dedup_key == dedup_key,
    ).count() == 1


# ---------------------------------------------------------------------------
# Scenario 7: reply notifications only use a verified parent email
# ---------------------------------------------------------------------------
def test_07_teacher_reply_never_emails_unverified_address(db, monkeypatch):
    class_name = _klass()
    parent = _make_user(
        db, "parent", name="Phase7 Email Parent",
        notify_email=True,
    )
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Email Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Email Teacher"
    )
    _link(db, parent, student)

    contact = ParentContact(
        parent_id=parent.id,
        contact_type="email",
        email="unverified.guardian@example.test",
        is_verified=False,
    )
    db.add(contact)
    db.commit()

    sent = []
    monkeypatch.setattr(parent_alerts, "email_is_configured", lambda: True)
    monkeypatch.setattr(
        parent_alerts,
        "_send_email",
        lambda to_address, subject, body: sent.append(to_address) or True,
    )

    message_id = _send_message(parent, student).json()["id"]
    first_reply = client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "First reply to an unverified address."},
        headers=_headers(teacher),
    )
    assert first_reply.status_code == 200, first_reply.text
    assert sent == []

    db.expire_all()
    notification = db.query(ParentNotification).filter(
        ParentNotification.parent_id == parent.id,
        ParentNotification.message_id == message_id,
        ParentNotification.trigger_type == "teacher_reply",
    ).first()
    assert notification is not None
    assert notification.email_status == "not_verified"

    # After the address is verified, a new reply is emailed right away.
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).one()
    contact.is_verified = True
    contact.verified_at = datetime.datetime.utcnow()
    db.commit()

    second_reply = client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "Second reply to the verified address."},
        headers=_headers(teacher),
    )
    assert second_reply.status_code == 200, second_reply.text
    assert sent == ["unverified.guardian@example.test"]

    db.expire_all()
    sent_notifications = db.query(ParentNotification).filter(
        ParentNotification.parent_id == parent.id,
        ParentNotification.message_id == message_id,
        ParentNotification.trigger_type == "teacher_reply",
        ParentNotification.email_status == "sent",
    ).all()
    assert len(sent_notifications) == 1


# ---------------------------------------------------------------------------
# Scenario 8: cross-parent / cross-student / cross-teacher access is blocked
# ---------------------------------------------------------------------------
def test_08_cross_parent_student_and_teacher_access_is_blocked(db):
    class_name = _klass()
    other_class_name = _klass()
    first_parent = _make_user(db, "parent", name="Phase7 Boundary Parent")
    second_parent = _make_user(db, "parent", name="Phase7 Boundary Other Parent")
    first_student = _make_user(db, "student", class_name=class_name, name="Phase7 Boundary Student")
    second_student = _make_user(db, "student", class_name=class_name, name="Phase7 Boundary Other Student")
    assigned_teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Assigned One"
    )
    same_class_teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Assigned Two"
    )
    other_class_teacher = _make_user(
        db, "teacher", class_name=other_class_name, name="Phase7 Other Class Teacher"
    )
    _link(db, first_parent, first_student)
    _link(db, second_parent, second_student)

    message_id = _send_message(first_parent, first_student).json()["id"]

    # Another parent cannot read or reply to this family's thread.
    assert client.get(
        f"/api/parent/messages/{message_id}", headers=_headers(second_parent)
    ).status_code == 404
    assert client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "Trying to join another conversation."},
        headers=_headers(second_parent),
    ).status_code == 404

    # Nor can a parent message a student they are not verified for.
    denied = _send_message(second_parent, first_student)
    assert denied.status_code == 403

    # A teacher of another class cannot see or answer the thread.
    assert client.get(
        f"/api/teacher/messages/{message_id}", headers=_headers(other_class_teacher)
    ).status_code == 403
    assert client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "Wrong class reply."},
        headers=_headers(other_class_teacher),
    ).status_code == 403

    # Even a same-class teacher who is not the assigned recipient is refused.
    assert client.get(
        f"/api/teacher/messages/{message_id}", headers=_headers(same_class_teacher)
    ).status_code == 403
    assert client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "Not my thread."},
        headers=_headers(same_class_teacher),
    ).status_code == 403

    listed_other = client.get(
        "/api/teacher/messages", headers=_headers(other_class_teacher)
    ).json()
    assert all(item["id"] != message_id for item in listed_other)
    listed_same_class = client.get(
        "/api/teacher/messages", headers=_headers(same_class_teacher)
    ).json()
    assert all(item["id"] != message_id for item in listed_same_class)

    assigned_inbox = client.get(
        "/api/teacher/messages", headers=_headers(assigned_teacher)
    ).json()
    assert [item["id"] for item in assigned_inbox] == [message_id]


# ---------------------------------------------------------------------------
# Scenario 9: revoking the link immediately disables messaging on both sides
# ---------------------------------------------------------------------------
def test_09_revoked_link_blocks_new_messages_and_hides_thread(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Revoked Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Revoked Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Revoked Teacher"
    )
    link = _link(db, parent, student)
    message_id = _send_message(parent, student).json()["id"]

    revoked = client.post(
        f"/api/student/parent-connections/{link.id}/revoke",
        headers=_headers(student),
    )
    assert revoked.status_code == 200, revoked.text

    # Parent history remains visible, but no new communication is possible.
    history = client.get("/api/parent/messages", headers=_headers(parent))
    assert history.status_code == 200
    assert any(item["id"] == message_id for item in history.json())
    assert _send_message(parent, student).status_code == 403
    assert client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "One more question."},
        headers=_headers(parent),
    ).status_code == 403

    # Teacher loses access to the thread and to the unread badge for it.
    assert client.get(
        f"/api/teacher/messages/{message_id}", headers=_headers(teacher)
    ).status_code == 403
    assert client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "Reply after revocation."},
        headers=_headers(teacher),
    ).status_code == 403
    inbox = client.get("/api/teacher/messages", headers=_headers(teacher)).json()
    assert all(item["id"] != message_id for item in inbox)
    unread = client.get("/api/teacher/messages/unread-count", headers=_headers(teacher))
    assert unread.json()["unread_messages"] == 0

    # The thread itself is retained as history for audits.
    assert db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.id == message_id
    ).count() == 1


# ---------------------------------------------------------------------------
# Scenario 10: teacher student-profile section + dashboard unread indicator
# ---------------------------------------------------------------------------
def test_10_teacher_student_profile_lists_parent_messages_and_unread_badge(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Profile Parent")
    first_student = _make_user(db, "student", class_name=class_name, name="Phase7 Profile Student")
    second_student = _make_user(db, "student", class_name=class_name, name="Phase7 Profile Other Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Profile Teacher"
    )
    _link(db, parent, first_student)
    _link(db, parent, second_student)

    first_id = _send_message(
        parent, first_student, subject="First child question"
    ).json()["id"]
    second_id = _send_message(
        parent, second_student, subject="Second child question"
    ).json()["id"]

    detail = client.get(
        f"/api/teacher/students/{first_student.id}", headers=_headers(teacher)
    )
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["student_id"] == first_student.id
    assert body["full_name"] == first_student.full_name
    assert body["unread_parent_messages"] == 1
    assert body["unread_parent_notifications"] == 1

    # The profile section only shows this student's conversation.
    filtered = client.get(
        f"/api/teacher/messages?student_id={first_student.id}", headers=_headers(teacher)
    )
    assert filtered.status_code == 200
    assert [item["id"] for item in filtered.json()] == [first_id]
    assert filtered.json()[0]["parent_name"] == parent.full_name
    assert filtered.json()[0]["student_name"] == first_student.full_name

    count = client.get(
        f"/api/teacher/messages/unread-count?student_id={first_student.id}",
        headers=_headers(teacher),
    )
    assert count.status_code == 200
    assert count.json()["unread_messages"] == 1
    assert count.json()["unread_notifications"] == 1

    # Opening the first child's thread only clears that child's badge.
    client.get(f"/api/teacher/messages/{first_id}", headers=_headers(teacher))
    first_after = client.get(
        f"/api/teacher/students/{first_student.id}", headers=_headers(teacher)
    ).json()
    assert first_after["unread_parent_messages"] == 0
    assert first_after["unread_parent_notifications"] == 0

    second_after = client.get(
        f"/api/teacher/students/{second_student.id}", headers=_headers(teacher)
    ).json()
    assert second_after["unread_parent_messages"] == 1
    assert second_after["unread_parent_notifications"] == 1
    assert second_id != first_id

# ---------------------------------------------------------------------------
# Scenario 11: profile thread list matches thread-open authorization
# ---------------------------------------------------------------------------
def test_11_profile_thread_list_matches_open_authorization(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Consistency Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Consistency Student")
    assigned_teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Consistency Assigned"
    )
    same_class_teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Consistency Colleague"
    )
    _link(db, parent, student)

    message_id = _send_message(parent, student).json()["id"]

    listed = client.get(
        f"/api/teacher/messages?student_id={student.id}",
        headers=_headers(assigned_teacher),
    )
    assert listed.status_code == 200, listed.text
    assert [item["id"] for item in listed.json()] == [message_id]

    # The colleague must neither see nor open the thread, so the profile never
    # advertises an unopenable conversation.
    colleague_list = client.get(
        f"/api/teacher/messages?student_id={student.id}",
        headers=_headers(same_class_teacher),
    )
    assert colleague_list.status_code == 200
    assert all(item["id"] != message_id for item in colleague_list.json())
    assert client.get(
        f"/api/teacher/messages/{message_id}", headers=_headers(same_class_teacher)
    ).status_code == 403

    # Their profile badge must also ignore the colleague's thread.
    colleague_detail = client.get(
        f"/api/teacher/students/{student.id}", headers=_headers(same_class_teacher)
    )
    assert colleague_detail.status_code == 200
    assert colleague_detail.json()["unread_parent_messages"] == 0


# ---------------------------------------------------------------------------
# Scenario 12: teacher-initiated conversation with a verified guardian
# ---------------------------------------------------------------------------
def test_12_teacher_can_start_conversation_with_verified_parent(db):
    class_name = _klass()
    parent = _make_user(db, "parent", name="Phase7 Initiated Parent")
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Initiated Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Initiated Teacher"
    )
    _link(db, parent, student)

    created = client.post(
        "/api/teacher/messages",
        json={
            "student_id": student.id,
            "category": "support_request",
            "subject": "Weekly fractions check-in",
            "body": "Aarav has been practising fractions. Could you encourage 10 minutes at home?",
            "recommended_activity": "Fraction wall practice for 10 minutes",
            "meeting_requested": True,
        },
        headers=_headers(teacher),
    )
    assert created.status_code == 201, created.text
    data = created.json()
    message_id = data["id"]
    assert data["teacher_id"] == teacher.id
    assert data["parent_id"] == parent.id
    assert data["student_id"] == student.id
    assert data["initiated_by_role"] == "teacher"
    assert data["status"] == "open"

    # The parent receives exactly one in-app notification for the new thread.
    notifications = db.query(ParentNotification).filter(
        ParentNotification.parent_id == parent.id,
        ParentNotification.message_id == message_id,
    ).all()
    assert len(notifications) == 1
    assert notifications[0].category == "teacher_message"

    # Parent inbox marks it unread; opening it clears the flag.
    parent_list = client.get("/api/parent/messages", headers=_headers(parent))
    assert parent_list.status_code == 200
    listed = next(item for item in parent_list.json() if item["id"] == message_id)
    assert listed["is_unread"] is True
    assert listed["initiated_by_role"] == "teacher"

    opened = client.get(f"/api/parent/messages/{message_id}", headers=_headers(parent))
    assert opened.status_code == 200
    assert opened.json()["is_unread"] is False

    # The parent can reply in the same thread and the teacher sees it unread.
    reply = client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "Thank you, we will practise tonight."},
        headers=_headers(parent),
    )
    assert reply.status_code == 200, reply.text

    # The parent's follow-up is unread for the teacher until the thread opens.
    unread = client.get(
        "/api/teacher/messages/unread-count", headers=_headers(teacher)
    )
    assert unread.status_code == 200
    assert unread.json()["unread_messages"] == 1

    thread = client.get(
        f"/api/teacher/messages/{message_id}", headers=_headers(teacher)
    )
    assert thread.status_code == 200
    assert any(r["author_role"] == "parent" for r in thread.json()["replies"])

    # A teacher outside the class cannot start a conversation.
    other_teacher = _make_user(
        db, "teacher", class_name=_klass(), name="Phase7 Initiated Outsider"
    )
    denied = client.post(
        "/api/teacher/messages",
        json={
            "student_id": student.id,
            "subject": "Not my class",
            "body": "Trying to reach another class family.",
        },
        headers=_headers(other_teacher),
    )
    assert denied.status_code == 403


def test_13_teacher_cannot_start_conversation_without_verified_parent(db):
    class_name = _klass()
    student = _make_user(db, "student", class_name=class_name, name="Phase7 Unlinked Student")
    teacher = _make_user(
        db, "teacher", class_name=class_name, name="Phase7 Unlinked Teacher"
    )

    res = client.post(
        "/api/teacher/messages",
        json={
            "student_id": student.id,
            "subject": "No guardian yet",
            "body": "This must not be delivered anywhere.",
        },
        headers=_headers(teacher),
    )
    assert res.status_code == 409


# ---------------------------------------------------------------------------
# Scenario 14: teacher student list/detail/search are class scoped
# ---------------------------------------------------------------------------
def test_14_teacher_student_endpoints_are_class_scoped(db):
    own_class = _klass()
    other_class = _klass()
    teacher = _make_user(db, "teacher", class_name=own_class, name="Phase7 Scope Teacher")
    own_student = _make_user(db, "student", class_name=own_class, name="Phase7 Scope Own")
    other_student = _make_user(db, "student", class_name=other_class, name="Phase7 Scope Other")
    admin = _make_user(db, "admin", class_name=own_class, name="Phase7 Scope Admin")

    # Own-class detail works; other-class detail is forbidden (IDOR guard).
    assert client.get(
        f"/api/teacher/students/{own_student.id}", headers=_headers(teacher)
    ).status_code == 200
    assert client.get(
        f"/api/teacher/students/{other_student.id}", headers=_headers(teacher)
    ).status_code == 403

    # Listing another class is forbidden for teachers, allowed for admins.
    denied = client.get(
        f"/api/teacher/students?class_name={other_class}", headers=_headers(teacher)
    )
    assert denied.status_code == 403
    assert client.get(
        f"/api/teacher/students?class_name={other_class}", headers=_headers(admin)
    ).status_code == 200

    # Default listing never leaks another class.
    default_list = client.get("/api/teacher/students", headers=_headers(teacher))
    assert default_list.status_code == 200
    assert all(item["class_name"] == own_class for item in default_list.json())

    # Search is restricted to the teacher's class.
    search = client.get(
        f"/api/teacher/students/search?q={other_student.full_name}",
        headers=_headers(teacher),
    )
    assert search.status_code == 200
    assert search.json()["total"] == 0
    assert all(item["id"] != other_student.id for item in search.json()["results"])
