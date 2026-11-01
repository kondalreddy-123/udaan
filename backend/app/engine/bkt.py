"""
Bayesian Knowledge Tracing (BKT) Module for UDAAN.

Standard Corbett & Anderson (1994) formulation:
  - P(L0): Initial probability learner knows skill before first attempt.
  - P(T): Transition probability that learner learns skill between opportunities.
  - P(S): Slip probability - learner knows skill but makes an error.
  - P(G): Guess probability - learner does NOT know skill but guesses correctly.

Update Rule:
  1. Posterior probability given observation:
     P(L_t | Correct) = [ P(L_{t-1}) * (1 - P(S)) ] / [ P(L_{t-1}) * (1 - P(S)) + (1 - P(L_{t-1})) * P(G) ]
     P(L_t | Incorrect) = [ P(L_{t-1}) * P(S) ] / [ P(L_{t-1}) * P(S) + (1 - P(L_{t-1})) * (1 - P(G)) ]
  2. Transition update (accounting for learning opportunity):
     P(L_{t+1}) = P(L_t | obs) + (1 - P(L_t | obs)) * P(T)

SCIENTIFIC TRANSPARENCY NOTICE:
  Default parameter values (p0=0.30, T=0.15, S=0.10, G=0.25) are unvalidated baseline defaults
  drawn from cognitive tutoring literature (Corbett & Anderson 1994). They must be validated against
  empirical student data in supervised classroom pilots before drawing clinical or high-stakes conclusions.
"""

from typing import Tuple, List, Dict, Any, Optional

EPSILON = 1e-9

def validate_bkt_params(p0: float, transition: float, slip: float, guess: float) -> Tuple[bool, str]:
    """
    Validates mathematical and pedagogical feasibility of BKT parameters:
      - All parameters in (0, 1)
      - Slip and Guess strictly < 0.5 (otherwise guessing is more likely than knowing, or slipping is more likely than answering correctly)
      - P(S) + P(G) < 1 to preserve learning model identifiability (Baker et al.)
    """
    if not (0.0 < p0 < 1.0):
        return False, f"P(L0) must be between 0 and 1, got {p0}"
    if not (0.0 < transition < 1.0):
        return False, f"P(T) (transition) must be between 0 and 1, got {transition}"
    if not (0.0 <= slip < 0.5):
        return False, f"P(S) (slip) must be in [0, 0.5), got {slip}"
    if not (0.0 <= guess < 0.5):
        return False, f"P(G) (guess) must be in [0, 0.5), got {guess}"
    if (slip + guess) >= 1.0:
        return False, f"P(S) + P(G) must be < 1.0 for model identifiability, got {slip + guess:.2f}"
    return True, "Valid BKT parameters"


def bkt_update(
    prior_p: float,
    is_correct: bool,
    transition: float = 0.15,
    slip: float = 0.10,
    guess: float = 0.25
) -> float:
    """
    Calculates updated mastery probability P(L_t) given observation.
    Clamps values to [0.001, 0.999] to prevent division by zero or numerical instability.
    """
    p = max(0.001, min(0.999, float(prior_p)))
    s = max(0.0, min(0.499, float(slip)))
    g = max(0.0, min(0.499, float(guess)))
    t = max(0.001, min(0.999, float(transition)))

    if is_correct:
        numerator = p * (1.0 - s)
        denominator = numerator + (1.0 - p) * g
    else:
        numerator = p * s
        denominator = numerator + (1.0 - p) * (1.0 - g)

    denominator = max(EPSILON, denominator)
    posterior = numerator / denominator

    # Learning step
    updated = posterior + (1.0 - posterior) * t
    return max(0.001, min(0.999, updated))


