import pytest
from app.engine.detective import DetectiveSession

def test_detective_correct_initial_path():
    sess = DetectiveSession("case_rational_add")
    # Option 0 is correct (-1/4)
    res = sess.submit_primary(0)
    assert res["is_correct"] is True
    assert sess.state == "done"
    assert "Mastered" in sess.evidence_strength

def test_detective_careless_slip_path():
    sess = DetectiveSession("case_rational_add")
    # Option 1 (-1/3) -> num_den_separate
    res_primary = sess.submit_primary(1)
    assert res_primary["is_correct"] is False
    assert res_primary["suspected_tag"] == "num_den_separate"
    assert sess.state == "confirm"

    # Follow-up: 1/2 + 1/2 = ? -> learner answers 1 (Correct)
    res_follow = sess.submit_followup(is_correct=True)
    assert res_follow["is_slip"] is True
    assert sess.state == "retry_slip"
    assert "careless slip" in res_follow["retry_prompt"].lower()

def test_detective_confirmed_misconception_and_recovery():
    sess = DetectiveSession("case_rational_add")
    # Option 1 (-1/3) -> num_den_separate
    sess.submit_primary(1)
    
    # Follow-up: learner answers 2/4 (Incorrect -> confirms misconception)
    res_follow = sess.submit_followup(is_correct=False)
    assert res_follow["is_slip"] is False
    assert sess.state == "support"
    assert "hint_en" in res_follow["support"]
    assert "worked_example_en" in res_follow["support"]

    # Reassessment question: (-2/3) + (1/6) = ? -> Option 0 (-1/2) is correct
    res_reassess = sess.submit_reassessment(0)
    assert res_reassess["recovered"] is True
    assert sess.state == "done"

def test_detective_persistent_difficulty_creates_action_card():
    sess = DetectiveSession("case_rational_add")
    # Primary wrong
    sess.submit_primary(1)
    # Follow-up confirms misconception
    sess.submit_followup(is_correct=False)
    # Reassessment failed (Option 1: -1/9)
    res_reassess = sess.submit_reassessment(1, student_name="Test Student")
    
    assert res_reassess["recovered"] is False
    assert sess.state == "persistent"
    assert sess.teacher_card_generated is True
    assert res_reassess["action_card"]["student_name"] == "Test Student"
    assert "num_den_separate" in res_reassess["action_card"]["observation"]


def test_all_seven_rational_misconceptions_exist_and_work():
    """
    Verifies that all 7 required rational number misconception cases exist in DETECTIVE_CASES,
    have bilingual fields, valid options with misconception tags, diagnostic follow-ups,
    and fresh reassessment questions.
    """
    from app.engine.detective import DETECTIVE_CASES

    expected_cases = [
        "case_rational_add",
        "case_equivalent_fractions",
        "case_sign_confusion",
        "case_number_line",
        "case_mult_div_confusion",
        "case_simplification_cancel",
        "case_mixed_to_improper"
    ]

    for cid in expected_cases:
        assert cid in DETECTIVE_CASES, f"Missing required case: {cid}"
        case = DETECTIVE_CASES[cid]
        assert "concept_id" in case
        assert "concept_title_en" in case and "concept_title_te" in case
        assert "prerequisite_id" in case
        assert "primary_question" in case
        assert "follow_ups" in case
        assert "support" in case
        assert "reassessment" in case

        # Test session initialization for this case
        sess = DetectiveSession(cid)
        assert sess.case["concept_id"] == case["concept_id"]

        # Verify correct primary answer advances to done
        opts = case["primary_question"]["options"]
        correct_idx = next(i for i, o in enumerate(opts) if o["is_correct"])
        res_correct = sess.submit_primary(correct_idx)
        assert res_correct["is_correct"] is True
        assert sess.state == "done"

        # Verify incorrect primary answer routes to confirm
        sess_wrong = DetectiveSession(cid)
        wrong_idx = next(i for i, o in enumerate(opts) if not o["is_correct"])
        res_wrong = sess_wrong.submit_primary(wrong_idx)
        assert res_wrong["is_correct"] is False
        assert sess_wrong.state == "confirm"
        assert "follow_up_question" in res_wrong

