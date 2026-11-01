"""
Scientific Evaluation and Comparison Engine: Rule-Based Adaptation vs. Bayesian Knowledge Tracing (BKT).

NOTICE ON METHODOLOGY & LIMITATIONS:
  - Synthetic evaluation dataset: Explicitly crafted simulations (N=8 sequences), NOT empirical pilot data.
  - Baseline BKT priors (L0=0.30, T=0.15, S=0.10, G=0.25) are unvalidated baseline literature defaults (Corbett & Anderson 1994).
  - A higher agreement or mathematical complexity does NOT imply that BKT is intrinsically superior to rule heuristics.
  - Scientific validity requires:
      1. Blinded, double-coded teacher evaluation of authentic student work.
      2. Multi-classroom observational data.
      3. Controlled pre-test / post-test learning gains with delayed reassessment.
"""

from typing import List, Dict, Any
import io
import csv
from app.engine.bkt import bkt_update, classify_mastery, get_pacing_tier

# 8 Standard synthetic test sequences with simulated teacher labels and difficulty expectations
SYNTHETIC_CASES = [
    {
        "id": "SYN-01",
        "sequence": "✓✓✗✓✓",
        "description": "Strong start, isolated slip, recovered quickly",
        "teacher_label": 1,  # Mastered
        "expected_difficulty": 3,
        "notes": "Teacher judged isolated middle slip as a careless error."
    },
    {
        "id": "SYN-02",
        "sequence": "✗✗✓✗✗",
        "description": "Early errors, single isolated success, repeated errors",
        "teacher_label": 0,  # Not Mastered
        "expected_difficulty": 1,
        "notes": "Single correct answer was judged as a likely lucky guess."
    },
    {
        "id": "SYN-03",
        "sequence": "✗✓✓✓✓",
        "description": "Initial misconception resolved with consecutive streak",
        "teacher_label": 1,  # Mastered
        "expected_difficulty": 3,
        "notes": "Consistent mastery after initial instructional adjustment."
    },
    {
        "id": "SYN-04",
        "sequence": "✓✗✗✗✓",
        "description": "Early fluke correct, persistent struggle, end recovery attempt",
        "teacher_label": 0,  # Not Mastered
        "expected_difficulty": 1,
        "notes": "Persistent struggle outweighs the boundary answers."
    },
    {
        "id": "SYN-05",
        "sequence": "✗✗✗✓✓",
        "description": "Prolonged difficulty followed by 2 correct answers",
        "teacher_label": 1,  # Mastered (or Emerging)
        "expected_difficulty": 2,
        "notes": "Rule advances on 2-in-a-row; BKT remains cautious because of history."
    },
    {
        "id": "SYN-06",
        "sequence": "✓✓✓✗✗",
        "description": "Began confident, sudden back-to-back errors at higher difficulty",
        "teacher_label": 0,  # Not Mastered
        "expected_difficulty": 1,
        "notes": "Difficulty scaling revealed an unaddressed conceptual gap."
    },
    {
        "id": "SYN-07",
        "sequence": "✗✗✓✓✗",
        "description": "Unstable oscillation (2 wrong, 2 right, 1 wrong)",
        "teacher_label": 0,  # Not Mastered
        "expected_difficulty": 1,
        "notes": "Inconsistent performance; student lacks conceptual stability."
    },
    {
        "id": "SYN-08",
        "sequence": "✓✗✓✓✓",
        "description": "Minor slip early, sustained mastery",
        "teacher_label": 1,  # Mastered
        "expected_difficulty": 3,
        "notes": "Sustained high streak signals firm conceptual foundation."
    }
]


