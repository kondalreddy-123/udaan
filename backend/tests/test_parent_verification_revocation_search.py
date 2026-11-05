import datetime
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import SessionLocal
from app.models import (
    User, ParentStudentLink, ParentInvitation, ParentContact, ParentProfile,
    ParentRevocationOtp, Attempt, ConceptMastery, Concept
)
from app.auth import create_access_token, hash_password
from app.services import parent_connect as pc

client = TestClient(app)

@pytest.fixture(autouse=True)
def clean_db():
    db = SessionLocal()
    # Clean up test users if any
    test_emails = ["testparent_new@udaan.edu", "testchild_new@udaan.edu", "testteacher_new@udaan.edu"]
    db.query(ParentRevocationOtp).delete()
    users = db.query(User).filter(User.email.in_(test_emails)).all()
    user_ids = [u.id for u in users]
    if user_ids:
        db.query(ParentStudentLink).filter(ParentStudentLink.student_id.in_(user_ids) | ParentStudentLink.parent_id.in_(user_ids)).delete()
        db.query(ParentInvitation).filter(ParentInvitation.student_id.in_(user_ids)).delete()
        db.query(ParentContact).filter(ParentContact.parent_id.in_(user_ids)).delete()
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(user_ids)).delete()
        db.query(Attempt).filter(Attempt.user_id.in_(user_ids)).delete()
        db.query(ConceptMastery).filter(ConceptMastery.user_id.in_(user_ids)).delete()
        db.query(User).filter(User.id.in_(user_ids)).delete()
    db.commit()
    db.close()

