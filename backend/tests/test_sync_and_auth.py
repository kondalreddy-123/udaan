import pytest
import uuid
import hashlib
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, Concept, ConceptMastery, Attempt, RevokedToken
from app.auth import (
    hash_password, verify_password, verify_and_check_rehash,
    create_access_token, decode_token
)
from app.schemas import AttemptItem, AttemptSyncBatch
from app.routers.attempts import sync_attempts
from app.main import app
from app.config import settings

client = TestClient(app)

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed user and concepts
    u = User(id=1, email="student@udaan.edu", hashed_password=hash_password("udaan123"), full_name="Student", role="student")
    session.add(u)

    c0 = Concept(id="c0", grade=8, subject="Math", chapter="Rationals", title_en="Integers", title_te="పూర్ణాంకాలు", sequence_order=0)
    c5 = Concept(id="c5", grade=8, subject="Math", chapter="Rationals", title_en="Adding", title_te="కూడిక", sequence_order=5)
    session.add_all([c0, c5])

    cm0 = ConceptMastery(user_id=1, concept_id="c0", mastery_score=0.8, bkt_p=0.8, rule_level=2)
    cm5 = ConceptMastery(user_id=1, concept_id="c5", mastery_score=0.25, bkt_p=0.25, rule_level=1)
    session.add_all([cm0, cm5])

    session.commit()
    yield session
    session.close()

def test_auth_argon2_hashing_and_jwt():
    raw_pwd = "safePassword2026!"
    hashed = hash_password(raw_pwd)
    # Must use Argon2id
    assert hashed.startswith("$argon2id$")
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("wrongPassword", hashed) is False

    # Check rehash check returns False for fresh Argon2id
    is_valid, needs_rehash = verify_and_check_rehash(raw_pwd, hashed)
    assert is_valid is True
    assert needs_rehash is False

    token = create_access_token({"sub": "student@udaan.edu", "role": "student"})
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "student@udaan.edu"
    assert payload["role"] == "student"
    assert "jti" in payload

def test_legacy_sha256_hash_migration():
    # Simulate legacy SHA-256 hash created with old code
    raw_pwd = "legacyPassword123"
    salt = settings.SECRET_KEY[:16]
    legacy_hash = hashlib.sha256((salt + raw_pwd).encode()).hexdigest()

    # Legacy hash must be recognized as valid but requiring rehash
    is_valid, needs_rehash = verify_and_check_rehash(raw_pwd, legacy_hash)
    assert is_valid is True
    assert needs_rehash is True

    # Rehashed password must be Argon2id
    new_hash = hash_password(raw_pwd)
    assert new_hash.startswith("$argon2id$")
    assert verify_password(raw_pwd, new_hash) is True

