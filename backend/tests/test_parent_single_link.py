"""Acceptance tests for the one-parent-per-student invariant.

The product rule is intentionally strict: a student may have at most one
``pending`` **or** ``verified`` parent relationship at any moment. Rejected,
revoked and expired rows release the student and remain as history.

Every test runs against the real FastAPI app, the real SQLite database and the
real partial unique index (``uq_active_parent_per_student``). Records created
here are removed in teardown.
"""
import datetime
import hashlib
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.database import SessionLocal
from app.models import (
    ParentInvitation,
    ParentProfile,
    ParentStudentLink,
    RelationshipAuditLog,
    User,
)
from app.auth import create_access_token, hash_password
from app.services import parent_links

client = TestClient(app)

ALREADY_CONNECTED = "This student is already connected to a parent account."


def _uid(prefix="phase6"):
    return f"phase6_{prefix}_{uuid.uuid4().hex[:12]}"


def _make_user(db, role, class_name="Class 8 - Section A", name=None):
    user = User(
        email=f"{_uid(role)}@udaan.test",
        hashed_password=hash_password("udaan123"),
        full_name=name or f"Phase6 {role.title()}",
        role=role,
        class_name=class_name,
        grade=8,
        is_active=True,
        created_by="phase6_test",
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
        ))
        db.commit()
        db.refresh(user)
    return user


def _headers(user):
    token = create_access_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"Authorization": f"Bearer {token}"}


def _seed_invitation(db, student, *, raw_code=None):
    raw_code = raw_code or f"UD-{uuid.uuid4().hex[:8].upper()}"
    invitation = ParentInvitation(
        code_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
        student_id=student.id,
        created_by_id=student.id,
        role_target="parent",
        relationship_type="parent",
        preferred_language="en",
        max_attempts=5,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=7),
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return raw_code


def _direct_link(db, parent, student, *, status="pending", expires_at=None):
    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="parent",
        status=status,
        verification_method="teacher_assisted",
        verified_at=datetime.datetime.utcnow() if status == "verified" else None,
        expires_at=expires_at,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _connect(parent, code):
    return client.post(
        "/api/parent/connect-student",
        json={"invitation_code": code, "relationship_type": "parent"},
        headers=_headers(parent),
    )


def _active_links(db, student):
    db.expire_all()
    return db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == student.id,
        ParentStudentLink.status.in_(("pending", "verified")),
    ).all()


def _cleanup(db):
    test_users = db.query(User).filter(User.email.like("phase6_%@udaan.test")).all()
    ids = {u.id for u in test_users}

    links = db.query(ParentStudentLink).filter(
        or_(ParentStudentLink.parent_id.in_(ids), ParentStudentLink.student_id.in_(ids))
    ).all() if ids else []
    link_ids = {link.id for link in links}
    all_ids = set(ids) | {link.parent_id for link in links} | {link.student_id for link in links}

    if link_ids:
        db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.link_id.in_(link_ids)
        ).delete(synchronize_session=False)
    if all_ids:
        db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.performed_by_id.in_(all_ids)
        ).delete(synchronize_session=False)
        db.query(ParentInvitation).filter(
            or_(
                ParentInvitation.student_id.in_(all_ids),
                ParentInvitation.created_by_id.in_(all_ids),
                ParentInvitation.redeemed_by_parent_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
        db.query(ParentStudentLink).filter(
            or_(ParentStudentLink.parent_id.in_(all_ids), ParentStudentLink.student_id.in_(all_ids))
        ).delete(synchronize_session=False)
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(all_ids)).delete(synchronize_session=False)

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
# Scenario 1: no parent yet -> invitation + pending request works
# ---------------------------------------------------------------------------
def test_01_student_without_parent_can_start_a_connection(db):
    student = _make_user(db, "student", name="Phase6 Solo Student")
    parent = _make_user(db, "parent", name="Phase6 First Parent")

    assert db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == student.id
    ).count() == 0

    invitation = client.post(
        "/api/student/parent-invitation",
        json={"relationship_type": "parent", "preferred_language": "en"},
        headers=_headers(student),
    )
    assert invitation.status_code == 201, invitation.text
    code = invitation.json()["invitation_code"]

    connected = _connect(parent, code)
    assert connected.status_code == 200, connected.text
    body = connected.json()
    assert body["status"] == "pending_approval"
    assert body["student_id"] == student.id

    active = _active_links(db, student)
    assert len(active) == 1
    assert active[0].parent_id == parent.id
    assert active[0].status == "pending"
    assert active[0].expires_at is not None


