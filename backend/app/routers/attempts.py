from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import datetime
from app.database import get_db
from app.models import Attempt, ConceptMastery, TeacherActionCard, TeacherConfig, User, Concept
from app.schemas import AttemptSyncBatch, AttemptSyncResponse
from app.auth import get_current_user
from app.engine.bkt import bkt_update, classify_mastery
from app.engine.adaptive_rules import AdaptiveRuleEngine

router = APIRouter(prefix="/attempts", tags=["Attempts & Sync"])

@router.post("/sync", response_model=AttemptSyncResponse)
def sync_attempts(
    batch: AttemptSyncBatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    user_id = user.id if user else 1
    student_name = user.full_name if user else "Learner (Demo)"

    # Get active teacher thresholds
    cfg = db.query(TeacherConfig).first()
    up_th = cfg.up_streak_threshold if cfg else 2
    down_th = cfg.down_streak_threshold if cfg else 2
    help_th = cfg.help_streak_threshold if cfg else 3
    p0 = cfg.bkt_p0 if cfg else 0.30
    transition = cfg.bkt_transition if cfg else 0.15
    slip = cfg.bkt_slip if cfg else 0.10
    guess = cfg.bkt_guess if cfg else 0.25

    rule_engine = AdaptiveRuleEngine(
        up_threshold=up_th,
        down_threshold=down_th,
        help_threshold=help_th
    )

    synced_count = 0
    duplicates_skipped = 0

    for item in batch.attempts:
        # Check idempotency by UUID
        existing = db.query(Attempt).filter(Attempt.id == item.id).first()
        if existing:
            duplicates_skipped += 1
            continue

        # Record attempt
        attempt = Attempt(
            id=item.id,
            user_id=user_id,
            question_id=item.question_id,
            concept_id=item.concept_id,
            selected_index=item.selected_index,
            is_correct=item.is_correct,
            hints_used=item.hints_used,
            time_spent_sec=item.time_spent_sec,
            misconception_tag=item.misconception_tag,
            attempt_source=item.attempt_source,
            created_at=item.created_at or datetime.datetime.now(datetime.UTC).replace(tzinfo=None),
            synced_at=datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
        )
        db.add(attempt)

        # Update mastery strictly for the referenced concept
        cm = db.query(ConceptMastery).filter(
            ConceptMastery.user_id == user_id,
            ConceptMastery.concept_id == item.concept_id
        ).first()

        if not cm:
            cm = ConceptMastery(
                user_id=user_id,
                concept_id=item.concept_id,
                mastery_score=p0,
                bkt_p=p0,
                rule_level=1,
                streak_correct=0,
                streak_wrong=0,
                last_path="Focused practice",
                last_reason="Initial baseline initialized"
            )
            db.add(cm)
            db.flush()

        # Update BKT
        cm.bkt_p = bkt_update(cm.bkt_p, item.is_correct, transition, slip, guess)
        cm.mastery_score = cm.bkt_p

        # Update Rule adaptation
        rule_eval = rule_engine.evaluate_step(
            current_level=cm.rule_level,
            streak_correct=cm.streak_correct,
            streak_wrong=cm.streak_wrong,
            is_correct=item.is_correct,
            hints_used=item.hints_used
        )
        cm.rule_level = rule_eval["level"]
        cm.streak_correct = rule_eval["streak_correct"]
        cm.streak_wrong = rule_eval["streak_wrong"]
        cm.last_path = rule_eval["path"]
        cm.last_reason = rule_eval["reason"]

        # Escalate to teacher action card if required
        if rule_eval["should_alert_teacher"]:
            c_meta = db.query(Concept).filter(Concept.id == item.concept_id).first()
            c_title = c_meta.title_en if c_meta else item.concept_id
            card = TeacherActionCard(
                user_id=user_id,
                student_name=student_name,
                concept_id=item.concept_id,
                concept_title=c_title,
                observation=f"Learner accumulated {rule_eval['streak_wrong']} consecutive errors in practice on '{c_title}'.",
                triggering_rule=f"Wrong streak >= teacher threshold ({help_th})",
                suggested_action=f"Assign prerequisite refresher on {c_meta.prerequisite_id if c_meta and c_meta.prerequisite_id else 'foundational concepts'}; check in.",
                reassessment_status="pending",
                status="pending",
                is_sample=False
            )
            db.add(card)

        synced_count += 1

    db.commit()

    # Collect current user masteries
    current_cms = db.query(ConceptMastery).filter(ConceptMastery.user_id == user_id).all()
    mastery_map = {}
    for cm in current_cms:
        mastery_map[cm.concept_id] = {
            "mastery_score": round(cm.mastery_score, 3),
            "bkt_p": round(cm.bkt_p, 3),
            "bkt_band": classify_mastery(cm.bkt_p),
            "rule_level": cm.rule_level,
            "streak_correct": cm.streak_correct,
            "streak_wrong": cm.streak_wrong,
            "last_path": cm.last_path,
            "last_reason": cm.last_reason
        }

    return {
        "synced_count": synced_count,
        "duplicates_skipped": duplicates_skipped,
        "current_masteries": mastery_map,
        "status": "success"
    }
