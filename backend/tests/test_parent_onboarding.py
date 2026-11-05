"""
Phase 3 acceptance tests: accessible parent onboarding, invitation security,
relationship verification, and parent/teacher authorization boundaries.

These tests exercise the real FastAPI app and the real SQLite database (the same
pattern used by the existing test-suite). They create uniquely named users and
remove every record they create during teardown.
"""
import datetime
import hashlib
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import or_

from app.main import app
from app.database import SessionLocal
from app.models import (
    User, ParentProfile, ParentStudentLink, ParentInvitation, RelationshipAuditLog
)
from app.auth import create_access_token, hash_password
from app.config import settings
from app.routers import parent as parent_router

client = TestClient(app)


def _uid(prefix="phase3"):
    # Always starts with "phase3_" so _cleanup() removes every test user and
    # their dependent rows, including parent accounts created inside tests.
    return f"phase3_{prefix}_{uuid.uuid4().hex[:12]}"


def _make_user(db, role, class_name="Class 8 - Section A", name=None):
    email = f"{_uid(role)}@udaan.test"
    user = User(
        email=email,
        hashed_password=hash_password("udaan123"),
        full_name=name or f"Phase3 {role.title()}",
        role=role,
        class_name=class_name,
        grade=8,
        is_active=True,
        created_by="phase3_test",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _headers(user):
    token = create_access_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"Authorization": f"Bearer {token}"}