# ---------------------------------------------------------------------------
# Scenario 2: a verified relationship blocks a different parent
# ---------------------------------------------------------------------------
def test_02_second_parent_blocked_by_verified_link_without_leaking_details(db):
    student = _make_user(db, "student", name="Phase6 Protected Student")
    first_parent = _make_user(db, "parent", name="Phase6 Existing Parent")
    second_parent = _make_user(db, "parent", name="Phase6 Intruder Parent")
    _direct_link(db, first_parent, student, status="verified")
    code = _seed_invitation(db, student)

    blocked = _connect(second_parent, code)
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"] == ALREADY_CONNECTED

    # The error must never reveal who holds the relationship.
    text = blocked.text
    assert first_parent.full_name not in text
    assert first_parent.email not in text
    assert str(first_parent.id) not in text

    assert db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == second_parent.id,
        ParentStudentLink.student_id == student.id,
    ).count() == 0
    assert [link.parent_id for link in _active_links(db, student)] == [first_parent.id]


# ---------------------------------------------------------------------------
# Scenario 3: a pending request also reserves the student
# ---------------------------------------------------------------------------
def test_03_second_parent_blocked_by_pending_request(db):
    student = _make_user(db, "student", name="Phase6 Reserved Student")
    first_parent = _make_user(db, "parent", name="Phase6 Pending Parent")
    second_parent = _make_user(db, "parent", name="Phase6 Late Parent")
    _direct_link(db, first_parent, student, status="pending")
    code = _seed_invitation(db, student)

    blocked = _connect(second_parent, code)
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"] == ALREADY_CONNECTED
    assert second_parent.full_name not in blocked.text

    assert db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == student.id,
        ParentStudentLink.status.in_(("pending", "verified")),
    ).count() == 1


# ---------------------------------------------------------------------------
# Scenario 4: same parent re-requesting a pending link is idempotent
# ---------------------------------------------------------------------------
def test_04_same_parent_repeat_pending_request_is_idempotent(db):
    student = _make_user(db, "student", name="Phase6 Repeat Student")
    parent = _make_user(db, "parent", name="Phase6 Repeat Parent")
    first = _direct_link(db, parent, student, status="pending")

    code = _seed_invitation(db, student)
    repeat = _connect(parent, code)
    assert repeat.status_code == 200, repeat.text
    assert repeat.json()["status"] == "pending_approval"
    assert repeat.json()["link_id"] == first.id

    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student.id,
    ).all()
    assert len(links) == 1
    assert links[0].status == "pending"


# ---------------------------------------------------------------------------
# Scenario 5: same parent re-requesting after verification is idempotent
# ---------------------------------------------------------------------------
def test_05_same_parent_repeat_verified_returns_already_connected(db):
    student = _make_user(db, "student", name="Phase6 Verified Repeat Student")
    parent = _make_user(db, "parent", name="Phase6 Verified Repeat Parent")
    first = _direct_link(db, parent, student, status="verified")

    code = _seed_invitation(db, student)
    repeat = _connect(parent, code)
    assert repeat.status_code == 200, repeat.text
    assert repeat.json()["status"] == "already_connected"
    assert repeat.json()["link_id"] == first.id

    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student.id,
    ).all()
    assert len(links) == 1
    assert links[0].status == "verified"


