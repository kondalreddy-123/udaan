from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.database import get_db
from app.models import Concept, ConceptMastery, User
from app.schemas import ConceptResponse, ConceptMasteryResponse
from app.auth import get_current_user
from app.engine.bkt import classify_mastery

router = APIRouter(prefix="/concepts", tags=["Concepts"])

@router.get("", response_model=List[ConceptResponse])
def get_concepts(grade: int = 8, db: Session = Depends(get_db)):
    concepts = db.query(Concept).filter(Concept.grade == grade).order_by(Concept.sequence_order).all()
    return concepts

@router.get("/mastery", response_model=List[ConceptMasteryResponse])
def get_my_mastery(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user_id = user.id if user else 1
    masteries = db.query(ConceptMastery).filter(ConceptMastery.user_id == user_id).all()
    
    # If no masteries exist for this user, seed from default concepts
    if not masteries:
        concepts = db.query(Concept).order_by(Concept.sequence_order).all()
        masteries = []
        for c in concepts:
            cm = ConceptMastery(
                user_id=user_id,
                concept_id=c.id,
                mastery_score=0.3,
                bkt_p=0.3,
                rule_level=1,
                streak_correct=0,
                streak_wrong=0,
                last_path="Focused practice",
                last_reason="Initial baseline state"
            )
            db.add(cm)
            masteries.append(cm)
        db.commit()

    res = []
    for m in masteries:
        concept = db.query(Concept).filter(Concept.id == m.concept_id).first()
        res.append({
            "concept_id": m.concept_id,
            "concept_title_en": concept.title_en if concept else m.concept_id,
            "concept_title_te": concept.title_te if concept else m.concept_id,
            "mastery_score": m.mastery_score,
            "bkt_p": m.bkt_p,
            "bkt_band": classify_mastery(m.bkt_p),
            "rule_level": m.rule_level,
            "streak_correct": m.streak_correct,
            "streak_wrong": m.streak_wrong,
            "last_path": m.last_path,
            "last_reason": m.last_reason
        })
    return res

@router.get("/{concept_id}", response_model=ConceptResponse)
def get_concept(concept_id: str, db: Session = Depends(get_db)):
    c = db.query(Concept).filter(Concept.id == concept_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Concept not found")
    return c
