"""
Phase 4 acceptance tests: evidence-based parent notifications, consent,
parent-teacher messaging, and relationship/class authorization boundaries.

Everything runs against the real FastAPI app and the real SQLite database.
Every record created here is removed in teardown.
"""
import datetime
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import or_

from app.main import app
from app.database import SessionLocal
from app.models import (
    User, ParentProfile, ParentStudentLink, ParentNotification,
    ParentTeacherMessage, MessageReply, Attempt, Concept, ConceptMastery,
)
from app.auth import create_access_token, hash_password
from app.services import parent_alerts

client = TestClient(app)


def _uid(prefix="phase4"):
    return f"phase4_{prefix}_{uuid.uuid4().hex[:12]}"


def _make_user(db, role, class_name="Class 8 - Section A", name=None, language="te"):
    user = User(
        email=f"{_uid(role)}@udaan.test",
        hashed_password=hash_password("udaan123"),
        full_name=name or f"Phase4 {role.title()}",
        role=role,
        class_name=class_name,
        grade=8,
        is_active=True,
        created_by="phase4_test",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if role == "parent":
        db.add(ParentProfile(
            user_id=user.id,
            preferred_language=language,
            contact_method="in_app",
            is_verified=True,
            notifications_consent=True,
            notify_in_app=True,
        ))
        db.commit()
        db.refresh(user)
    return user


def _headers(user):
    token = create_access_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"Authorization": f"Bearer {token}"}


def _link(db, parent, student, status="verified"):
    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="parent",
        status=status,
        verification_method="teacher_assisted",
        verified_at=datetime.datetime.utcnow() if status == "verified" else None,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _concept(db):
    concept = db.query(Concept).order_by(Concept.sequence_order).first()
    assert concept is not None, "Seeded curriculum concepts are required for Phase 4 tests"
    return concept


def _attempt(db, student, concept, *, correct, question_id=None, days_ago=0):
    when = datetime.datetime.utcnow() - datetime.timedelta(days=days_ago)
    attempt = Attempt(
        id=f"phase4-{uuid.uuid4().hex}",
        user_id=student.id,
        question_id=question_id or f"Q-{uuid.uuid4().hex[:8]}",
        concept_id=concept.id,
        selected_index=0,
        is_correct=correct,
        hints_used=0,
        time_spent_sec=10.0,
        attempt_source="practice",
        created_at=when,
        synced_at=when,
    )
    db.add(attempt)
    db.commit()
    return attempt


def _mastery(db, student, concept, *, score=0.3, attempts_count=0):
    mastery = db.query(ConceptMastery).filter(
        ConceptMastery.user_id == student.id,
        ConceptMastery.concept_id == concept.id,
    ).first()
    if not mastery:
        mastery = ConceptMastery(
            user_id=student.id,
            concept_id=concept.id,
            mastery_score=score,
            bkt_p=score,
            attempts_count=attempts_count,
            last_attempt_at=datetime.datetime.utcnow(),
        )
        db.add(mastery)
    else:
        mastery.mastery_score = score
        mastery.bkt_p = score
        mastery.attempts_count = attempts_count
    db.commit()
    db.refresh(mastery)
    return mastery


