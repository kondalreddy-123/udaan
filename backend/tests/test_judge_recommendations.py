import pytest
from app.engine.bkt import get_pacing_tier, determine_divergent_path, validate_bkt_params, bkt_update
from app.engine.adaptive_rules import AdaptiveRuleEngine
from app.engine.comparison import evaluate_models
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_explicit_adaptive_pacing_tiers():
    """Judge Recommendation 1: Mastery-based pacing tiers."""
    # Below 40%: Foundational
    t1 = get_pacing_tier(0.25)
    assert t1["tier_id"] == "foundational"
    assert t1["difficulty_level"] == 1
    assert "Foundational explanation" in t1["activity_type"]

    # 40-69%: Guided
    t2 = get_pacing_tier(0.55)
    assert t2["tier_id"] == "guided"
    assert t2["difficulty_level"] == 2
    assert "Guided practice" in t2["activity_type"]

    # 70-84%: Independent
    t3 = get_pacing_tier(0.75)
    assert t3["tier_id"] == "independent"
    assert t3["difficulty_level"] == 2
    assert "Independent practice" in t3["activity_type"]

    # 85%+: Advanced
    t4 = get_pacing_tier(0.90)
    assert t4["tier_id"] == "advanced"
    assert t4["difficulty_level"] == 3
    assert "Advanced challenge" in t4["activity_type"]


def test_divergent_student_learning_paths():
    """Judge Recommendation 2: Struggling, Normal, and Advanced Paths."""
    # Case 1: Struggling student with misconception
    p_struggle = determine_divergent_path(mastery_p=0.30, streak_wrong=2, streak_correct=0, misconception_tag="num_den_separate")
    assert p_struggle["path_id"] == "struggling"
    assert "Tactile" in p_struggle["activity_name"]
    assert "num_den_separate" in p_struggle["why"]

    # Case 2: Normal progressing student
    p_normal = determine_divergent_path(mastery_p=0.60, streak_wrong=0, streak_correct=1)
    assert p_normal["path_id"] == "normal"
    assert "Standard" in p_normal["path_name"]

    # Case 3: Advanced student with high mastery & streak
    p_adv = determine_divergent_path(mastery_p=0.88, streak_wrong=0, streak_correct=3)
    assert p_adv["path_id"] == "advanced"
    assert "Algebraic" in p_adv["activity_name"]
    assert "≥ 85%" in p_adv["why"]


def test_bkt_transparency_and_parameters():
    """Judge Recommendation 3: Centralized & Validated BKT parameters."""
    valid, msg = validate_bkt_params(p0=0.30, transition=0.15, slip=0.10, guess=0.25)
    assert valid is True

    # P(S) >= 0.5 must fail
    invalid, msg_inv = validate_bkt_params(p0=0.30, transition=0.15, slip=0.55, guess=0.25)
    assert invalid is False
    assert "slip" in msg_inv.lower()

    # P(G) >= 0.5 must fail
    invalid_g, msg_g = validate_bkt_params(p0=0.30, transition=0.15, slip=0.10, guess=0.55)
    assert invalid_g is False
    assert "guess" in msg_g.lower()


def test_bkt_versus_rule_evaluation():
    """Judge Recommendation 4: Evaluation workflow with difficulty recommendation comparison."""
    eval_res = evaluate_models()
    assert eval_res["dataset_type"] == "SYNTHETIC_DEMO"
    assert eval_res["sample_size"] == 8
    assert "difficulty_recommendation" in eval_res["metrics"]
    assert "methodology_and_limitations" in eval_res


def test_question_delete_and_ai_explanation_endpoints():
    """Judge Recommendation 6: Question maintenance workflows."""
    # Test AI Explanation generator
    exp_res = client.post("/api/questions/generate-explanation", json={
        "tag": "num_den_separate",
        "stem": "(-3/4) + (1/2)",
        "option_text": "-2/6"
    })
    assert exp_res.status_code == 200
    exp_data = exp_res.json()
    assert exp_data["ai_generated"] is True
    assert exp_data["requires_teacher_review"] is True
    assert "LCM" in exp_data["explanation_en"] or "denominators" in exp_data["explanation_en"]
    assert "క.సా.గు" in exp_data["explanation_te"] or "హారాలు" in exp_data["explanation_te"]