def bkt_sequence(
    initial_p: float,
    sequence: str,  # e.g., "✓✓✗✓✓" or "1,1,0,1,1"
    transition: float = 0.15,
    slip: float = 0.10,
    guess: float = 0.25
) -> List[Dict[str, Any]]:
    """
    Traces a sequence of attempts and returns step-by-step audit logs.
    """
    history = []
    current_p = initial_p

    tokens = []
    if "," in sequence:
        tokens = [t.strip() in ("1", "true", "True", "✓") for t in sequence.split(",")]
    else:
        for ch in sequence:
            if ch in ("✓", "1", "+"):
                tokens.append(True)
            elif ch in ("✗", "0", "-", "x", "X"):
                tokens.append(False)

    for i, is_correct in enumerate(tokens):
        prev_p = current_p
        current_p = bkt_update(prev_p, is_correct, transition, slip, guess)
        history.append({
            "step": i + 1,
            "correct": is_correct,
            "prev_p": round(prev_p, 4),
            "new_p": round(current_p, 4),
            "delta": round(current_p - prev_p, 4),
            "band": classify_mastery(current_p)
        })

    return history


def classify_mastery(p: float) -> str:
    """
    Standard pedagogical mastery bands for student dashboards:
      < 0.20: Not started / Novice
      0.20 - 0.49: Building foundation
      0.50 - 0.84: Developing competency
      >= 0.85: Secure / Ready for challenge
    """
    if p < 0.20:
        return "Novice"
    if p < 0.50:
        return "Building"
    if p < 0.85:
        return "Competent"
    return "Secure / Challenge Ready"


def get_pacing_tier(
    mastery_p: float,
    foundation_max: float = 0.40,
    guided_max: float = 0.70,
    independent_max: float = 0.85
) -> Dict[str, Any]:
    """
    Explicit Adaptive Learning Pacing (Judge Recommendation 1):
      - Below 40%: Foundational explanation and simpler practice.
      - 40–69%: Guided practice with hints.
      - 70–84%: Independent practice.
      - 85% and above: Advanced challenges or next concept.
    """
    p_pct = round(mastery_p * 100, 1)

    if mastery_p < foundation_max:
        return {
            "id": "foundational",
            "tier_id": "foundational",
            "tier_name": "Tier 1: Foundational Scaffolding",
            "name": "Tier 1: Foundational Scaffolding",
            "threshold_range": f"< {int(foundation_max * 100)}%",
            "activity_type": "Foundational explanation & tactile partition practice",
            "recommended_action": "Review visual partition slices and complete Level 1 scaffolded drills.",
            "hints_available": True,
            "auto_hints": True,
            "difficulty_level": 1,
            "reason": f"Current mastery estimate is {p_pct}% (below the {int(foundation_max * 100)}% threshold). Foundational reinforcement is required before unassisted practice."
        }
    elif mastery_p < guided_max:
        return {
            "id": "guided",
            "tier_id": "guided",
            "tier_name": "Tier 2: Guided Practice",
            "name": "Tier 2: Guided Practice",
            "threshold_range": f"{int(foundation_max * 100)}%–{int(guided_max * 100) - 1}%",
            "activity_type": "Guided practice with on-demand hints",
            "recommended_action": "Solve standard NCERT problems with access to common denominator hints.",
            "hints_available": True,
            "auto_hints": False,
            "difficulty_level": 2,
            "reason": f"Current mastery estimate is {p_pct}% (within the {int(foundation_max * 100)}%–{int(guided_max * 100) - 1}% range). Student is developing fluency with scaffolding available on request."
        }
    elif mastery_p < independent_max:
        return {
            "id": "independent",
            "tier_id": "independent",
            "tier_name": "Tier 3: Independent Practice",
            "name": "Tier 3: Independent Practice",
            "threshold_range": f"{int(guided_max * 100)}%–{int(independent_max * 100) - 1}%",
            "activity_type": "Independent practice without hints",
            "recommended_action": "Complete timed fluency drills without hints to verify conceptual independence.",
            "hints_available": False,
            "auto_hints": False,
            "difficulty_level": 2,
            "reason": f"Current mastery estimate is {p_pct}% (within {int(guided_max * 100)}%–{int(independent_max * 100) - 1}%). Foundational rules are secure; testing independent problem-solving."
        }
    else:
        return {
            "id": "advanced",
            "tier_id": "advanced",
            "tier_name": "Tier 4: Advanced Mastery / Extension",
            "name": "Tier 4: Advanced Mastery / Extension",
            "threshold_range": f"≥ {int(independent_max * 100)}%",
            "activity_type": "Advanced challenge problems or next curriculum concept",
            "recommended_action": "Advance to Level 3 Rational Algebraic Expressions or assist peers.",
            "hints_available": False,
            "auto_hints": False,
            "difficulty_level": 3,
            "reason": f"Current mastery estimate is {p_pct}% (exceeds the {int(independent_max * 100)}% threshold). Mastery is statistically secure; advancing to higher-order challenges."
        }