def _seed_invitation(
    db,
    student,
    language="te",
    *,
    expires_in_days=7,
    attempts=0,
    max_attempts=5,
    raw_code=None,
):
    raw_code = raw_code or f"UD-{uuid.uuid4().hex[:8].upper()}"
    inv = ParentInvitation(
        code_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
        student_id=student.id,
        created_by_id=student.id,
        role_target="parent",
        relationship_type="parent",
        preferred_language=language,
        attempts_count=attempts,
        max_attempts=max_attempts,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(days=expires_in_days),
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return raw_code, inv


def _cleanup(db):
    test_users = db.query(User).filter(User.email.like("phase3_%@udaan.test")).all()
    ids = {u.id for u in test_users}

    links = db.query(ParentStudentLink).filter(
        or_(ParentStudentLink.parent_id.in_(ids), ParentStudentLink.student_id.in_(ids))
    ).all() if ids else []
    link_ids = {l.id for l in links}
    all_ids = set(ids) | {l.parent_id for l in links} | {l.student_id for l in links}

    invitations = db.query(ParentInvitation).filter(
        or_(
            ParentInvitation.student_id.in_(all_ids),
            ParentInvitation.created_by_id.in_(all_ids),
            ParentInvitation.redeemed_by_parent_id.in_(all_ids),
        )
    ).all() if all_ids else []
    invitation_ids = {i.id for i in invitations}

    if link_ids:
        db.query(RelationshipAuditLog).filter(
            or_(
                RelationshipAuditLog.link_id.in_(link_ids),
                RelationshipAuditLog.performed_by_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
    elif all_ids:
        db.query(RelationshipAuditLog).filter(
            RelationshipAuditLog.performed_by_id.in_(all_ids)
        ).delete(synchronize_session=False)

    if all_ids:
        db.query(ParentStudentLink).filter(
            or_(ParentStudentLink.parent_id.in_(all_ids), ParentStudentLink.student_id.in_(all_ids))
        ).delete(synchronize_session=False)
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ParentInvitation).filter(
            or_(
                ParentInvitation.student_id.in_(all_ids),
                ParentInvitation.created_by_id.in_(all_ids),
                ParentInvitation.redeemed_by_parent_id.in_(all_ids),
            )
        ).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(all_ids)).delete(synchronize_session=False)

    db.commit()


@pytest.fixture
def db():
    parent_router.reset_parent_rate_limits()
    session = SessionLocal()
    try:
        yield session
    finally:
        _cleanup(session)
        session.close()
        parent_router.reset_parent_rate_limits()


# ---------------------------------------------------------------------------
# Method B: student invitation + parent registration + verification lifecycle
# ---------------------------------------------------------------------------
def test_invitation_lifecycle_and_verified_only_access(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Teacher")
    other_teacher = _make_user(db, "teacher", "Class 8 - Section B", "Phase3 Other Teacher")
    unrelated_student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Unrelated")

    # Student generates a single-use invitation; only the hash is persisted.
    res = client.post(
        "/api/student/parent-invitation",
        json={"relationship_type": "mother", "preferred_language": "te"},
        headers=_headers(student),
    )
    assert res.status_code == 201, res.text
    code = res.json()["invitation_code"]
    assert code.startswith("UD-") and len(code) == 11

    db.expire_all()
    stored = db.query(ParentInvitation).filter(ParentInvitation.student_id == student.id).order_by(ParentInvitation.id.desc()).first()
    assert stored is not None
    assert code not in stored.code_hash
    assert stored.code_hash == hashlib.sha256(code.encode()).hexdigest()

    # Validate reveals only the child's first name and class (no records).
    val = client.post("/api/parent/invitations/validate", json={"code": code.lower()})
    assert val.status_code == 200, val.text
    assert val.json()["student_first_name"] == "Phase3"
    assert val.json()["class_name"] == "Class 8 - Section A"
    assert "mastery" not in val.text.lower()

    email = f"{_uid('parent')}@udaan.test"
    reg = client.post(
        "/api/parent/onboarding/register",
        json={
            "invitation_code": code,
            "parent_name": "Phase3 Mother",
            "email": email,
            "password": "ParentPass123",
            "phone_number": "9876543210",
            "preferred_language": "te",
            "relationship_type": "mother",
        },
    )
    assert reg.status_code == 201, reg.text
    payload = reg.json()
    assert "access_token" in payload
    assert payload["user"]["role"] == "parent"  # backend-enforced role
    assert "hashed_password" not in payload["user"]
    assert "password" not in payload["user"]
    parent_headers = {"Authorization": f"Bearer {payload['access_token']}"}
    parent_id = payload["user"]["id"]

    # Parent sees their own profile + pending link, but no learning records.
    me = client.get("/api/parent/me", headers=parent_headers)
    assert me.status_code == 200
    assert me.json()["preferred_language"] == "te"
    assert me.json()["linked_children"][0]["verification_status"] == "pending"

    # Before verification, child records are denied (and unrelated children too).
    assert client.get(f"/api/parent/children/{student.id}", headers=parent_headers).status_code == 403
    assert client.get(f"/api/parent/children/{unrelated_student.id}", headers=parent_headers).status_code == 403

    # Teacher from another class cannot see or verify this link.
    link = db.query(ParentStudentLink).filter(ParentStudentLink.parent_id == parent_id).first()
    assert link is not None
    assert client.get("/api/teacher/parents/pending", headers=_headers(other_teacher)).json() == []
    assert client.post(f"/api/teacher/parents/{link.id}/verify", headers=_headers(other_teacher)).status_code == 403

    # Assigned teacher can list and verify.
    pending = client.get("/api/teacher/parents/pending", headers=_headers(teacher))
    assert pending.status_code == 200
    assert any(item["id"] == link.id for item in pending.json())

    verified = client.post(
        f"/api/teacher/parents/{link.id}/verify",
        json={"notes": "Verified against school records in person."},
        headers=_headers(teacher),
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["status"] == "verified"
    assert verified.json()["verified_by_teacher_id"] == teacher.id

    # Access now works.
    overview = client.get(f"/api/parent/children/{student.id}", headers=parent_headers)
    assert overview.status_code == 200
    assert overview.json()["verified_access"] is True

    # Audit trail records creation and verification.
    db.expire_all()
    actions = [a.action for a in db.query(RelationshipAuditLog).filter(RelationshipAuditLog.link_id == link.id).all()]
    assert "created" in actions and "verified" in actions

    # Revocation immediately removes access.
    revoked = client.post(
        f"/api/teacher/parents/{link.id}/revoke",
        json={"notes": "Relationship no longer valid."},
        headers=_headers(teacher),
    )
    assert revoked.status_code == 200, revoked.text
    assert revoked.json()["status"] == "revoked"
    assert client.get(f"/api/parent/children/{student.id}", headers=parent_headers).status_code == 403


def test_invitation_is_single_use_and_invalid_codes_are_rejected(db):
    student = _make_user(db, "student", name="Phase3 Single Use")
    code, _ = _seed_invitation(db, student, "en")

    email = f"{_uid('parent')}@udaan.test"
    first = client.post(
        "/api/parent/invitations/redeem",
        json={
            "invitation_code": code,
            "parent_name": "Phase3 Parent",
            "email": email,
            "password": "ParentPass123",
            "preferred_language": "en",
        },
    )
    assert first.status_code == 201, first.text

    # Same code cannot be validated or redeemed again.
    assert client.post("/api/parent/invitations/validate", json={"code": code}).status_code == 400
    second = client.post(
        "/api/parent/onboarding/complete",
        json={
            "invitation_code": code,
            "parent_name": "Phase3 Impostor",
            "email": f"{_uid('other')}@udaan.test",
            "password": "ParentPass123",
            "preferred_language": "en",
        },
    )
    assert second.status_code == 400

    # Unknown codes do not reveal whether a student exists.
    unknown = client.post("/api/parent/invitations/validate", json={"code": "UD-NOTREAL"})
    assert unknown.status_code == 404
    assert "student" not in unknown.json()["detail"].lower() or "invalid" in unknown.json()["detail"].lower()


def test_expired_and_attempt_limited_invitations_are_rejected(db):
    student = _make_user(db, "student", name="Phase3 Expiry")

    expired_code, expired = _seed_invitation(db, student, "hi", expires_in_days=-1)
    val = client.post("/api/parent/invitations/validate", json={"code": expired_code})
    assert val.status_code == 400
    assert "expired" in val.json()["detail"].lower()

    reg = client.post(
        "/api/parent/onboarding/register",
        json={
            "invitation_code": expired_code,
            "parent_name": "Phase3 Late Parent",
            "email": f"{_uid('late')}@udaan.test",
            "password": "ParentPass123",
            "preferred_language": "hi",
        },
    )
    assert reg.status_code == 400

    limited_code, limited = _seed_invitation(
        db, student, "te", attempts=5, max_attempts=5
    )
    limited_res = client.post("/api/parent/invitations/validate", json={"code": limited_code})
    assert limited_res.status_code == 429


def test_public_invitation_endpoints_are_rate_limited(db):
    statuses = []
    for _ in range(settings.PARENT_INVITE_RATE_MAX_REQUESTS + 1):
        res = client.post("/api/parent/invitations/validate", json={"code": "UD-BADCODE"})
        statuses.append(res.status_code)
    assert statuses[-1] == 429
    assert all(code == 404 for code in statuses[:-1])


# ---------------------------------------------------------------------------
# Method A: teacher-assisted onboarding + assignment enforcement
# ---------------------------------------------------------------------------
def test_teacher_assisted_registration_and_assignment_boundary(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Assisted Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Assigned Teacher")
    outsider = _make_user(db, "teacher", "Class 8 - Section B", "Phase3 Outsider Teacher")

    email = f"{_uid('assisted')}@udaan.test"
    body = {
        "parent_name": "Phase3 Assisted Parent",
        "email": email,
        "phone_number": "90000 11111",
        "password": "AssistedPass123",
        "preferred_language": "hi",
        "relationship_type": "father",
    }

    # Unassigned teacher cannot create a parent link, even with valid data.
    denied = client.post(f"/api/teacher/students/{student.id}/parents", json=body, headers=_headers(outsider))
    assert denied.status_code == 403

    created = client.post(f"/api/teacher/students/{student.id}/parents", json=body, headers=_headers(teacher))
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["status"] == "verified"
    assert data["verification_method"] == "teacher_assisted"
    assert data["parent_preferred_language"] == "hi"
    assert "password" not in created.text.lower()

    # The assisted parent can sign in with the credentials the teacher set.
    login = client.post("/api/auth/login", json={"email": email, "password": "AssistedPass123"})
    assert login.status_code == 200, login.text
    parent_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert login.json()["user"]["role"] == "parent"
    assert client.get(f"/api/parent/children/{student.id}", headers=parent_headers).status_code == 200

    # Audit log records the in-person verification.
    db.expire_all()
    actions = [
        a.action for a in db.query(RelationshipAuditLog).filter(RelationshipAuditLog.link_id == data["id"]).all()
    ]
    assert "verified" in actions


def test_teacher_cannot_verify_unassigned_student_link(db):
    student = _make_user(db, "student", "Class 8 - Section B", "Phase3 B Student")
    outsider = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 A Teacher")
    parent = _make_user(db, "parent", "Parents Cohort", "Phase3 B Parent")

    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="guardian",
        status="pending",
        verification_method="invitation_code",
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    res = client.post(f"/api/teacher/parents/{link.id}/verify", headers=_headers(outsider))
    assert res.status_code == 403

    # Admin may verify (explicit school administrator override).
    admin = _make_user(db, "admin", "Administration", "Phase3 Admin")
    ok = client.post(f"/api/teacher/parents/{link.id}/verify", headers=_headers(admin))
    assert ok.status_code == 200


def test_teacher_can_reissue_invitation_for_pending_link(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Reissue Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Reissue Teacher")
    parent = _make_user(db, "parent", "Parents Cohort", "Phase3 Reissue Parent")

    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="parent",
        status="pending",
        verification_method="invitation_code",
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    res = client.post(f"/api/teacher/parents/{link.id}/reissue-invitation", headers=_headers(teacher))
    assert res.status_code == 200, res.text
    new_code = res.json()["invitation_code"]
    assert new_code.startswith("UD-") and len(new_code) == 11

    db.expire_all()
    stored = db.query(ParentInvitation).filter(ParentInvitation.student_id == student.id).order_by(ParentInvitation.id.desc()).first()
    assert stored.code_hash == hashlib.sha256(new_code.encode()).hexdigest()
    assert stored.code_hash != new_code

    # Reissued code is valid and still routes through pending verification.
    assert client.post("/api/parent/invitations/validate", json={"code": new_code}).status_code == 200


# ---------------------------------------------------------------------------
# Language selection + parent profile boundaries
# ---------------------------------------------------------------------------
def test_language_selection_and_profile_privilege_boundaries(db):
    student = _make_user(db, "student", name="Phase3 Language Student")
    code, _ = _seed_invitation(db, student, "te")

    reg = client.post(
        "/api/parent/onboarding/register",
        json={
            "invitation_code": code,
            "parent_name": "Phase3 Language Parent",
            "email": f"{_uid('lang')}@udaan.test",
            "password": "ParentPass123",
            "preferred_language": "te",
        },
    )
    assert reg.status_code == 201, reg.text
    headers = {"Authorization": f"Bearer {reg.json()['access_token']}"}
    link_id = client.get("/api/parent/me", headers=headers).json()["linked_children"][0]["link_id"]

    for language in ("te", "en", "hi"):
        updated = client.put(
            "/api/parent/profile",
            json={"preferred_language": language},
            headers=headers,
        )
        assert updated.status_code == 200, updated.text
        assert updated.json()["preferred_language"] == language

    # Unsupported language is rejected, not silently stored.
    bad = client.put("/api/parent/profile", json={"preferred_language": "fr"}, headers=headers)
    assert bad.status_code == 422

    # Parents cannot promote their own contact verification or rewrite child IDs.
    attempted = client.put(
        "/api/parent/profile",
        json={
            "preferred_language": "hi",
            "is_verified": True,
            "linked_children": [{"student_id": 999999, "verification_status": "verified"}],
        },
        headers=headers,
    )
    assert attempted.status_code == 200
    me = client.get("/api/parent/me", headers=headers).json()
    assert me["is_verified"] is False
    assert me["linked_children"][0]["student_id"] == student.id
    assert me["linked_children"][0]["verification_status"] == "pending"
    assert me["linked_children"][0]["link_id"] == link_id

    # A parent token cannot use teacher-only verification routes.
    assert client.post(f"/api/teacher/parents/{link_id}/verify", headers=headers).status_code == 403

    # Invitation creation with an unsupported language is rejected.
    student2 = _make_user(db, "student", name="Phase3 Bad Language")
    bad_inv = client.post(
        "/api/student/parent-invitation",
        json={"preferred_language": "fr"},
        headers=_headers(student2),
    )
    assert bad_inv.status_code == 422


# ---------------------------------------------------------------------------
# Method A: assisted credentials via a single-use setup code
# ---------------------------------------------------------------------------
def test_teacher_assisted_setup_code_lets_parent_choose_credentials(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Setup Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Setup Teacher")

    body = {
        "parent_name": "Phase3 Setup Parent",
        "phone_number": "91111 22222",
        "preferred_language": "te",
        "relationship_type": "mother",
        "contact_method": "school_record",
    }
    created = client.post(f"/api/teacher/students/{student.id}/parents", json=body, headers=_headers(teacher))
    assert created.status_code == 201, created.text
    data = created.json()
    assert data["status"] == "verified"
    assert data["verification_method"] == "teacher_assisted"
    setup_code = data["setup_code"]
    assert setup_code.startswith("UD-") and len(setup_code) == 11
    assert "password" not in created.text.lower()

    # Only the SHA-256 hash of the setup code is stored.
    db.expire_all()
    stored = (
        db.query(ParentInvitation)
        .filter(ParentInvitation.target_parent_id == data["parent_id"])
        .order_by(ParentInvitation.id.desc())
        .first()
    )
    assert stored is not None
    assert stored.code_hash == hashlib.sha256(setup_code.encode()).hexdigest()
    assert setup_code not in stored.code_hash

    # The code reveals only the child's first name and class, never records.
    val = client.post("/api/parent/invitations/validate", json={"code": setup_code})
    assert val.status_code == 200, val.text
    assert val.json()["student_first_name"] == "Phase3"
    assert "mastery" not in val.text.lower()

    # The parent chooses their own email/password; the account is reused (no duplicate).
    email = f"{_uid('setup')}@udaan.test"
    reg = client.post(
        "/api/parent/onboarding/complete",
        json={
            "invitation_code": setup_code,
            "parent_name": "Phase3 Setup Parent",
            "email": email,
            "password": "SetupPass123",
            "preferred_language": "te",
            "relationship_type": "mother",
        },
    )
    assert reg.status_code == 201, reg.text
    assert reg.json()["user"]["id"] == data["parent_id"]
    assert reg.json()["user"]["role"] == "parent"

    login = client.post("/api/auth/login", json={"email": email, "password": "SetupPass123"})
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    me = client.get("/api/parent/me", headers=headers).json()
    assert me["is_verified"] is True  # in-person teacher verification retained
    assert me["linked_children"][0]["verification_status"] == "verified"
    assert client.get(f"/api/parent/children/{student.id}", headers=headers).status_code == 200

    # Single use: the setup code cannot be redeemed twice.
    again = client.post(
        "/api/parent/onboarding/complete",
        json={
            "invitation_code": setup_code,
            "parent_name": "Phase3 Impostor",
            "email": f"{_uid('impostor')}@udaan.test",
            "password": "SetupPass123",
        },
    )
    assert again.status_code == 400

    db.expire_all()
    actions = [
        a.action for a in db.query(RelationshipAuditLog).filter(RelationshipAuditLog.link_id == data["id"]).all()
    ]
    assert "credentials_setup" in actions and "verified" in actions


def test_teacher_reject_flow_blocks_access_and_records_audit(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Reject Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Reject Teacher")
    parent = _make_user(db, "parent", "Parents Cohort", "Phase3 Reject Parent")

    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="guardian",
        status="pending",
        verification_method="invitation_code",
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    rejected = client.post(
        f"/api/teacher/parents/{link.id}/reject",
        json={"notes": "Documents did not match."},
        headers=_headers(teacher),
    )
    assert rejected.status_code == 200, rejected.text
    assert rejected.json()["status"] == "rejected"

    parent_headers = _headers(parent)
    assert client.get(f"/api/parent/children/{student.id}", headers=parent_headers).status_code == 403

    db.expire_all()
    actions = [
        a.action for a in db.query(RelationshipAuditLog).filter(RelationshipAuditLog.link_id == link.id).all()
    ]
    assert "rejected" in actions

    # A rejected link can be re-opened by an authorized teacher after review.
    verified = client.post(f"/api/teacher/parents/{link.id}/verify", headers=_headers(teacher))
    assert verified.status_code == 200
    assert client.get(f"/api/parent/children/{student.id}", headers=parent_headers).status_code == 200


def test_reissue_revokes_the_previous_code_for_the_same_parent(db):
    student = _make_user(db, "student", "Class 8 - Section A", "Phase3 Reissue Replace Student")
    teacher = _make_user(db, "teacher", "Class 8 - Section A", "Phase3 Reissue Replace Teacher")
    parent = _make_user(db, "parent", "Parents Cohort", "Phase3 Reissue Replace Parent")

    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="parent",
        status="pending",
        verification_method="invitation_code",
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    first = client.post(f"/api/teacher/parents/{link.id}/reissue-invitation", headers=_headers(teacher))
    assert first.status_code == 200, first.text
    first_code = first.json()["invitation_code"]

    second = client.post(f"/api/teacher/parents/{link.id}/reissue-invitation", headers=_headers(teacher))
    assert second.status_code == 200, second.text
    second_code = second.json()["invitation_code"]
    assert first_code != second_code

    # The older code is revoked; only the newest code works.
    old = client.post("/api/parent/invitations/validate", json={"code": first_code})
    assert old.status_code == 400
    new = client.post("/api/parent/invitations/validate", json={"code": second_code})
    assert new.status_code == 200, new.text


def test_student_invitation_generation_is_capped_and_revocable(db):
    student = _make_user(db, "student", name="Phase3 Cap Student")
    headers = _headers(student)

    first = client.post("/api/student/parent-invitation", json={"preferred_language": "te"}, headers=headers)
    assert first.status_code == 201, first.text

    # Immediate second request is rejected by the cooldown.
    immediate = client.post("/api/student/parent-invitation", json={}, headers=headers)
    assert immediate.status_code == 429

    # Age the newest invitation to bypass the cooldown and fill the active cap.
    def _age_last_invitation():
        db.expire_all()
        last = (
            db.query(ParentInvitation)
            .filter(ParentInvitation.student_id == student.id)
            .order_by(ParentInvitation.created_at.desc())
            .first()
        )
        last.created_at = datetime.datetime.utcnow() - datetime.timedelta(
            seconds=settings.PARENT_INVITATION_MIN_INTERVAL_SECONDS + 5
        )
        db.commit()

    _age_last_invitation()
    second = client.post("/api/student/parent-invitation", json={}, headers=headers)
    assert second.status_code == 201, second.text
    _age_last_invitation()
    third = client.post("/api/student/parent-invitation", json={}, headers=headers)
    assert third.status_code == 201, third.text

    capped = client.post("/api/student/parent-invitation", json={}, headers=headers)
    assert capped.status_code == 429
    assert "maximum" in capped.json()["detail"].lower() or "active" in capped.json()["detail"].lower()

    # Revoking unused codes frees the cap for a fresh invitation.
    db.expire_all()
    invitations = db.query(ParentInvitation).filter(ParentInvitation.student_id == student.id).all()
    for inv in invitations:
        if not inv.is_redeemed and not inv.is_revoked:
            res = client.delete(f"/api/student/parent-invitations/{inv.id}", headers=headers)
            assert res.status_code == 200, res.text

    _age_last_invitation()
    fresh = client.post("/api/student/parent-invitation", json={}, headers=headers)
    assert fresh.status_code == 201, fresh.text


def test_existing_authentication_still_works(db):
    # Existing seeded demo student login is unchanged.
    login = client.post("/api/auth/login", json={"email": "student@udaan.edu", "password": "udaan123"})
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["role"] == "student"

    # Unauthenticated parent endpoints stay protected.
    assert client.get("/api/parent/me").status_code == 401
    assert client.get("/api/parent/links").status_code == 401