def _cleanup(db):
    test_users = db.query(User).filter(User.email.like("phase4_%@udaan.test")).all()
    ids = {u.id for u in test_users}

    links = db.query(ParentStudentLink).filter(
        or_(ParentStudentLink.parent_id.in_(ids), ParentStudentLink.student_id.in_(ids))
    ).all() if ids else []
    link_ids = {l.id for l in links}
    all_ids = set(ids) | {l.parent_id for l in links} | {l.student_id for l in links}

    messages = db.query(ParentTeacherMessage).filter(
        or_(
            ParentTeacherMessage.parent_id.in_(all_ids),
            ParentTeacherMessage.teacher_id.in_(all_ids),
            ParentTeacherMessage.student_id.in_(all_ids),
        )
    ).all() if all_ids else []
    message_ids = {m.id for m in messages}

    if message_ids:
        db.query(MessageReply).filter(MessageReply.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(ParentNotification).filter(ParentNotification.message_id.in_(message_ids)).delete(synchronize_session=False)
        db.query(ParentTeacherMessage).filter(ParentTeacherMessage.id.in_(message_ids)).delete(synchronize_session=False)

    if all_ids:
        db.query(ParentNotification).filter(
            or_(
                ParentNotification.parent_id.in_(all_ids),
                ParentNotification.student_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
        db.query(MessageReply).filter(MessageReply.author_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(Attempt).filter(Attempt.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ConceptMastery).filter(ConceptMastery.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ParentStudentLink).filter(
            or_(ParentStudentLink.parent_id.in_(all_ids), ParentStudentLink.student_id.in_(all_ids))
        ).delete(synchronize_session=False)
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(all_ids)).delete(synchronize_session=False)

    db.commit()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        _cleanup(session)
        session.close()


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def test_single_wrong_answer_never_triggers_alert_but_repeated_evidence_does(db):
    student = _make_user(db, "student", name="Phase4 Alert Student")
    parent = _make_user(db, "parent", name="Phase4 Alert Parent", language="te")
    _link(db, parent, student)
    concept = _concept(db)

    # One wrong answer is not evidence of a learning gap.
    _mastery(db, student, concept, score=0.3, attempts_count=1)
    _attempt(db, student, concept, correct=False, question_id="Q-ONE")

    first = client.get("/api/parent/notifications", headers=_headers(parent))
    assert first.status_code == 200, first.text
    assert first.json() == [], "A single incorrect answer must not raise a parent alert"

    # Repeated mistakes across more than one question are evidence.
    _attempt(db, student, concept, correct=False, question_id="Q-TWO")
    _attempt(db, student, concept, correct=False, question_id="Q-THREE")

    second = client.get("/api/parent/notifications", headers=_headers(parent))
    assert second.status_code == 200, second.text
    alerts = second.json()
    assert len(alerts) == 1, alerts
    alert = alerts[0]
    assert alert["trigger_type"] in ("repeated_mistakes", "low_mastery", "no_improvement", "decline")
    assert alert["student_id"] == student.id
    assert alert["language"] == "te"
    assert alert["is_read"] is False
    assert alert["title"] and alert["body"]
    assert "Phase4" in alert["body"]  # child's first name, not full email/records

    # Repeated evaluation is idempotent (dedup + cooldown).
    again = client.get("/api/parent/notifications", headers=_headers(parent))
    assert len(again.json()) == 1

    # Marking read is ownership checked and persists.
    marked = client.post(f"/api/parent/notifications/{alert['id']}/read", headers=_headers(parent))
    assert marked.status_code == 200
    assert marked.json()["is_read"] is True

    other_parent = _make_user(db, "parent", name="Phase4 Other Parent")
    forbidden = client.post(f"/api/parent/notifications/{alert['id']}/read", headers=_headers(other_parent))
    assert forbidden.status_code == 404

    assert client.post("/api/parent/notifications/read-all", headers=_headers(parent)).json()["updated"] == 0


def test_consent_and_notification_preferences_are_respected(db):
    student = _make_user(db, "student", name="Phase4 Consent Student")
    parent = _make_user(db, "parent", name="Phase4 Consent Parent", language="en")
    _link(db, parent, student)
    concept = _concept(db)
    _mastery(db, student, concept, score=0.25, attempts_count=8)
    for i in range(4):
        _attempt(db, student, concept, correct=False, question_id=f"Q-C{i}")

    # Revoking consent disables every channel immediately.
    prefs = client.put(
        "/api/parent/notification-preferences",
        json={"notifications_consent": False},
        headers=_headers(parent),
    )
    assert prefs.status_code == 200, prefs.text
    body = prefs.json()
    assert body["notifications_consent"] is False
    assert body["notify_in_app"] is False
    assert body["notify_email"] is False

    assert client.get("/api/parent/notifications", headers=_headers(parent)).json() == []

    # Re-enabling consent with the in-app toggle off must still record the
    # alert in-app: in-app history is the guaranteed channel.
    client.put(
        "/api/parent/notification-preferences",
        json={"notifications_consent": True, "notify_in_app": False, "notify_email": True},
        headers=_headers(parent),
    )
    alerts = client.get("/api/parent/notifications", headers=_headers(parent)).json()
    assert len(alerts) == 1, alerts
    assert alerts[0]["language"] == "en"
    assert alerts[0]["email_status"] == "not_configured"


def test_low_mastery_needs_sufficient_assessment_and_two_sessions(db):
    student = _make_user(db, "student", name="Phase4 Low Mastery Student")
    parent = _make_user(db, "parent", name="Phase4 Low Mastery Parent")
    _link(db, parent, student)
    concept = _concept(db)

    # Low score but only one session and too few attempts: no alert.
    _mastery(db, student, concept, score=0.2, attempts_count=2)
    _attempt(db, student, concept, correct=True, question_id="Q-A")
    _attempt(db, student, concept, correct=False, question_id="Q-B")
    assert parent_alerts.evaluate_student_alerts(db, student) == []
    db.commit()

    # Enough assessed attempts across two days: alert is justified.
    _attempt(db, student, concept, correct=False, question_id="Q-C", days_ago=1)
    _attempt(db, student, concept, correct=False, question_id="Q-D", days_ago=1)
    _attempt(db, student, concept, correct=False, question_id="Q-E", days_ago=1)
    _attempt(db, student, concept, correct=False, question_id="Q-F", days_ago=1)
    _mastery(db, student, concept, score=0.2, attempts_count=6)

    created = parent_alerts.evaluate_student_alerts(db, student)
    db.commit()
    assert len(created) == 1
    assert created[0].parent_id == parent.id
    assert created[0].category == "learning_support"


# ---------------------------------------------------------------------------
# Parent -> teacher messaging
# ---------------------------------------------------------------------------
def test_verified_parent_and_assigned_teacher_full_conversation(db):
    student = _make_user(db, "student", class_name="Phase4 Conversation Class", name="Phase4 Message Student")
    parent = _make_user(db, "parent", name="Phase4 Message Parent", language="te")
    teacher = _make_user(db, "teacher", class_name="Phase4 Conversation Class", name="Phase4 Message Teacher")
    _link(db, parent, student)

    created = client.post(
        "/api/parent/messages",
        json={
            "student_id": student.id,
            "category": "learning_difficulty",
            "subject": "Needs help with fractions",
            "body": "My child finds fractions difficult at home. Can you suggest practice?",
        },
        headers=_headers(parent),
    )
    assert created.status_code == 201, created.text
    message = created.json()
    assert message["teacher_id"] == teacher.id
    assert message["status"] == "open"
    assert message["category"] == "learning_difficulty"

    inbox = client.get("/api/teacher/messages", headers=_headers(teacher))
    assert inbox.status_code == 200, inbox.text
    listed = next(m for m in inbox.json() if m["id"] == message["id"])
    assert listed["is_unread"] is True

    opened = client.get(f"/api/teacher/messages/{message['id']}", headers=_headers(teacher))
    assert opened.status_code == 200
    assert opened.json()["is_unread"] is False

    replied = client.post(
        f"/api/teacher/messages/{message['id']}/reply",
        json={
            "body": "Please practise equivalent fractions for 10 minutes. I will check in class.",
            "recommended_activity": "Equivalent fractions worksheet, 10 minutes",
            "meeting_requested": True,
        },
        headers=_headers(teacher),
    )
    assert replied.status_code == 200, replied.text
    thread = replied.json()
    assert thread["status"] == "replied"
    assert thread["replies"][-1]["author_role"] == "teacher"
    assert thread["replies"][-1]["recommended_activity"].startswith("Equivalent fractions")
    assert thread["replies"][-1]["meeting_requested"] is True

    parent_inbox = client.get("/api/parent/messages", headers=_headers(parent))
    assert parent_inbox.status_code == 200
    parent_thread = next(m for m in parent_inbox.json() if m["id"] == message["id"])
    assert parent_thread["is_unread"] is True

    notifications = client.get("/api/parent/notifications", headers=_headers(parent)).json()
    teacher_alert = next(n for n in notifications if n["category"] == "teacher_message")
    assert teacher_alert["message_id"] == message["id"]
    assert teacher_alert["language"] == "te"

    # Parent reads the reply and follows up.
    read = client.get(f"/api/parent/messages/{message['id']}", headers=_headers(parent))
    assert read.json()["is_unread"] is False

    follow_up = client.post(
        f"/api/parent/messages/{message['id']}/reply",
        json={"body": "Thank you. We will try this today."},
        headers=_headers(parent),
    )
    assert follow_up.status_code == 200, follow_up.text
    assert follow_up.json()["status"] == "open"

    recheck = client.get("/api/teacher/messages", headers=_headers(teacher)).json()
    assert next(m for m in recheck if m["id"] == message["id"])["is_unread"] is True

    resolved = client.post(
        f"/api/teacher/messages/{message['id']}/resolve",
        json={"resolution_note": "Spoke with the parent. Practice assigned."},
        headers=_headers(teacher),
    )
    assert resolved.status_code == 200, resolved.text
    assert resolved.json()["status"] == "resolved"
    assert resolved.json()["resolved_at"] is not None


def test_messaging_blocks_unverified_links_unassigned_teachers_and_other_parents(db):
    student = _make_user(db, "student", class_name="Phase4 Guard Class", name="Phase4 Guard Student")
    pending_student = _make_user(db, "student", class_name="Phase4 Guard Class", name="Phase4 Pending Student")
    parent = _make_user(db, "parent", name="Phase4 Guard Parent")
    pending_parent = _make_user(db, "parent", name="Phase4 Pending Parent")
    other_parent = _make_user(db, "parent", name="Phase4 Outsider Parent")
    teacher = _make_user(db, "teacher", class_name="Phase4 Guard Class", name="Phase4 Guard Teacher")
    other_teacher = _make_user(db, "teacher", class_name="Phase4 Guard Other", name="Phase4 Other Teacher")

    _link(db, parent, student, status="verified")
    # A pending guardian lives on a separate student: one student can never
    # have both a verified and a pending parent at the same time.
    _link(db, pending_parent, pending_student, status="pending")

    # No verified relationship -> cannot message.
    denied = client.post(
        "/api/parent/messages",
        json={"student_id": pending_student.id, "category": "question", "subject": "Hello", "body": "Can we talk?"},
        headers=_headers(pending_parent),
    )
    assert denied.status_code == 403

    # The verified parent can create the thread.
    created = client.post(
        "/api/parent/messages",
        json={"student_id": student.id, "category": "support_request", "subject": "Support", "body": "Please help."},
        headers=_headers(parent),
    )
    assert created.status_code == 201, created.text
    message_id = created.json()["id"]

    # An unrelated teacher cannot see, open, reply to, or resolve the thread.
    assert client.get("/api/teacher/messages", headers=_headers(other_teacher)).json() == []
    assert client.get(f"/api/teacher/messages/{message_id}", headers=_headers(other_teacher)).status_code == 403
    assert client.post(
        f"/api/teacher/messages/{message_id}/reply",
        json={"body": "Not my student"},
        headers=_headers(other_teacher),
    ).status_code == 403

    # Another parent cannot read or reply to the thread.
    assert client.get(f"/api/parent/messages/{message_id}", headers=_headers(other_parent)).status_code == 404
    assert client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "Not mine"},
        headers=_headers(other_parent),
    ).status_code == 404

    # Revoking the relationship stops new communication immediately.
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student.id,
    ).first()
    link.status = "revoked"
    link.revoked_at = datetime.datetime.utcnow()
    db.commit()

    assert client.post(
        f"/api/parent/messages/{message_id}/reply",
        json={"body": "One more question"},
        headers=_headers(parent),
    ).status_code == 403
    assert client.get(f"/api/teacher/messages/{message_id}", headers=_headers(teacher)).status_code == 403
    # Revocation also removes the thread from the teacher's inbox listing.
    assert client.get("/api/teacher/messages", headers=_headers(teacher)).json() == []


