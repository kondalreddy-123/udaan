from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from app.engine.ai_service import generate_pedagogic_explanation
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/ai", tags=["AI Pedagogical Assistant"])

class AIExplanationRequest(BaseModel):
    stem: str
    student_answer: str
    misconception_tag: str
    topic: Optional[str] = "Rational Numbers"
    lang: Optional[str] = "en"

@router.post("/explain")
def get_ai_explanation(
    req: AIExplanationRequest,
    user: User = Depends(get_current_user)
):
    """
    Returns AI-generated or deterministic rule-based pedagogic explanation
    with guaranteed fallback, timeout handling, and bilingual support.
    """
    result = generate_pedagogic_explanation(
        stem=req.stem,
        student_answer=req.student_answer,
        misconception_tag=req.misconception_tag,
        topic=req.topic,
        lang=req.lang
    )
    return result
