"""
Student self-service endpoints.
Returns real data from the database for the authenticated (or demo) student.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime
from typing import List, Dict, Any

from app.database import get_db
from app.models import User, Attempt, ConceptMastery, Concept, TeacherActionCard, DiagnosticRecord
from app.auth import get_current_user
from app.engine.bkt import classify_mastery, get_pacing_tier

router = APIRouter(prefix="/student", tags=["Student Profile"])


def _compute_streak(attempts_asc: list) -> int:
    """Return the current consecutive-day learning streak."""
    if not attempts_asc:
        return 0
    today = datetime.date.today()
    streak = 0
    check_date = today
    # Build a set of unique attempt dates
    attempt_dates = sorted(
        {a.created_at.date() for a in attempts_asc if a.created_at},
        reverse=True
    )
    for d in attempt_dates:
        if d == check_date or d == check_date - datetime.timedelta(days=1):
            streak += 1
            check_date = d
        elif d < check_date - datetime.timedelta(days=1):
            break
    return streak


@router.get("/me")
def get_student_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """
    Returns the authenticated student's profile, mastery scores,
    personalized learning roadmap, daily goals, diagnostic history,
    weekly stats, and recent attempts.
    """
    user_id = user.id if user else 1
    student_name = user.full_name if user else "Aarav Sharma (Student)"
    student_email = user.email if user else "student@udaan.edu"

    # All concepts ordered by sequence
    concepts = db.query(Concept).order_by(Concept.sequence_order).all()

    # Concept mastery records for this student
    masteries = db.query(ConceptMastery).filter(
        ConceptMastery.user_id == user_id
    ).all()
    mastery_map = {m.concept_id: m for m in masteries}

    # All attempts for this student
    all_attempts = db.query(Attempt).filter(
        Attempt.user_id == user_id
    ).order_by(Attempt.created_at.asc()).all()

    # Today attempts for Daily Goal
    today_start = datetime.datetime.now(datetime.UTC).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    today_attempts = [a for a in all_attempts if a.created_at and a.created_at >= today_start]
    daily_goal_target = 5
    daily_goal_completed = len(today_attempts)

    # Recent attempts (last 30 days)
    since_30d = datetime.datetime.now(datetime.UTC).replace(tzinfo=None) - datetime.timedelta(days=30)
    recent_attempts = [a for a in reversed(all_attempts) if a.created_at and a.created_at >= since_30d]

    # Weekly stats (last 7 days)
    since_7d = datetime.datetime.now(datetime.UTC).replace(tzinfo=None) - datetime.timedelta(days=7)
    weekly_attempts = [a for a in recent_attempts if a.created_at and a.created_at >= since_7d]
    weekly_correct = sum(1 for a in weekly_attempts if a.is_correct)
    weekly_topics = len({a.concept_id for a in weekly_attempts})

    streak = _compute_streak(all_attempts)

    # Build per-concept mastery detail
    concept_details = []
    for c in concepts:
        m = mastery_map.get(c.id)
        score = m.mastery_score if m else 0.30
        band = classify_mastery(score) if m else "Foundational"
        tier_info = get_pacing_tier(score)
        concept_details.append({
            "concept_id": c.id,
            "title_en": c.title_en,
            "title_te": c.title_te,
            "mastery_score": round(score, 3),
            "mastery_pct": int(round(score * 100)),
            "bkt_band": band,
            "tier_name": tier_info["name"],
            "rule_level": m.rule_level if m else 1,
            "streak_correct": m.streak_correct if m else 0,
            "streak_wrong": m.streak_wrong if m else 0,
            "attempts_count": m.attempts_count if m else 0,
            "last_path": m.last_path if m else "Not started",
            "last_reason": m.last_reason if m else "No attempts yet",
            "prerequisite_id": c.prerequisite_id,
            "sequence_order": c.sequence_order,
        })

    # Build Personalized Learning Roadmap based on dependencies & actual mastery
    roadmap = []
    for cd in concept_details:
        score = cd["mastery_score"]
        prereq_id = cd["prerequisite_id"]
        prereq_score = mastery_map.get(prereq_id).mastery_score if prereq_id and mastery_map.get(prereq_id) else 1.0

        if score >= 0.70:
            status = "completed"
            status_label = "Mastered"
        elif score >= 0.40:
            status = "in_progress"
            status_label = "In Progress"
        elif prereq_score >= 0.40:
            status = "needs_practice"
            status_label = "Needs Practice"
        else:
            status = "upcoming"
            status_label = "Upcoming (Prerequisite needed)"

        roadmap.append({
            "concept_id": cd["concept_id"],
            "title_en": cd["title_en"],
            "title_te": cd["title_te"],
            "status": status,
            "status_label": status_label,
            "mastery_pct": cd["mastery_pct"],
            "prerequisite_id": prereq_id,
            "sequence_order": cd["sequence_order"]
        })

    # Overall mastery
    attempted_scores = [m.mastery_score for m in masteries]
    overall_mastery = round(sum(attempted_scores) / len(attempted_scores), 3) if attempted_scores else 0.30
    overall_mastery_pct = int(round(overall_mastery * 100))

    # Strengths: mastery >= 0.70
    strengths = [c for c in concept_details if c["mastery_score"] >= 0.70]
    # Needs practice: mastery < 0.45
    needs_practice = [c for c in concept_details if c["mastery_score"] < 0.45]

    # Recommended next concept
    next_concept = None
    for c in concept_details:
        if c["mastery_score"] < 0.70:
            if c["prerequisite_id"] is None:
                next_concept = c
                break
            prereq_score = mastery_map.get(c["prerequisite_id"])
            if prereq_score and prereq_score.mastery_score >= 0.45:
                next_concept = c
                break

    if not next_concept and concept_details:
        next_concept = concept_details[-1]

    if next_concept:
        tier_pacing = get_pacing_tier(next_concept["mastery_score"])
        recommended_learning = {
            "concept_id": next_concept["concept_id"],
            "title_en": next_concept["title_en"],
            "title_te": next_concept["title_te"],
            "why_recommended": f"Current mastery is {next_concept['mastery_pct']}%. Prerequisite concept is solid. Practicing this bridges your foundation for rational operations.",
            "estimated_time_mins": 12,
            "recommended_difficulty": tier_pacing["name"],
            "target_tier": tier_pacing["id"]
        }
    else:
        recommended_learning = {
            "concept_id": "c5",
            "title_en": "Adding Rationals with Unlike Denominators",
            "title_te": "వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక",
            "why_recommended": "Core curriculum focus for Class 8 Mathematics.",
            "estimated_time_mins": 10,
            "recommended_difficulty": "Tier 2: Guided Practice",
            "target_tier": "guided"
        }

    # Recent attempts formatted
    recent_10 = []
    for a in recent_attempts[:10]:
        c_match = next((c for c in concepts if c.id == a.concept_id), None)
        recent_10.append({
            "id": a.id,
            "concept_id": a.concept_id,
            "concept_title_en": c_match.title_en if c_match else a.concept_id,
            "is_correct": a.is_correct,
            "misconception_tag": a.misconception_tag,
            "attempt_source": a.attempt_source,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    # Diagnostic records for history
    diags = db.query(DiagnosticRecord).filter(
        DiagnosticRecord.user_id == user_id
    ).order_by(DiagnosticRecord.created_at.desc()).limit(8).all()

    diagnostic_history = [
        {
            "id": d.id,
            "concept_id": d.concept_id,
            "original_question": d.original_question,
            "student_response": d.student_response,
            "suspected_misconception": d.suspected_misconception,
            "confirmation_status": d.confirmation_status,
            "confidence_level": d.confidence_level,
            "supporting_evidence": d.supporting_evidence,
            "reassessment_result": d.reassessment_result,
            "created_at": d.created_at.isoformat() if d.created_at else None
        }
        for d in diags
    ]

    # Badges (computed from real attempt history)
    total_attempts = len(all_attempts)
    total_correct = sum(1 for a in all_attempts if a.is_correct)
    badges = []
    if total_attempts >= 5:
        badges.append({"id": "first_5", "name_en": "Curious Explorer", "name_te": "పరిశోధకుడు",
                        "desc_en": "Completed your first 5 exercises!", "earned": True})
    if streak >= 3:
        badges.append({"id": "streak_3", "name_en": "3-Day Streak", "name_te": "3 రోజుల వరుస",
                        "desc_en": "Learned 3 days in a row!", "earned": True})
    if streak >= 7:
        badges.append({"id": "streak_7", "name_en": "Week Warrior", "name_te": "వారం యోధుడు",
                        "desc_en": "7-day learning streak!", "earned": True})
    if any(m.mastery_score >= 0.80 for m in masteries):
        badges.append({"id": "topic_master", "name_en": "Rational Champion", "name_te": "విషయ నిపుణుడు",
                        "desc_en": "Achieved advanced mastery in a topic!", "earned": True})
    if total_correct >= 20:
        badges.append({"id": "correct_20", "name_en": "Accuracy Master", "name_te": "ఖచ్చితత్వ విజేత",
                        "desc_en": "Answered 20 questions correctly!", "earned": True})

    # Unearned badges
    if total_attempts < 5:
        badges.append({"id": "first_5", "name_en": "Curious Explorer", "name_te": "పరిశోధకుడు",
                        "desc_en": f"Complete {5 - total_attempts} more questions to earn this!", "earned": False})
    if streak < 3:
        badges.append({"id": "streak_3", "name_en": "3-Day Streak", "name_te": "3 రోజుల వరుస",
                        "desc_en": f"Learn for 3 consecutive days to unlock!", "earned": False})

    # Active teacher action cards for this student
    action_cards = db.query(TeacherActionCard).filter(
        TeacherActionCard.user_id == user_id,
        TeacherActionCard.status == "pending"
    ).all()

    return {
        "user_id": user_id,
        "full_name": student_name,
        "email": student_email,
        "role": user.role if user else "student",
        "class_name": user.class_name if user else "Class 8 - Section A",
        "streak_days": streak,
        "overall_mastery": overall_mastery,
        "overall_mastery_pct": overall_mastery_pct,
        "concepts_mastered_count": len(strengths),
        "concepts_in_progress_count": len([c for c in concept_details if 0.40 <= c["mastery_score"] < 0.70]),
        "concepts_requiring_attention_count": len(needs_practice),
        "concepts": concept_details,
        "roadmap": roadmap,
        "strengths": strengths,
        "needs_practice": needs_practice,
        "next_recommended_concept": next_concept,
        "recommended_learning": recommended_learning,
        "daily_goal": {
            "target": daily_goal_target,
            "completed": daily_goal_completed,
            "achieved": daily_goal_completed >= daily_goal_target,
            "percent": min(100, int(round((daily_goal_completed / daily_goal_target) * 100)))
        },
        "weekly_stats": {
            "total_attempts": len(weekly_attempts),
            "correct": weekly_correct,
            "accuracy_pct": round(weekly_correct / max(1, len(weekly_attempts)) * 100) if weekly_attempts else 0,
            "topics_touched": weekly_topics,
        },
        "total_stats": {
            "total_attempts": total_attempts,
            "correct": total_correct,
            "accuracy_pct": round(total_correct / max(1, total_attempts) * 100) if total_attempts else 0,
        },
        "recent_attempts": recent_10,
        "diagnostic_history": diagnostic_history,
        "badges": badges,
        "pending_teacher_cards": len(action_cards),
    }


@router.get("/streak")
def get_student_streak(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Compute learning streak (consecutive days with ≥1 attempt)."""
    user_id = user.id if user else 1
    all_attempts = db.query(Attempt).filter(
        Attempt.user_id == user_id
    ).order_by(Attempt.created_at.asc()).all()
    streak = _compute_streak(all_attempts)
    return {"user_id": user_id, "streak_days": streak}


@router.get("/mastery")
def get_student_mastery(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """Return all concept mastery records for the authenticated student."""
    user_id = user.id if user else 1
    concepts = db.query(Concept).order_by(Concept.sequence_order).all()
    masteries = db.query(ConceptMastery).filter(ConceptMastery.user_id == user_id).all()
    mastery_map = {m.concept_id: m for m in masteries}

    result = []
    for c in concepts:
        m = mastery_map.get(c.id)
        score = m.mastery_score if m else 0.30
        result.append({
            "concept_id": c.id,
            "title_en": c.title_en,
            "title_te": c.title_te,
            "mastery_score": round(score, 3),
            "bkt_p": round(m.bkt_p if m else 0.30, 3),
            "bkt_band": classify_mastery(score),
            "rule_level": m.rule_level if m else 1,
            "streak_correct": m.streak_correct if m else 0,
            "streak_wrong": m.streak_wrong if m else 0,
            "last_path": m.last_path if m else "Not started",
            "last_reason": m.last_reason if m else "No attempts yet",
        })
    return result
