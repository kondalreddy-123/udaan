import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.auth import create_access_token

client = TestClient(app)

def get_auth_headers(role: str = "student", email: str = "student@udaan.edu", user_id: int = 1):
    token = create_access_token({"sub": email, "role": role, "id": user_id})
    return {"Authorization": f"Bearer {token}"}

def test_health_check_endpoint():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "udaan-backend"

def test_root_health_alias():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["service"] == "udaan-backend"

def test_concepts_endpoint():
    response = client.get("/api/concepts")
    assert response.status_code == 200
    concepts = response.json()
    assert len(concepts) >= 7
    assert any(c["id"] == "c5" for c in concepts)

def test_detective_endpoints():
    headers = get_auth_headers(role="student", email="student@udaan.edu", user_id=1)

    # Start session
    start_res = client.post("/api/detective/start", headers=headers)
    assert start_res.status_code == 200
    start_data = start_res.json()
    assert start_data["status"] == "ready"
    assert "question" in start_data

    # Submit primary distractor (-1/3)
    prim_res = client.post("/api/detective/primary", json={"option_index": 1}, headers=headers)
    assert prim_res.status_code == 200
    prim_data = prim_res.json()
    assert prim_data["is_correct"] is False
    assert prim_data["suspected_tag"] == "num_den_separate"

    # Submit followup
    follow_res = client.post("/api/detective/followup", json={"is_correct": False}, headers=headers)
    assert follow_res.status_code == 200
    follow_data = follow_res.json()
    assert follow_data["is_slip"] is False
    assert "support" in follow_data

    # Submit reassessment
    reassess_res = client.post("/api/detective/reassessment", json={"option_index": 0}, headers=headers)
    assert reassess_res.status_code == 200
    reassess_data = reassess_res.json()
    assert reassess_data["recovered"] is True

def test_teacher_endpoints():
    headers = get_auth_headers(role="teacher", email="teacher@udaan.edu", user_id=2)

    # Summary
    summary_res = client.get("/api/teacher/summary", headers=headers)
    assert summary_res.status_code == 200
    summary = summary_res.json()
    assert summary["cohort_type"] == "SYNTHETIC_SAMPLE"
    assert len(summary["recurring_misconceptions"]) >= 3

    # Cards
    cards_res = client.get("/api/teacher/cards", headers=headers)
    assert cards_res.status_code == 200
    cards = cards_res.json()
    assert len(cards) >= 1

    # Config
    cfg_res = client.get("/api/teacher/config", headers=headers)
    assert cfg_res.status_code == 200
    cfg = cfg_res.json()
    assert cfg["up_streak_threshold"] >= 1

def test_comparison_and_export_endpoints():
    eval_res = client.get("/api/comparison/evaluate?p0=0.3&transition=0.15&slip=0.1&guess=0.25")
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    assert eval_data["dataset_type"] == "SYNTHETIC_DEMO"
    assert "metrics" in eval_data
    assert len(eval_data["cases"]) == 8

    export_res = client.get("/api/comparison/export")
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers["content-type"]
    assert "Case ID,Sequence" in export_res.text
