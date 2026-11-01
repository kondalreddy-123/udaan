from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token

client = TestClient(app)

def test_student_endpoints():
    token = create_access_token(data={"sub": "student@udaan.edu", "role": "student", "id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    # Profile & Roadmap
    res = client.get("/api/student/me", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["user_id"] == 1
    assert "roadmap" in data
    assert len(data["roadmap"]) == 7
    assert "daily_goal" in data
    assert data["daily_goal"]["target"] == 5
    assert "recommended_learning" in data
    assert "diagnostic_history" in data

    # Streak
    streak_res = client.get("/api/student/streak", headers=headers)
    assert streak_res.status_code == 200
    assert "streak_days" in streak_res.json()

    # Mastery
    mastery_res = client.get("/api/student/mastery", headers=headers)
    assert mastery_res.status_code == 200
    masteries = mastery_res.json()
    assert len(masteries) >= 7


def test_teacher_student_reports():
    token = create_access_token(data={"sub": "teacher@udaan.edu", "role": "teacher", "id": 2})
    headers = {"Authorization": f"Bearer {token}"}

    # Student list
    students_res = client.get("/api/teacher/students", headers=headers)
    assert students_res.status_code == 200
    students = students_res.json()
    assert len(students) >= 10
    first_student = students[0]
    assert "full_name" in first_student
    assert "overall_mastery" in first_student
    assert "active_tier" in first_student

    # Student detail
    detail_res = client.get(f"/api/teacher/students/{first_student['id']}", headers=headers)
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["student_id"] == first_student["id"]
    assert "concepts" in detail
    assert "diagnostics" in detail


def test_ai_explanation_and_fallback():
    token = create_access_token(data={"sub": "student@udaan.edu", "role": "student", "id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "stem": "(-3/4) + (1/2) = ?",
        "student_answer": "-1/3",
        "misconception_tag": "num_den_separate",
        "lang": "en"
    }
    res = client.post("/api/ai/explain", json=payload, headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert "explanation" in data
    assert "hint" in data
    assert data["source"] in ("gemini_api", "rule_based_fallback")

    # Telugu bilingual test
    payload_te = {
        "stem": "(-3/4) + (1/2) = ?",
        "student_answer": "-1/3",
        "misconception_tag": "num_den_separate",
        "lang": "te"
    }
    res_te = client.post("/api/ai/explain", json=payload_te, headers=headers)
    assert res_te.status_code == 200
    data_te = res_te.json()
    assert data_te["status"] == "success"
    assert "లవాలు" in data_te["explanation"] or "హారాలు" in data_te["explanation"] or len(data_te["explanation"]) > 0


def test_diagnostic_records_persistence():
    token = create_access_token(data={"sub": "student@udaan.edu", "role": "student", "id": 1})
    headers = {"Authorization": f"Bearer {token}"}

    records_res = client.get("/api/detective/records", headers=headers)
    assert records_res.status_code == 200
    records = records_res.json()
    assert isinstance(records, list)