def evaluate_models(
    p0: float = 0.30,
    transition: float = 0.15,
    slip: float = 0.10,
    guess: float = 0.25,
    up_threshold: int = 2,
    down_threshold: int = 2,
    bkt_mastery_threshold: float = 0.85
) -> Dict[str, Any]:
    """
    Executes rule-based and BKT models over the synthetic cases and computes transparent comparison metrics.
    Compares:
      1. Mastery classification performance.
      2. Difficulty recommendation performance (Level 1, 2, or 3).
    """
    results = []
    rule_correct_count = 0
    bkt_correct_count = 0
    mastery_agreements_count = 0
    difficulty_agreements_count = 0
    total = len(SYNTHETIC_CASES)

    for case in SYNTHETIC_CASES:
        seq = case["sequence"]
        label = case["teacher_label"]
        exp_diff = case["expected_difficulty"]

        # Run Rule Model: tracks current correct streak vs wrong streak
        current_streak_c = 0
        current_streak_w = 0
        rule_level = 2  # default start at Level 2

        for ch in seq:
            if ch == "✓":
                current_streak_c += 1
                current_streak_w = 0
                if current_streak_c >= up_threshold:
                    rule_level = min(3, rule_level + 1)
            else:
                current_streak_w += 1
                current_streak_c = 0
                if current_streak_w >= down_threshold:
                    rule_level = max(1, rule_level - 1)

        rule_pred = 1 if current_streak_c >= up_threshold else 0
        rule_diff_rec = rule_level

        # Run BKT Model
        p = p0
        step_probs = [round(p, 3)]
        for ch in seq:
            is_c = (ch == "✓")
            p = bkt_update(p, is_c, transition, slip, guess)
            step_probs.append(round(p, 3))

        bkt_pred = 1 if p >= bkt_mastery_threshold else 0
        
        # BKT Difficulty recommendation using explicit pacing tiers
        if p < 0.40:
            bkt_diff_rec = 1
        elif p < 0.85:
            bkt_diff_rec = 2
        else:
            bkt_diff_rec = 3

        rule_match = (rule_pred == label)
        bkt_match = (bkt_pred == label)
        models_agree_mastery = (rule_pred == bkt_pred)
        models_agree_diff = (rule_diff_rec == bkt_diff_rec)

        if rule_match:
            rule_correct_count += 1
        if bkt_match:
            bkt_correct_count += 1
        if models_agree_mastery:
            mastery_agreements_count += 1
        if models_agree_diff:
            difficulty_agreements_count += 1

        results.append({
            "id": case["id"],
            "sequence": seq,
            "description": case["description"],
            "teacher_label": label,
            "teacher_label_text": "Mastered" if label == 1 else "Not Mastered",
            "expected_difficulty": exp_diff,
            "rule_prediction": rule_pred,
            "rule_prediction_text": "Mastered" if rule_pred == 1 else "Not Mastered",
            "rule_streak": current_streak_c,
            "rule_difficulty_rec": rule_diff_rec,
            "rule_correct": rule_match,
            "bkt_final_p": round(p, 4),
            "bkt_prediction": bkt_pred,
            "bkt_prediction_text": "Mastered" if bkt_pred == 1 else "Not Mastered",
            "bkt_difficulty_rec": bkt_diff_rec,
            "bkt_correct": bkt_match,
            "bkt_band": classify_mastery(p),
            "pacing_tier": get_pacing_tier(p),
            "models_agree": models_agree_mastery,
            "difficulty_agree": models_agree_diff,
            "trajectory": step_probs,
            "notes": case["notes"]
        })

    rule_acc = round(rule_correct_count / total, 3)
    bkt_acc = round(bkt_correct_count / total, 3)
    agreement_rate = round(mastery_agreements_count / total, 3)
    diff_agreement_rate = round(difficulty_agreements_count / total, 3)

    return {
        "dataset_type": "SYNTHETIC_DEMO",
        "dataset_subtype": "SYNTHETIC_BENCHMARK_SUITE",
        "sample_size": total,
        "dataset_origin": "Synthetic simulated sequences representing 8 classic edge-case student response patterns (slips, lucky guesses, recovery, oscillation).",
        "parameters_used": {
            "p0": p0,
            "transition": transition,
            "slip": slip,
            "guess": guess,
            "rule_up_threshold": up_threshold,
            "rule_down_threshold": down_threshold,
            "bkt_mastery_threshold": bkt_mastery_threshold
        },
        "metrics": {
            "mastery_prediction": {
                "rule_accuracy": rule_acc,
                "bkt_accuracy": bkt_acc,
                "agreement_rate": agreement_rate,
                "rule_matches": f"{rule_correct_count}/{total}",
                "bkt_matches": f"{bkt_correct_count}/{total}",
                "model_agreements": f"{mastery_agreements_count}/{total}"
            },
            "difficulty_recommendation": {
                "difficulty_agreement_rate": diff_agreement_rate,
                "difficulty_agreements": f"{difficulty_agreements_count}/{total}"
            }
        },
        "disagreements": [r for r in results if not r["models_agree"]],
        "cases": results,
        "methodology_and_limitations": {
            "evaluation_conditions": "Both models evaluated on identical chronological attempt sequences without lookahead or data leakage.",
            "rule_observations": "Rule-based baseline reacts quickly (advances on 2-in-a-row), but suffers from memorylessness: a single slip immediately erases a high streak, and a lucky guess pair can prematurely promote an unready learner.",
            "bkt_observations": "BKT maintains a smooth Bayesian posterior that absorbs occasional slips and guesses, but requires careful prior calibration and is more conservative when prolonged early struggle precedes a recovery streak (e.g. SYN-05).",
            "scientific_disclaimer": "This benchmark uses synthetic data. No empirical claim of real-world learning gains can be made without multi-school classroom trial data."
        }
    }


def export_evaluation_csv(evaluation_data: Dict[str, Any]) -> str:
    """Generates CSV format of the evaluation cases for researcher download."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Case ID", "Sequence", "Teacher Label", "Rule Pred", "Rule Correct",
        "Rule Level", "BKT Final P", "BKT Pred", "BKT Correct", "BKT Level",
        "Mastery Agree", "Diff Agree", "Notes"
    ])
    for c in evaluation_data.get("cases", []):
        writer.writerow([
            c["id"],
            c["sequence"],
            c["teacher_label_text"],
            c["rule_prediction_text"],
            "YES" if c["rule_correct"] else "NO",
            f"Level {c.get('rule_difficulty_rec', 2)}",
            c["bkt_final_p"],
            c["bkt_prediction_text"],
            "YES" if c["bkt_correct"] else "NO",
            f"Level {c.get('bkt_difficulty_rec', 2)}",
            "YES" if c["models_agree"] else "NO",
            "YES" if c.get("difficulty_agree") else "NO",
            c["notes"]
        ])
    return output.getvalue()
