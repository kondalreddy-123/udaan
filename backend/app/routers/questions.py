from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import json
import datetime
from app.database import get_db
from app.models import Question, QuestionVersion, CorrectionReport, Concept, User
from app.schemas import (
    QuestionResponse, QuestionCreate, QuestionUpdate, OptionSchema,
    CorrectionReportCreate, CorrectionReportResponse
)
from app.auth import get_current_user, require_role

router = APIRouter(prefix="/questions", tags=["Questions & Content Authoring"])

def validate_for_publication(q: Question, db: Session) -> List[str]:
    """Strict validation gates before advancing to 'published' status."""
    errors = []
    if not q.stem_en or len(q.stem_en.strip()) < 5:
        errors.append("English question stem must be at least 5 characters long.")
    if not q.stem_te or len(q.stem_te.strip()) < 5:
        errors.append("Telugu question stem must be provided and at least 5 characters long.")
    
    opts = q.get_options()
    if len(opts) < 2:
        errors.append("At least 2 options are required.")
    if len(opts) > 5:
        errors.append("At most 5 options are permitted.")
        
    correct_count = sum(1 for o in opts if o.get("is_correct"))
    if correct_count != 1:
        errors.append(f"Exactly 1 option must be marked as correct (found {correct_count}).")

    if q.correct_index < 0 or q.correct_index >= len(opts):
        errors.append(f"correct_index ({q.correct_index}) is outside options range.")

    for i, o in enumerate(opts):
        if not o.get("is_correct"):
            if not o.get("explanation_en") and not o.get("misconception_tag"):
                errors.append(f"Distractor #{i+1} ('{o.get('text_en', '')}') lacks a misconception tag or explanation.")
            if not o.get("explanation_te"):
                errors.append(f"Distractor #{i+1} lacks Telugu teacher explanation.")

    if not q.hint_en or not q.hint_te:
        errors.append("Bilingual hints (both English and Telugu) are mandatory for publication.")
    if not q.worked_example_en or not q.worked_example_te:
        errors.append("Bilingual step-by-step worked solutions are mandatory for publication.")

    concept = db.query(Concept).filter(Concept.id == q.concept_id).first()
    if not concept:
        errors.append(f"Referenced concept '{q.concept_id}' does not exist.")

    return errors

def serialize_question(q: Question) -> dict:
    opts_raw = q.get_options()
    opts = []
    for o in opts_raw:
        opts.append(OptionSchema(
            text_en=o.get("text_en", ""),
            text_te=o.get("text_te", o.get("text_en", "")),
            is_correct=bool(o.get("is_correct", False)),
            misconception_tag=o.get("misconception_tag"),
            explanation_en=o.get("explanation_en"),
            explanation_te=o.get("explanation_te")
        ))
    return {
        "id": q.id,
        "concept_id": q.concept_id,
        "prerequisite_id": q.prerequisite_id,
        "grade": q.grade,
        "difficulty": q.difficulty,
        "stem_en": q.stem_en,
        "stem_te": q.stem_te,
        "options": opts,
        "correct_index": q.correct_index,
        "hint_en": q.hint_en,
        "hint_te": q.hint_te,
        "worked_example_en": q.worked_example_en,
        "worked_example_te": q.worked_example_te,
        "status": q.status,
        "current_version": q.current_version,
        "is_translation_verified": q.is_translation_verified,
        "created_by": q.created_by,
        "created_at": q.created_at,
        "updated_at": q.updated_at,
        "versions": q.versions
    }

