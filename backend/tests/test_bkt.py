import pytest
from app.engine.bkt import validate_bkt_params, bkt_update, bkt_sequence, classify_mastery

def test_bkt_param_validation():
    # Valid parameters
    valid, msg = validate_bkt_params(p0=0.3, transition=0.15, slip=0.1, guess=0.25)
    assert valid is True
    assert "Valid" in msg

    # Invalid p0 <= 0
    valid, msg = validate_bkt_params(p0=0.0, transition=0.15, slip=0.1, guess=0.25)
    assert valid is False
    assert "P(L0)" in msg

    # Invalid slip >= 0.5
    valid, msg = validate_bkt_params(p0=0.3, transition=0.15, slip=0.55, guess=0.2)
    assert valid is False
    assert "slip" in msg

    # Invalid slip + guess >= 1.0
    valid, msg = validate_bkt_params(p0=0.3, transition=0.15, slip=0.49, guess=0.52)
    assert valid is False

def test_bkt_update_direction():
    prior = 0.4
    # Correct response must strictly raise mastery
    post_correct = bkt_update(prior, is_correct=True, transition=0.15, slip=0.1, guess=0.25)
    assert post_correct > prior

    # Incorrect response must lower posterior prior to learning step
    post_wrong = bkt_update(prior, is_correct=False, transition=0.01, slip=0.1, guess=0.25)
    assert post_wrong < prior

def test_bkt_boundary_safety():
    # Boundary p=0 clamped safely, no divide-by-zero
    res_zero = bkt_update(0.0, is_correct=False)
    assert 0.001 <= res_zero <= 0.999
    assert not (res_zero != res_zero)  # Not NaN

    # Boundary p=1 clamped safely
    res_one = bkt_update(1.0, is_correct=True)
    assert 0.001 <= res_one <= 0.999

def test_bkt_sequence():
    history = bkt_sequence(0.3, "✓✓✓")
    assert len(history) == 3
    assert history[0]["new_p"] < history[1]["new_p"] < history[2]["new_p"]
    assert history[2]["band"] in ["Competent", "Secure / Challenge Ready"]

def test_classify_mastery_bands():
    assert classify_mastery(0.1) == "Novice"
    assert classify_mastery(0.35) == "Building"
    assert classify_mastery(0.70) == "Competent"
    assert classify_mastery(0.92) == "Secure / Challenge Ready"