def determine_divergent_path(
    mastery_p: float,
    streak_wrong: int,
    streak_correct: int,
    misconception_tag: Optional[str] = None,
    hints_used: int = 0
) -> Dict[str, Any]:
    """
    Divergent Student Learning Paths (Judge Recommendation 2):
      Routes students dynamically to:
        1. Struggling Path (Remedial & Tactile Scaffolding)
        2. Normal Progression Path (Standard Guided Learning)
        3. Advanced Mastery Path (Extension Challenges & Peer Review)
    """
    p_pct = round(mastery_p * 100, 1)

    # Struggling path criteria
    if mastery_p < 0.40 or streak_wrong >= 2 or misconception_tag or hints_used >= 2:
        reason_parts = []
        if mastery_p < 0.40:
            reason_parts.append(f"Mastery at {p_pct}% (< 40%)")
        if streak_wrong >= 2:
            reason_parts.append(f"{streak_wrong} consecutive errors")
        if misconception_tag:
            reason_parts.append(f"Active misconception '{misconception_tag}'")
        if hints_used >= 2:
            reason_parts.append(f"Heavy hint utilization ({hints_used})")

        return {
            "path_id": "struggling",
            "path_name": "Remedial & Tactile Scaffolding Path",
            "badge_color": "#fb923c",
            "icon": "🛡️",
            "activity_name": "Tactile Fraction Slices & LCM Review",
            "prerequisite_focus": "c2 (LCM & Common Denominators)",
            "scaffolding_mode": "High (Interactive Number Line + Misconception Breakdown)",
            "why": f"Routed to Struggling Path due to: {'; '.join(reason_parts)}. Focus shifted to tactile foundational reinforcement."
        }

    # Advanced path criteria
    elif mastery_p >= 0.85 or streak_correct >= 3:
        reason_parts = []
        if mastery_p >= 0.85:
            reason_parts.append(f"Mastery at {p_pct}% (≥ 85%)")
        if streak_correct >= 3:
            reason_parts.append(f"{streak_correct} consecutive correct answers")

        return {
            "path_id": "advanced",
            "path_name": "Advanced Extension & Mastery Path",
            "badge_color": "#10b981",
            "icon": "⭐",
            "activity_name": "Algebraic Fraction Equations & Real-World Modeling",
            "prerequisite_focus": "c7 (Rational Algebraic Expressions)",
            "scaffolding_mode": "Minimal (Timed independent challenges)",
            "why": f"Routed to Advanced Path due to: {'; '.join(reason_parts)}. Student demonstrated mastery and is ready for curriculum extension."
        }

    # Normal progression path
    else:
        return {
            "path_id": "normal",
            "path_name": "Standard Guided Progression Path",
            "badge_color": "#00f2fe",
            "icon": "🚀",
            "activity_name": "Unlike Denominator Word Problems with On-Demand Hints",
            "prerequisite_focus": "c5 (Adding Rationals)",
            "scaffolding_mode": "Moderate (Step-by-step guidance available)",
            "why": f"Routed to Standard Path: Mastery at {p_pct}% with steady progress. Standard NCERT progression maintained."
        }