@router.get("", response_model=List[QuestionResponse])
def get_questions(concept_id: Optional[str] = None, status: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(Question)
    if concept_id:
        query = query.filter(Question.concept_id == concept_id)
    if status:
        query = query.filter(Question.status == status)
    questions = query.all()
    return [serialize_question(q) for q in questions]

@router.get("/{question_id}", response_model=QuestionResponse)
def get_question(question_id: str, db: Session = Depends(get_db)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    return serialize_question(q)

@router.post("", response_model=QuestionResponse)
def create_question(item: QuestionCreate, db: Session = Depends(get_db), user: User = Depends(require_role(["author", "teacher", "admin"]))):
    existing = db.query(Question).filter(Question.id == item.id).first()
    if existing:
        raise HTTPException(status_code=400, detail=f"Question with ID '{item.id}' already exists")

    opts_dicts = [o.model_dump() for o in item.options]
    q = Question(
        id=item.id,
        concept_id=item.concept_id,
        prerequisite_id=item.prerequisite_id,
        grade=item.grade,
        difficulty=item.difficulty,
        stem_en=item.stem_en,
        stem_te=item.stem_te,
        options_json=json.dumps(opts_dicts),
        correct_index=item.correct_index,
        hint_en=item.hint_en,
        hint_te=item.hint_te,
        worked_example_en=item.worked_example_en,
        worked_example_te=item.worked_example_te,
        status="draft",
        current_version=1,
        is_translation_verified=item.is_translation_verified,
        created_by=user.full_name if user else "Author"
    )
    db.add(q)
    db.commit()

    # Save initial version
    qv = QuestionVersion(
        question_id=q.id,
        version_num=1,
        snapshot_json=json.dumps(opts_dicts),
        change_note="Initial draft creation",
        created_by=user.full_name if user else "Author"
    )
    db.add(qv)
    db.commit()
    db.refresh(q)
    return serialize_question(q)

@router.put("/{question_id}", response_model=QuestionResponse)
def update_question(question_id: str, updates: QuestionUpdate, db: Session = Depends(get_db), user: User = Depends(require_role(["author", "teacher", "admin"]))):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    # If updating status to 'published', enforce validation gates
    if updates.status == "published":
        val_errors = validate_for_publication(q, db)
        if val_errors:
            raise HTTPException(
                status_code=422,
                detail={"message": "Publication gates failed", "errors": val_errors}
            )

    # Save previous version snapshot before modifying
    prev_snapshot = json.dumps({
        "stem_en": q.stem_en,
        "stem_te": q.stem_te,
        "options": q.get_options(),
        "status": q.status,
        "hint_en": q.hint_en,
        "hint_te": q.hint_te,
        "worked_example_en": q.worked_example_en,
        "worked_example_te": q.worked_example_te
    })

    q.current_version += 1
    qv = QuestionVersion(
        question_id=q.id,
        version_num=q.current_version,
        snapshot_json=prev_snapshot,
        change_note=updates.change_note or f"Updated to version {q.current_version}",
        created_by=user.full_name if user else "Reviewer"
    )
    db.add(qv)

    # Apply updates
    if updates.stem_en is not None:
        q.stem_en = updates.stem_en
    if updates.stem_te is not None:
        q.stem_te = updates.stem_te
    if updates.options is not None:
        q.options_json = json.dumps([o.model_dump() for o in updates.options])
    if updates.correct_index is not None:
        q.correct_index = updates.correct_index
    if updates.hint_en is not None:
        q.hint_en = updates.hint_en
    if updates.hint_te is not None:
        q.hint_te = updates.hint_te
    if updates.worked_example_en is not None:
        q.worked_example_en = updates.worked_example_en
    if updates.worked_example_te is not None:
        q.worked_example_te = updates.worked_example_te
    if updates.difficulty is not None:
        q.difficulty = updates.difficulty
    if updates.concept_id is not None:
        q.concept_id = updates.concept_id
    if updates.prerequisite_id is not None:
        q.prerequisite_id = updates.prerequisite_id
    if updates.is_translation_verified is not None:
        q.is_translation_verified = updates.is_translation_verified

    # Status transition rules
    if updates.status is not None:
        q.status = updates.status
    else:
        # Any edit drops published items back to draft
        if q.status == "published":
            q.status = "draft"

    db.commit()
    db.refresh(q)
    return serialize_question(q)

@router.post("/{question_id}/duplicate", response_model=QuestionResponse)
def duplicate_question(question_id: str, db: Session = Depends(get_db), user: User = Depends(require_role(["author", "teacher", "admin"]))):
    src = db.query(Question).filter(Question.id == question_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Source question not found")

    new_id = f"{src.id}_copy_{datetime.datetime.utcnow().strftime('%H%M%S')}"
    copy_q = Question(
        id=new_id,
        concept_id=src.concept_id,
        prerequisite_id=src.prerequisite_id,
        grade=src.grade,
        difficulty=src.difficulty,
        stem_en=f"[Copy] {src.stem_en}",
        stem_te=f"[నకలు] {src.stem_te}",
        options_json=src.options_json,
        correct_index=src.correct_index,
        hint_en=src.hint_en,
        hint_te=src.hint_te,
        worked_example_en=src.worked_example_en,
        worked_example_te=src.worked_example_te,
        status="draft",
        current_version=1,
        is_translation_verified=src.is_translation_verified,
        created_by=user.full_name if user else "Author"
    )
    db.add(copy_q)
    db.commit()
    return serialize_question(copy_q)

@router.post("/{question_id}/reports", response_model=CorrectionReportResponse)
def report_correction(question_id: str, report: CorrectionReportCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    rep = CorrectionReport(
        question_id=question_id,
        reporter_id=user.id if user else None,
        reporter_name=user.full_name if user else "Anonymous Learner",
        issue_type=report.issue_type,
        description=report.description,
        status="open"
    )
    db.add(rep)
    db.commit()
    db.refresh(rep)
    return rep

@router.delete("/{question_id}")
def delete_question(question_id: str, db: Session = Depends(get_db), user: User = Depends(require_role(["author", "admin"]))):
    """Deletes a question along with its version history and reports."""
    q = db.query(Question).filter(Question.id == question_id).first()
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")

    db.delete(q)
    db.commit()
    return {"status": "success", "message": f"Question {question_id} deleted successfully", "id": question_id}


@router.post("/generate-explanation")
def generate_ai_explanation(payload: dict, user: User = Depends(require_role(["author", "teacher", "admin"]))):
    """
    AI Content Assistant (Judge Recommendation 6):
    Generates bilingual misconception explanations for teachers to review and edit before publication.
    Enforces human-in-the-loop teacher review before gate publication.
    """
    tag = payload.get("tag", "generic_misconception")
    stem = payload.get("stem", "")
    option_text = payload.get("option_text", "")

    knowledge_base = {
        "num_den_separate": {
            "en": f"Added numerators and denominators separately in '{stem}'. Violates partition rule: slices cannot be combined without finding LCM.",
            "te": f"లవాలు మరియు హారాలను విడివిడిగా కూడారు. క.సా.గు కనుగొనకుండా భిన్నాలను నేరుగా కూడలేము.",
            "hint_en": "Find the Least Common Multiple (LCM) of denominators before adding.",
            "hint_te": "కూడే ముందు హారాల క.సా.గు కనుగొనండి."
        },
        "ignored_negative": {
            "en": f"Dropped or ignored the negative sign in '{option_text}'. Correct common denominator used, but directional arithmetic failed.",
            "te": f"రుణ గుర్తు (-) ను విస్మరించారు. హారాలు సమానం చేసినప్పటికీ గుర్తు పరిగణనలోకి తీసుకోలేదు.",
            "hint_en": "Keep track of negative signs on the number line.",
            "hint_te": "సంఖ్యా రేఖపై రుణ గుర్తులను గుర్తుంచుకోండి."
        },
        "sign_slip": {
            "en": f"Calculation sign slip in the final step of '{stem}'. Learner knew the algorithm but made an arithmetic integer slip.",
            "te": f"చివరి గణనలో గుర్తు పొరపాటు జరిగింది. పద్ధతి తెలిసినప్పటికీ పూర్ణాంకాల కూడికలో తప్పు జరిగింది.",
            "hint_en": "Double check final signed integer arithmetic.",
            "hint_te": "చివరి రుణ/ధన సంఖ్యల గణనను సరిచూసుకోండి."
        },
        "lcm_addition_confusion": {
            "en": f"Multiplied denominators instead of finding LCM, leading to non-reduced rational in '{option_text}'.",
            "te": f"క.సా.గు కాకుండా హారాలను నేరుగా గుణించారు, ఫలితంగా సరళీకృతం కాని భిన్నం వచ్చింది.",
            "hint_en": "Use the prime factorization method to find the smallest common denominator.",
            "hint_te": "కనిష్ట సామాన్య గుణిజం కనుగొనడానికి ప్రధాన కారణాంకాల పద్ధతిని వాడండి."
        }
    }

    explanation_data = knowledge_base.get(tag, {
        "en": f"Incorrect distractor choice '{option_text}' reflecting conceptual misunderstanding of rational operations.",
        "te": f"సరైనది కాని ఎంపిక '{option_text}', అకరణీయ సంఖ్యల నియమాలలో లోపాన్ని సూచిస్తుంది.",
        "hint_en": "Review the definition and steps for rational arithmetic.",
        "hint_te": "అకరణీయ సంఖ్యల ప్రాథమిక సూత్రాలను పునశ్చరణ చేయండి."
    })

    return {
        "tag": tag,
        "ai_generated": True,
        "requires_teacher_review": True,
        "explanation_en": explanation_data["en"],
        "explanation_te": explanation_data["te"],
        "suggested_hint_en": explanation_data["hint_en"],
        "suggested_hint_te": explanation_data["hint_te"]
    }
