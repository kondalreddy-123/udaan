"""
Explicit, explainable rule-based adaptation engine for UDAAN.

Rules:
  1. Escalation / Teacher Intervention:
     Triggered when wrong streak >= help_threshold OR persistent reassessment failure.
     Path: 'Request teacher help'
  2. Prerequisite Revisit / Targeted Foundation:
     Triggered when wrong streak >= down_threshold OR heavy hints requested (>=2) OR confirmed misconception.
     Path: 'Revisit prerequisite' (decrements difficulty level, capped at 1)
  3. Progression / Challenge:
     Triggered when correct streak >= up_threshold.
     Path: 'Harder questions' (increments difficulty level, capped at 3)
  4. Recovery:
     Triggered after successful reassessment question.
     Path: 'Progression - Recovery Verified'
  5. Default Baseline:
     Path: 'Focused practice' (insufficient consecutive signals to adjust level)
"""

from typing import Dict, Any, Optional
from app.engine.bkt import get_pacing_tier, determine_divergent_path

class AdaptiveRuleEngine:
    def __init__(
        self,
        up_threshold: int = 2,
        down_threshold: int = 2,
        help_threshold: int = 3,
        pacing_foundation_max: float = 0.40,
        pacing_guided_max: float = 0.70,
        pacing_independent_max: float = 0.85
    ):
        self.up_threshold = max(1, up_threshold)
        self.down_threshold = max(1, down_threshold)
        self.help_threshold = max(self.down_threshold, help_threshold)
        self.pacing_foundation_max = pacing_foundation_max
        self.pacing_guided_max = pacing_guided_max
        self.pacing_independent_max = pacing_independent_max

    def evaluate_step(
        self,
        current_level: int,
        streak_correct: int,
        streak_wrong: int,
        is_correct: bool,
        hints_used: int = 0,
        is_reassessment: bool = False,
        misconception_confirmed: bool = False,
        mastery_p: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Calculates new streaks, target difficulty level, learning path, and human-readable explanation.
        """
        level = max(1, min(3, current_level))

        if is_correct:
            new_streak_c = streak_correct + 1
            new_streak_w = 0
        else:
            new_streak_w = streak_wrong + 1
            new_streak_c = 0

        # Check rules in strict pedagogical priority order
        if is_reassessment and is_correct:
            path = "Progression - Recovery Verified"
            reason = "Fresh reassessment answered correctly after targeted support. Misconception resolved."
            new_level = level  # maintain or ready for standard climb

        elif is_reassessment and not is_correct:
            path = "Request teacher help"
            reason = "Persistent difficulty: Fresh reassessment failed after targeted instructional support."
            new_level = max(1, level - 1)

        elif new_streak_w >= self.help_threshold:
            path = "Request teacher help"
            reason = f"Persistent struggle: {new_streak_w} incorrect responses in a row (threshold: {self.help_threshold})."
            new_level = max(1, level - 1)

        elif misconception_confirmed:
            path = "Revisit prerequisite"
            reason = "Misconception confirmed via targeted diagnostic follow-up. Prerequisite foundation required."
            new_level = max(1, level - 1)

        elif new_streak_w >= self.down_threshold or hints_used >= 2:
            path = "Revisit prerequisite"
            if new_streak_w >= self.down_threshold:
                reason = f"Consecutive error streak ({new_streak_w}) met prerequisite review threshold ({self.down_threshold})."
            else:
                reason = f"Heavy hint utilization ({hints_used} hints). Additional instructional scaffolding needed."
            new_level = max(1, level - 1)

        elif new_streak_c >= self.up_threshold:
            path = "Harder questions"
            reason = f"Demonstrated competence: {new_streak_c} consecutive correct responses (threshold: {self.up_threshold}). Level adjusted to {min(3, level + 1)}."
            new_level = min(3, level + 1)

        else:
            path = "Focused practice"
            if is_correct:
                reason = f"Correct answer logged ({new_streak_c}/{self.up_threshold} needed to advance). More evidence being gathered."
            else:
                reason = f"Single error recorded ({new_streak_w}/{self.down_threshold} before prerequisite review). Continuing focused practice."
            new_level = level

        result: Dict[str, Any] = {
            "path": path,
            "reason": reason,
            "level": new_level,
            "streak_correct": new_streak_c,
            "streak_wrong": new_streak_w,
            "should_alert_teacher": "teacher help" in path.lower()
        }

        # Attach pacing and divergent path when mastery is supplied
        if mastery_p is not None:
            result["pacing"] = get_pacing_tier(
                mastery_p,
                self.pacing_foundation_max,
                self.pacing_guided_max,
                self.pacing_independent_max
            )
            result["divergent_path"] = determine_divergent_path(
                mastery_p=mastery_p,
                streak_wrong=new_streak_w,
                streak_correct=new_streak_c,
                hints_used=hints_used
            )

        return result
