import uuid
import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, Any, List
from app.database import get_db
from app.models import ConceptMastery, TeacherActionCard, User, Attempt, DiagnosticRecord
from app.auth import get_current_user
from app.engine.detective import DetectiveSession, DETECTIVE_CASES
from app.engine.bkt import bkt_update
from app.engine.adaptive_rules import AdaptiveRuleEngine
from app.schemas import DetectivePrimarySubmit, DetectiveFollowupSubmit, DetectiveReassessmentSubmit, DiagnosticRecordResponse

router = APIRouter(prefix="/detective", tags=["Learning Detective"])

# In-memory session tracking by user_id for multi-step detective interaction
sessions: Dict[int, DetectiveSession] = {}

def get_or_create_session(user_id: int) -> DetectiveSession:
    if user_id not in sessions:
        sessions[user_id] = DetectiveSession("case_rational_add")
    return sessions[user_id]

@router.get("/cases")
def list_detective_cases():
    """
    Returns the comprehensive rational numbers misconception library cases.
    """
    return [
        {
            "id": k,
            "concept_id": v["concept_id"],
            "title_en": v["concept_title_en"],
            "title_te": v["concept_title_te"],
            "prerequisite_id": v["prerequisite_id"],
            "prerequisite_title_en": v["prerequisite_title_en"],
            "prerequisite_title_te": v["prerequisite_title_te"]
        }
        for k, v in DETECTIVE_CASES.items()
    ]

@router.post("/start")
def start_detective(case_id: str = "case_rational_add", user: User = Depends(get_current_user)):
    user_id = user.id if user else 1
    sess = DetectiveSession(case_id)
    sessions[user_id] = sess
    
    q = sess.case["primary_question"]
    return {
        "status": "ready",
        "case_id": case_id,
        "concept_id": sess.case["concept_id"],
        "concept_title_en": sess.case["concept_title_en"],
        "concept_title_te": sess.case["concept_title_te"],
        "prerequisite_id": sess.case["prerequisite_id"],
        "prerequisite_title_en": sess.case["prerequisite_title_en"],
        "prerequisite_title_te": sess.case["prerequisite_title_te"],
        "question": {
            "id": q["id"],
            "stem_en": q["stem_en"],
            "stem_te": q["stem_te"],
            "options": [
                {
                    "index": i,
                    "text_en": opt["text_en"],
                    "text_te": opt["text_te"]
                }
                for i, opt in enumerate(q["options"])
            ]
        }
    }