# ---------------------------------------------------------------------------
# Scenario 6: student approval establishes the single verified relationship
# ---------------------------------------------------------------------------
def test_06_student_approval_creates_one_verified_link_and_blocks_others(db):
    student = _make_user(db, "student", name="Phase6 Approving Student")
    first_parent = _make_user(db, "parent", name="Phase6 Approved Parent")
    other_parent = _make_user(db, "parent", name="Phase6 Other Parent")
    pending = _direct_link(db, first_parent, student, status="pending")
    code = _seed_invitation(db, student)

    approved = client.post(
        f"/api/student/parent-connections/{pending.id}/approve",
        headers=_headers(student),
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "verified"

    active = _active_links(db, student)
    assert len(active) == 1
    assert active[0].id == pending.id
    assert active[0].verified_at is not None
    assert active[0].expires_at is None

    blocked = _connect(other_parent, code)
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == ALREADY_CONNECTED

    # The database itself enforces the invariant, not just the router.
    with pytest.raises(IntegrityError):
        db.add(ParentStudentLink(
            parent_id=other_parent.id,
            student_id=student.id,
            relationship_type="parent",
            status="pending",
        ))
        db.commit()
    db.rollback()
    assert len(_active_links(db, student)) == 1


# ---------------------------------------------------------------------------
# Scenario 7: rejecting a pending request releases the student
# ---------------------------------------------------------------------------
def test_07_student_reject_releases_student_for_another_parent(db):
    student = _make_user(db, "student", name="Phase6 Rejecting Student")
    rejected_parent = _make_user(db, "parent", name="Phase6 Rejected Parent")
    next_parent = _make_user(db, "parent", name="Phase6 Next Parent")
    pending = _direct_link(db, rejected_parent, student, status="pending")
    code = _seed_invitation(db, student)

    rejected = client.post(
        f"/api/student/parent-connections/{pending.id}/reject",
        headers=_headers(student),
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    assert _active_links(db, student) == []
    history = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == pending.id
    ).first()
    assert history is not None
    assert history.status == "rejected"

    connected = _connect(next_parent, code)
    assert connected.status_code == 200, connected.text
    assert connected.json()["status"] == "pending_approval"

    active = _active_links(db, student)
    assert len(active) == 1
    assert active[0].parent_id == next_parent.id


# ---------------------------------------------------------------------------
# Scenario 8: revoking a verified link releases the student, keeps history
# ---------------------------------------------------------------------------
def test_08_student_revoke_releases_student_and_keeps_audit_history(db):
    student = _make_user(db, "student", name="Phase6 Revoking Student")
    first_parent = _make_user(db, "parent", name="Phase6 Revoked Parent")
    second_parent = _make_user(db, "parent", name="Phase6 Replacement Parent")

    # Walk the real code -> pending -> approve path so the audit trail exists.
    code = _seed_invitation(db, student)
    connected = _connect(first_parent, code)
    assert connected.status_code == 200, connected.text
    link_id = connected.json()["link_id"]

    approved = client.post(
        f"/api/student/parent-connections/{link_id}/approve",
        headers=_headers(student),
    )
    assert approved.status_code == 200, approved.text

    revoked = client.post(
        f"/api/student/parent-connections/{link_id}/revoke",
        headers=_headers(student),
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "revoked"

    db.expire_all()
    old_link = db.query(ParentStudentLink).filter(ParentStudentLink.id == link_id).first()
    assert old_link.status == "revoked"
    assert old_link.revoked_at is not None
    assert old_link.verified_at is None
    assert _active_links(db, student) == []

    actions = {
        row.action for row in db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.link_id == link_id
        ).all()
    }
    assert {"connect_requested", "approved_by_student", "revoked_by_student"}.issubset(actions)

    second_code = _seed_invitation(db, student)
    replacement = _connect(second_parent, second_code)
    assert replacement.status_code == 200, replacement.text
    assert replacement.json()["status"] == "pending_approval"


# ---------------------------------------------------------------------------
# Scenario 9: an expired pending request releases the student
# ---------------------------------------------------------------------------
def test_09_expired_pending_request_releases_student(db):
    student = _make_user(db, "student", name="Phase6 Expired Student")
    stale_parent = _make_user(db, "parent", name="Phase6 Stale Parent")
    new_parent = _make_user(db, "parent", name="Phase6 Fresh Parent")
    stale = _direct_link(
        db,
        stale_parent,
        student,
        status="pending",
        expires_at=datetime.datetime.utcnow() - datetime.timedelta(days=1),
    )
    code = _seed_invitation(db, student)

    connected = _connect(new_parent, code)
    assert connected.status_code == 200, connected.text
    assert connected.json()["status"] == "pending_approval"

    db.expire_all()
    stale = db.query(ParentStudentLink).filter(ParentStudentLink.id == stale.id).first()
    assert stale.status == "expired"
    audit = db.query(RelationshipAuditLog).filter(
        RelationshipAuditLog.link_id == stale.id,
        RelationshipAuditLog.action == "expired",
    ).first()
    assert audit is not None

    active = _active_links(db, student)
    assert len(active) == 1
    assert active[0].parent_id == new_parent.id


# ---------------------------------------------------------------------------
# Extra entry point: teacher-assisted registration obeys the same invariant
# ---------------------------------------------------------------------------
def test_teacher_assisted_registration_cannot_add_a_second_parent(db):
    student = _make_user(db, "student", name="Phase6 Assisted Student")
    teacher = _make_user(
        db, "teacher", class_name=student.class_name, name="Phase6 Assisting Teacher"
    )
    first_parent = _make_user(db, "parent", name="Phase6 Existing Guardian")
    _direct_link(db, first_parent, student, status="verified")

    new_parent_email = f"{_uid('assisted')}@udaan.test"
    blocked = client.post(
        f"/api/teacher/students/{student.id}/parents",
        json={
            "parent_name": "Phase6 Second Guardian",
            "email": new_parent_email,
            "password": "udaan123",
            "relationship_type": "guardian",
            "preferred_language": "en",
        },
        headers=_headers(teacher),
    )
    assert blocked.status_code == 409, blocked.text
    assert blocked.json()["detail"] == ALREADY_CONNECTED
    assert db.query(User).filter(User.email == new_parent_email).first() is None
    assert [link.parent_id for link in _active_links(db, student)] == [first_parent.id]


# ---------------------------------------------------------------------------
# Sanity check on the service-level helper used by every entry point
# ---------------------------------------------------------------------------
def test_service_check_reports_holder_without_exposing_identity(db):
    student = _make_user(db, "student", name="Phase6 Service Student")
    holder = _make_user(db, "parent", name="Phase6 Holder Parent")
    outsider = _make_user(db, "parent", name="Phase6 Outsider Parent")
    link = _direct_link(db, holder, student, status="pending")

    check = parent_links.check_connection(db, outsider.id, student.id)
    assert check.active_link is not None
    assert check.active_link.id == link.id
    assert check.same_parent_link is None
    assert check.held_by_another_parent is True

    same = parent_links.check_connection(db, holder.id, student.id)
    assert same.same_parent_link is not None
    assert same.held_by_another_parent is False


# ---------------------------------------------------------------------------
# Regression: a returning parent reuses the retained relationship row
# ---------------------------------------------------------------------------
def test_revoked_link_is_reused_for_reconnection_instead_of_duplicated(db):
    student = _make_user(db, "student", name="Phase6 Return Student")
    parent = _make_user(db, "parent", name="Phase6 Returning Parent")
    original = _direct_link(db, parent, student, status="verified")

    revoked = client.post(
        f"/api/student/parent-connections/{original.id}/revoke",
        headers=_headers(student),
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "revoked"

    # A single row per parent/student pair is retained as history; reconnecting
    # must reactivate that row rather than insert a duplicate.
    code = _seed_invitation(db, student)
    connected = _connect(parent, code)
    assert connected.status_code == 200, connected.text
    assert connected.json()["status"] == "pending_approval"
    assert connected.json()["link_id"] == original.id

    db.expire_all()
    rows = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student.id,
    ).all()
    assert [row.id for row in rows] == [original.id]

    live = parent_links.link_for_pair(db, parent.id, student.id)
    assert live.id == original.id
    assert live.status == "pending"
    assert [link.id for link in _active_links(db, student)] == [original.id]

    check = parent_links.check_connection(db, parent.id, student.id)
    assert check.same_parent_link.id == original.id
    assert check.held_by_another_parent is False