def test_student_registration_and_login():
    unique_email = f"student_{uuid.uuid4().hex[:8]}@udaan.edu"
    reg_payload = {
        "email": unique_email,
        "password": "Password123!",
        "full_name": "Test Student",
        "class_name": "Class 8 - Section B",
        "grade": 8
    }

    # Successful student registration
    reg_res = client.post("/api/auth/register/student", json=reg_payload)
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "access_token" in reg_data
    assert reg_data["user"]["email"] == unique_email
    assert reg_data["user"]["role"] == "student"

    # Duplicate registration must fail
    dup_res = client.post("/api/auth/register/student", json=reg_payload)
    assert dup_res.status_code == 400

    # Successful login
    login_res = client.post("/api/auth/login", json={
        "email": unique_email,
        "password": "Password123!"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]

    # Verify authenticated /me endpoint
    me_res = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == unique_email
    assert me_data["role"] == "student"

def test_token_revocation_on_logout():
    # Login as student
    login_res = client.post("/api/auth/login", json={
        "email": "student@udaan.edu",
        "password": "udaan123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Verify token works before logout
    me_before = client.get("/api/auth/me", headers=headers)
    assert me_before.status_code == 200

    # Logout
    logout_res = client.post("/api/auth/logout", headers=headers)
    assert logout_res.status_code == 200
    assert logout_res.json()["status"] == "success"

    # Subsequent request using the revoked token must be rejected with 401
    me_after = client.get("/api/auth/me", headers=headers)
    assert me_after.status_code == 401
    assert "revoked" in me_after.json()["detail"].lower()

def test_admin_teacher_management():
    # Login as admin
    admin_login = client.post("/api/auth/login", json={
        "email": "admin@udaan.edu",
        "password": "udaan123"
    })
    assert admin_login.status_code == 200
    admin_token = admin_login.json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Create new teacher via admin endpoint
    teacher_email = f"teacher_{uuid.uuid4().hex[:8]}@udaan.edu"
    create_res = client.post("/api/admin/teachers", json={
        "email": teacher_email,
        "password": "TeacherPassword2026!",
        "full_name": "Prof. S. Bose",
        "class_name": "Class 8 - Section C",
        "grade": 8
    }, headers=admin_headers)
    assert create_res.status_code == 201
    teacher_data = create_res.json()
    assert teacher_data["email"] == teacher_email
    assert teacher_data["role"] == "teacher"
    assert "password" not in teacher_data
    assert "hashed_password" not in teacher_data
    assert teacher_data["created_by"] == "admin@udaan.edu"

    # Non-admin (student) cannot create teachers
    student_token = create_access_token({"sub": "student@udaan.edu", "role": "student", "id": 1})
    unauth_create = client.post("/api/admin/teachers", json={
        "email": f"hacked_{uuid.uuid4().hex[:8]}@udaan.edu",
        "password": "Password123!",
        "full_name": "Fake Teacher"
    }, headers={"Authorization": f"Bearer {student_token}"})
    assert unauth_create.status_code == 403

    # Teacher logs in with admin-assigned credentials
    t_login = client.post("/api/auth/login", json={
        "email": teacher_email,
        "password": "TeacherPassword2026!"
    })
    assert t_login.status_code == 200
    assert t_login.json()["user"]["role"] == "teacher"

    # Admin deactivates teacher
    deact_res = client.patch(
        f"/api/admin/teachers/{teacher_data['id']}/status",
        json={"is_active": False},
        headers=admin_headers
    )
    assert deact_res.status_code == 200
    assert deact_res.json()["is_active"] is False

    # Deactivated teacher cannot log in
    blocked_login = client.post("/api/auth/login", json={
        "email": teacher_email,
        "password": "TeacherPassword2026!"
    })
    assert blocked_login.status_code == 403
    assert "deactivated" in blocked_login.json()["detail"].lower()

def test_sync_queue_idempotency_and_concept_isolation(db_session):
    u = db_session.query(User).filter(User.id == 1).first()
    attempt_uuid = str(uuid.uuid4())

    item = AttemptItem(
        id=attempt_uuid,
        question_id="Q1",
        concept_id="c5",
        selected_index=0,
        is_correct=True,
        hints_used=0,
        time_spent_sec=12.5,
        attempt_source="practice"
    )

    batch1 = AttemptSyncBatch(attempts=[item])
    res1 = sync_attempts(batch1, db=db_session, user=u)
    assert res1["synced_count"] == 1
    assert res1["duplicates_skipped"] == 0

    # c5 mastery must have increased
    cm5 = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c5").first()
    assert cm5.bkt_p > 0.25
    assert cm5.streak_correct == 1

    # c0 mastery MUST be unaffected!
    cm0 = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c0").first()
    assert cm0.bkt_p == 0.8
    assert cm0.streak_correct == 0

    # Repeat exact same sync batch (testing offline sync re-try / duplicate protection)
    batch2 = AttemptSyncBatch(attempts=[item])
    res2 = sync_attempts(batch2, db=db_session, user=u)
    assert res2["synced_count"] == 0
    assert res2["duplicates_skipped"] == 1

    # Mastery must NOT be double-counted!
    cm5_after = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c5").first()
    assert cm5_after.bkt_p == cm5.bkt_p
    assert cm5_after.streak_correct == 1

def test_sync_adaptive_difficulty_levels_for_performance(db_session):
    """The sync API must adapt rule_level for high and low performers."""
    u = db_session.query(User).filter(User.id == 1).first()

    def sync(correct: bool):
        item = AttemptItem(
            id=str(uuid.uuid4()),
            question_id="Q1",
            concept_id="c5",
            selected_index=0,
            is_correct=correct,
            hints_used=0,
            time_spent_sec=10,
            attempt_source="practice",
        )
        return sync_attempts(AttemptSyncBatch(attempts=[item]), db=db_session, user=u)

    # Low performer: two consecutive errors lower the level and trigger prerequisite review.
    res = sync(False)
    res = sync(False)
    low = res["current_masteries"]["c5"]
    assert low["rule_level"] == 1
    assert low["last_path"] == "Revisit prerequisite"

    # High performer: four consecutive correct answers climb to the hardest level.
    for _ in range(4):
        res = sync(True)
    high = res["current_masteries"]["c5"]
    assert high["rule_level"] == 3
    assert high["last_path"] == "Harder questions"