@router.post("/primary")
def submit_primary(
    data: DetectivePrimarySubmit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    user_id = user.id if user else 1
    sess = get_or_create_session(user_id)
    result = sess.submit_primary(data.option_index)

    q = sess.case["primary_question"]
    opt = q["options"][data.option_index]
    is_correct = opt["is_correct"]

    # Idempotent attempt recording
    att_id = data.attempt_id or str(uuid.uuid4())
    existing_att = db.query(Attempt).filter(Attempt.id == att_id).first()
    if not existing_att:
        att = Attempt(
            id=att_id,
            user_id=user_id,
            question_id=q["id"],
            concept_id=sess.case["concept_id"],
            selected_index=data.option_index,
            is_correct=is_correct,
            hints_used=0,
            time_spent_sec=data.time_spent_sec,
            misconception_tag=opt.get("tag"),
            attempt_source="detective_main"
        )
        db.add(att)

    # Persist Diagnostic Record
    diag_id = f"diag_{user_id}_{sess.case['concept_id']}_{int(datetime.datetime.now(datetime.UTC).timestamp())}"
    follow_up_stem = sess.case["follow_ups"].get(opt.get("tag", ""), {}).get("stem_en") if not is_correct else None
    diag = DiagnosticRecord(
        id=diag_id,
        user_id=user_id,
        concept_id=sess.case["concept_id"],
        case_id=getattr(sess, "case_id", "case_rational_add"),
        original_question=q["stem_en"],
        student_response=opt["text_en"],
        suspected_misconception=opt.get("tag") or ("None" if is_correct else "unclassified_error"),
        diagnostic_question=follow_up_stem,
        confirmation_status="mastered" if is_correct else "pending",
        confidence_level="High (Direct Solution)" if is_correct else "Low (Single Observation)",
        supporting_evidence="Direct answer correct on primary diagnostic." if is_correct else f"Distractor '{opt['text_en']}' selected indicating potential '{opt.get('tag')}'.",
        recommended_intervention="Advance to next topic" if is_correct else sess.case.get("support", {}).get("hint_en", "LCM fraction strip review")
    )
    db.add(diag)

    # Mastery & Rule updates
    cm = db.query(ConceptMastery).filter(
        ConceptMastery.user_id == user_id,
        ConceptMastery.concept_id == sess.case["concept_id"]
    ).first()
    if not cm:
        cm = ConceptMastery(
            user_id=user_id,
            concept_id=sess.case["concept_id"],
            mastery_score=0.30,
            bkt_p=0.30,
            rule_level=1
        )
        db.add(cm)

    cm.attempts_count = (cm.attempts_count or 0) + 1
    cm.last_attempt_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

    if is_correct:
        cm.bkt_p = bkt_update(cm.bkt_p, True)
        cm.mastery_score = cm.bkt_p
        cm.streak_correct += 1
        cm.streak_wrong = 0
        cm.last_path = "Harder questions"
        cm.last_reason = "Answered diagnostic question correctly on initial attempt."

    db.commit()
    result["attempt_id"] = att_id
    result["diag_id"] = diag_id
    return result

@router.post("/followup")
def submit_followup(
    data: DetectiveFollowupSubmit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    user_id = user.id if user else 1
    sess = get_or_create_session(user_id)
    result = sess.submit_followup(data.is_correct)

    # Idempotent attempt recording
    att_id = data.attempt_id or str(uuid.uuid4())
    existing_att = db.query(Attempt).filter(Attempt.id == att_id).first()
    if not existing_att:
        att = Attempt(
            id=att_id,
            user_id=user_id,
            question_id=f"{sess.case.get('primary_question', {}).get('id', 'DET')}-FU",
            concept_id=sess.case["concept_id"],
            selected_index=0 if data.is_correct else 1,
            is_correct=data.is_correct,
            hints_used=0,
            time_spent_sec=data.time_spent_sec,
            misconception_tag=sess.suspected_tag if not data.is_correct else None,
            attempt_source="detective_followup"
        )
        db.add(att)

    # Update latest diagnostic record
    latest_diag = db.query(DiagnosticRecord).filter(
        DiagnosticRecord.user_id == user_id,
        DiagnosticRecord.concept_id == sess.case["concept_id"]
    ).order_by(DiagnosticRecord.created_at.desc()).first()

    if latest_diag:
        if data.is_correct:
            latest_diag.confirmation_status = "refuted_slip"
            latest_diag.confidence_level = "Low (Careless slip)"
            latest_diag.followup_response = "Correct (Halves combine to whole)"
            latest_diag.supporting_evidence = result.get("evidence_rationale", "Careless slip detected; basic concept intact.")
        else:
            latest_diag.confirmation_status = "confirmed"
            latest_diag.confidence_level = "High (Confirmed Pattern)"
            latest_diag.followup_response = f"Exhibited error pattern: {sess.suspected_tag}"
            latest_diag.supporting_evidence = result.get("evidence_rationale", "Misconception verified by targeted follow-up.")
            latest_diag.recommended_intervention = sess.case.get("support", {}).get("hint_en", "LCM fraction strip review")

    db.commit()
    result["attempt_id"] = att_id
    return result

@router.post("/reassessment")
def submit_reassessment(
    data: DetectiveReassessmentSubmit,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    user_id = user.id if user else 1
    sess = get_or_create_session(user_id)
    student_name = user.full_name if user else "Learner (Demo)"
    result = sess.submit_reassessment(data.option_index, student_name=student_name)

    reassess_q = sess.case["reassessment"]
    opt = reassess_q["options"][data.option_index]
    is_correct = opt["is_correct"]

    # Idempotent attempt recording
    att_id = data.attempt_id or str(uuid.uuid4())
    existing_att = db.query(Attempt).filter(Attempt.id == att_id).first()
    if not existing_att:
        att = Attempt(
            id=att_id,
            user_id=user_id,
            question_id=reassess_q["id"],
            concept_id=sess.case["concept_id"],
            selected_index=data.option_index,
            is_correct=is_correct,
            hints_used=0,
            time_spent_sec=data.time_spent_sec,
            misconception_tag=opt.get("tag"),
            attempt_source="detective_reassess"
        )
        db.add(att)

    # Mastery & Rule update
    cm = db.query(ConceptMastery).filter(
        ConceptMastery.user_id == user_id,
        ConceptMastery.concept_id == sess.case["concept_id"]
    ).first()
    if not cm:
        cm = ConceptMastery(
            user_id=user_id,
            concept_id=sess.case["concept_id"],
            mastery_score=0.30,
            bkt_p=0.30,
            rule_level=1
        )
        db.add(cm)

    cm.attempts_count = (cm.attempts_count or 0) + 1
    cm.last_attempt_at = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)

    rule_engine = AdaptiveRuleEngine()
    is_rec = result.get("recovered", False)
    rule_eval = rule_engine.evaluate_step(
        current_level=cm.rule_level,
        streak_correct=cm.streak_correct,
        streak_wrong=cm.streak_wrong,
        is_correct=is_rec,
        is_reassessment=True
    )
    cm.bkt_p = bkt_update(cm.bkt_p, is_rec)
    cm.mastery_score = cm.bkt_p
    cm.rule_level = rule_eval["level"]
    cm.streak_correct = rule_eval["streak_correct"]
    cm.streak_wrong = rule_eval["streak_wrong"]
    cm.last_path = rule_eval["path"]
    cm.last_reason = rule_eval["reason"]

    # Update diagnostic record
    latest_diag = db.query(DiagnosticRecord).filter(
        DiagnosticRecord.user_id == user_id,
        DiagnosticRecord.concept_id == sess.case["concept_id"]
    ).order_by(DiagnosticRecord.created_at.desc()).first()

    if latest_diag:
        latest_diag.reassessment_question = reassess_q["stem_en"]
        latest_diag.reassessment_response = opt["text_en"]
        latest_diag.reassessment_result = "recovered" if is_rec else "persistent"

    # If persistent difficulty, persist Teacher Action Card
    if not is_rec and sess.action_card_data:
        card = TeacherActionCard(
            user_id=user_id,
            student_name=student_name,
            concept_id=sess.action_card_data["concept_id"],
            concept_title=sess.action_card_data["concept_title"],
            observation=sess.action_card_data["observation"],
            triggering_rule=sess.action_card_data["triggering_rule"],
            suggested_action=sess.action_card_data["suggested_action"],
            reassessment_status="failed",
            status="pending",
            is_sample=False
        )
        db.add(card)
        db.commit()
        db.refresh(card)
        result["action_card"]["id"] = card.id
    else:
        db.commit()

    result["attempt_id"] = att_id
    return result

@router.get("/records", response_model=List[DiagnosticRecordResponse])
def get_diagnostic_records(
    concept_id: str = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user)
):
    user_id = user.id if user else 1
    q = db.query(DiagnosticRecord).filter(DiagnosticRecord.user_id == user_id)
    if concept_id:
        q = q.filter(DiagnosticRecord.concept_id == concept_id)
    return q.order_by(DiagnosticRecord.created_at.desc()).all()

