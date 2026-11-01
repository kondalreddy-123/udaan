import pytest
from app.engine.adaptive_rules import AdaptiveRuleEngine

def test_advance_on_correct_streak():
    engine = AdaptiveRuleEngine(up_threshold=2, down_threshold=2, help_threshold=3)
    
    # Step 1: 1 correct -> focused practice
    res1 = engine.evaluate_step(current_level=1, streak_correct=0, streak_wrong=0, is_correct=True)
    assert res1["streak_correct"] == 1
    assert res1["path"] == "Focused practice"
    assert res1["level"] == 1

    # Step 2: 2nd correct -> advance to harder questions
    res2 = engine.evaluate_step(current_level=1, streak_correct=1, streak_wrong=0, is_correct=True)
    assert res2["streak_correct"] == 2
    assert res2["path"] == "Harder questions"
    assert res2["level"] == 2
    assert "threshold: 2" in res2["reason"]

def test_prerequisite_on_wrong_streak():
    engine = AdaptiveRuleEngine(up_threshold=2, down_threshold=2, help_threshold=3)
    
    # Step 1: 1 wrong -> focused practice
    res1 = engine.evaluate_step(current_level=2, streak_correct=2, streak_wrong=0, is_correct=False)
    assert res1["streak_wrong"] == 1
    assert res1["streak_correct"] == 0
    assert res1["path"] == "Focused practice"

    # Step 2: 2nd wrong -> drop to prerequisite
    res2 = engine.evaluate_step(current_level=2, streak_correct=0, streak_wrong=1, is_correct=False)
    assert res2["streak_wrong"] == 2
    assert res2["path"] == "Revisit prerequisite"
    assert res2["level"] == 1

def test_heavy_hints_triggers_prerequisite():
    engine = AdaptiveRuleEngine()
    res = engine.evaluate_step(current_level=2, streak_correct=0, streak_wrong=0, is_correct=False, hints_used=2)
    assert res["path"] == "Revisit prerequisite"
    assert "Heavy hint" in res["reason"]

def test_persistent_wrong_escalates_to_teacher():
    engine = AdaptiveRuleEngine(up_threshold=2, down_threshold=2, help_threshold=3)
    res = engine.evaluate_step(current_level=1, streak_correct=0, streak_wrong=2, is_correct=False)
    assert res["streak_wrong"] == 3
    assert res["path"] == "Request teacher help"
    assert res["should_alert_teacher"] is True

def test_reassessment_recovery_and_failure():
    engine = AdaptiveRuleEngine()
    # Reassessment passed -> recovery
    res_pass = engine.evaluate_step(current_level=1, streak_correct=0, streak_wrong=1, is_correct=True, is_reassessment=True)
    assert res_pass["path"] == "Progression - Recovery Verified"

    # Reassessment failed -> teacher help
    res_fail = engine.evaluate_step(current_level=1, streak_correct=0, streak_wrong=1, is_correct=False, is_reassessment=True)
    assert res_fail["path"] == "Request teacher help"
    assert res_fail["should_alert_teacher"] is True