def test_parent_registration_and_status_pipeline():
    # 1. Create a student with an invitation code
    db = SessionLocal()
    student = User(
        email="testchild_new@udaan.edu",
        full_name="Radha Krishna",
        hashed_password=hash_password("password123"),
        role="student",
        class_name="Class 8 - Section B",
        grade=8,
        is_active=True,
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    # Student creates an invitation code
    student_token = create_access_token(data={"sub": student.email, "role": student.role, "id": student.id})
    res_inv = client.post(
        "/api/student/parent-invitation",
        headers={"Authorization": f"Bearer {student_token}"},
        json={"relationship_type": "mother", "preferred_language": "te"}
    )
    assert res_inv.status_code == 201
    code = res_inv.json()["invitation_code"]

    # 2. Parent registers using student connection code, school name, teacher details
    res_reg = client.post(
        "/api/auth/register/parent",
        json={
            "full_name": "Sita Devi",
            "email": "testparent_new@udaan.edu",
            "password": "secureparent123",
            "confirm_password": "secureparent123",
            "connection_code": code,
            "school_name": "Zilla Parishad High School",
            "teacher_name": "Sri Sharma",
        }
    )
    assert res_reg.status_code == 201
    reg_data = res_reg.json()
    assert reg_data["status"] == "pending_verification"

    # Verify link exists but is pending
    parent_user = db.query(User).filter(User.email == "testparent_new@udaan.edu").first()
    assert parent_user is not None
    link = db.query(ParentStudentLink).filter(ParentStudentLink.parent_id == parent_user.id, ParentStudentLink.student_id == student.id).first()
    assert link is not None
    assert link.status == "pending"
    assert link.school_name == "Zilla Parishad High School"
    assert link.teacher_name == "Sri Sharma"

    # Before email OTP verification: Status is "Email Not Verified"
    res_conn = client.get(
        "/api/student/parent-connections",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_conn.status_code == 200
    conns = res_conn.json()
    assert len(conns) >= 1
    target_conn = next(c for c in conns if c["id"] == link.id)
    assert target_conn["email_verified"] is False
    assert target_conn["display_status"] == "Email Not Verified"

    # Parent CANNOT access student data yet (403 forbidden)
    parent_token_unverified = create_access_token(data={"sub": parent_user.email, "role": parent_user.role, "id": parent_user.id})
    res_child = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token_unverified}"}
    )
    assert res_child.status_code == 403

    # 3. Parent verifies email with OTP
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent_user.id).first()
    assert contact is not None
    # Generate mock OTP matching contact hash
    otp = "123456"
    contact.otp_hash = pc.hash_otp(parent_user.id, otp)
    contact.otp_expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=5)
    db.commit()

    res_verify = client.post(
        "/api/auth/parent/verify-otp",
        json={"email": "testparent_new@udaan.edu", "otp": otp}
    )
    assert res_verify.status_code == 200
    parent_token = res_verify.json()["access_token"]

    # Email verified, student has not responded -> "Pending Student Approval"
    res_conn2 = client.get(
        "/api/student/parent-connections",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    target_conn2 = next(c for c in res_conn2.json() if c["id"] == link.id)
    assert target_conn2["email_verified"] is True
    assert target_conn2["display_status"] == "Pending Student Approval"

    # Parent STILL cannot access student data
    res_child_still_blocked = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_child_still_blocked.status_code == 403

    # 4. Student accepts request -> "Parent Verified"
    res_accept = client.post(
        f"/api/student/parent-connections/{link.id}/approve",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_accept.status_code == 200
    assert res_accept.json()["display_status"] == "Parent Verified"
    assert res_accept.json()["status"] == "verified"

    # Parent CAN now access student data
    res_child_ok = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_child_ok.status_code == 200
    assert res_child_ok.json()["verified_access"] is True

    # Check parent /my-child endpoint
    res_my_child = client.get(
        "/api/parent/my-child",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_my_child.status_code == 200
    children = res_my_child.json()["children"]
    assert len(children) == 1
    assert children[0]["student_id"] == student.id
    assert children[0]["connection_display_status"] == "Parent Verified"

    db.close()

def test_otp_revocation_workflow():
    # Setup approved parent and student
    db = SessionLocal()
    student = User(
        email="testchild_new@udaan.edu",
        full_name="Radha Krishna",
        hashed_password=hash_password("password123"),
        role="student",
        class_name="Class 8 - Section B",
        grade=8,
        is_active=True,
    )
    parent = User(
        email="testparent_new@udaan.edu",
        full_name="Sita Devi",
        hashed_password=hash_password("secureparent123"),
        role="parent",
        class_name="Parents Cohort",
        grade=8,
        is_active=True,
    )
    db.add(student)
    db.add(parent)
    db.commit()
    db.refresh(student)
    db.refresh(parent)

    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="mother",
        status="verified",
        verified_at=datetime.datetime.utcnow(),
    )
    db.add(link)
    contact = ParentContact(
        parent_id=parent.id,
        email=parent.email,
        is_verified=True,
        contact_type="email",
    )
    db.add(contact)
    db.commit()
    db.refresh(link)

    student_token = create_access_token(data={"sub": student.email, "role": student.role, "id": student.id})
    parent_token = create_access_token(data={"sub": parent.email, "role": parent.role, "id": parent.id})

    # 1. Student requests parent access removal
    res_req = client.post(
        f"/api/student/parent-connections/{link.id}/request-revocation",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_req.status_code == 200
    req_data = res_req.json()
    assert req_data["link_id"] == link.id
    assert "parent_email_masked" in req_data
    assert "otp" not in req_data  # NEVER leak OTP in response!

    # Verify access is NOT revoked yet
    res_child_before = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_child_before.status_code == 200

    # Retrieve revocation record
    rev_record = db.query(ParentRevocationOtp).filter(ParentRevocationOtp.link_id == link.id).first()
    assert rev_record is not None
    assert rev_record.status == "pending"

    # Set mock OTP
    import hmac, hashlib
    from app.config import settings
    test_otp = "842196"
    key = f"{settings.SECRET_KEY}:revocation:{parent.id}".encode()
    rev_record.otp_hash = hmac.new(key, test_otp.encode(), hashlib.sha256).hexdigest()
    db.commit()

    # 2. Parent attempts verification with wrong OTP
    res_wrong = client.post(
        "/api/parent/revoke-confirm",
        headers={"Authorization": f"Bearer {parent_token}"},
        json={"link_id": link.id, "otp": "000000"}
    )
    assert res_wrong.status_code == 400
    assert "Invalid verification code" in res_wrong.json()["detail"]

    # Verify connection is STILL active
    res_child_still_ok = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_child_still_ok.status_code == 200

    # 3. Parent verifies with correct OTP
    res_correct = client.post(
        "/api/parent/revoke-confirm",
        headers={"Authorization": f"Bearer {parent_token}"},
        json={"link_id": link.id, "otp": test_otp}
    )
    assert res_correct.status_code == 200
    assert res_correct.json()["status"] == "revoked"

    # 4. Parent access is immediately blocked
    res_child_blocked = client.get(
        f"/api/parent/children/{student.id}",
        headers={"Authorization": f"Bearer {parent_token}"}
    )
    assert res_child_blocked.status_code == 403

    db.close()

def test_teacher_student_search_and_student_teacher_search():
    db = SessionLocal()
    teacher = User(
        email="testteacher_new@udaan.edu",
        full_name="Prof. Ramanujan",
        hashed_password=hash_password("password123"),
        role="teacher",
        class_name="Class 8 - Section A",
        grade=8,
        is_active=True,
    )
    student1 = User(
        email="testchild_new@udaan.edu",
        full_name="Aryabhata",
        hashed_password=hash_password("password123"),
        role="student",
        class_name="Class 8 - Section A",
        grade=8,
        is_active=True,
    )
    db.add(teacher)
    db.add(student1)
    db.commit()
    db.refresh(teacher)
    db.refresh(student1)

    teacher_token = create_access_token(data={"sub": teacher.email, "role": teacher.role, "id": teacher.id})
    student_token = create_access_token(data={"sub": student1.email, "role": student1.role, "id": student1.id})

    # 1. Teacher searches students by name
    res_search = client.get(
        "/api/teacher/students/search?q=Aryabhata",
        headers={"Authorization": f"Bearer {teacher_token}"}
    )
    assert res_search.status_code == 200
    results = res_search.json()["results"]
    assert len(results) >= 1
    assert any(s["full_name"] == "Aryabhata" for s in results)

    # 2. Student searches assigned teacher
    res_tsearch = client.get(
        "/api/student/teachers/search",
        headers={"Authorization": f"Bearer {student_token}"}
    )
    assert res_tsearch.status_code == 200
    t_results = res_tsearch.json()["results"]
    assert len(t_results) >= 1
    assert any(t["full_name"] == "Prof. Ramanujan" for t in t_results)

    db.close()