def test_teacher_only_sees_parents_of_own_class(db):
    own_student = _make_user(db, "student", class_name="Phase4 Own Class", name="Phase4 Own Student")
    other_student = _make_user(db, "student", class_name="Phase4 Other Class", name="Phase4 Other Student")
    own_parent = _make_user(db, "parent", name="Phase4 Own Parent")
    other_parent = _make_user(db, "parent", name="Phase4 Other Parent")
    teacher = _make_user(db, "teacher", class_name="Phase4 Own Class", name="Phase4 Class Teacher")
    other_teacher = _make_user(db, "teacher", class_name="Phase4 Other Class", name="Phase4 B Teacher")

    _link(db, own_parent, own_student)
    _link(db, other_parent, other_student)

    own_msg = client.post(
        "/api/parent/messages",
        json={"student_id": own_student.id, "category": "question", "subject": "Own class", "body": "Hello"},
        headers=_headers(own_parent),
    )
    other_msg = client.post(
        "/api/parent/messages",
        json={"student_id": other_student.id, "category": "question", "subject": "Other class", "body": "Hello"},
        headers=_headers(other_parent),
    )
    assert own_msg.status_code == 201, own_msg.text
    assert other_msg.status_code == 201, other_msg.text

    own_inbox = client.get("/api/teacher/messages", headers=_headers(teacher)).json()
    assert [m["subject"] for m in own_inbox] == ["Own class"]

    other_inbox = client.get("/api/teacher/messages", headers=_headers(other_teacher)).json()
    assert [m["subject"] for m in other_inbox] == ["Other class"]
