from app.engine.evaluation import run_comprehensive_evaluation
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_reproducible_evaluation_metrics():
    results = run_comprehensive_evaluation()
    assert results["status"] == "completed"
    metrics = results["metrics"]

    # 1. Misconception detection accuracy >= 90%
    assert metrics["misconception_detection_accuracy_pct"] == 100.0

    # 2. Slip discrimination
    assert metrics["slip_vs_misconception_discrimination_pct"] == 100.0

    # 3. Low diagnostic question overhead (<= 3 questions)
    assert metrics["average_questions_per_diagnosis"] <= 3.0

    # 4. Verified learning gain
    assert metrics["bkt_mastery_gain"] > 0.30
    assert metrics["reassessment_recovery_rate_pct"] >= 90.0

    # 5. Offline and duplicate protection
    assert metrics["offline_sync_success_pct"] == 100.0
    assert metrics["duplicate_submission_prevention_pct"] == 100.0

def test_evaluation_api_endpoint():
    res = client.get("/api/comparison/diagnostic-evaluation")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "completed"
    assert "metrics" in data
    assert len(data["case_details"]) == 10
