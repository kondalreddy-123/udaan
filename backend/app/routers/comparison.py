from fastapi import APIRouter, Depends, Query, Response, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import TeacherConfig
from app.engine.comparison import evaluate_models, export_evaluation_csv
from app.engine.evaluation import run_comprehensive_evaluation
from app.engine.bkt import validate_bkt_params

router = APIRouter(prefix="/comparison", tags=["Model Comparison & Evaluation"])

@router.get("/diagnostic-evaluation")
def get_diagnostic_evaluation():
    """
    Executes the reproducible scientific evaluation over the controlled
    NCERT Class 8 rational number misconception benchmark dataset.
    """
    return run_comprehensive_evaluation()

@router.get("/evaluate")
def get_evaluation(
    p0: float = Query(0.30, description="Prior knowledge P(L0)"),
    transition: float = Query(0.15, description="Learning rate P(T)"),
    slip: float = Query(0.10, description="Slip probability P(S)"),
    guess: float = Query(0.25, description="Guess probability P(G)"),
    up_threshold: int = Query(2, description="Rule streak to advance"),
    bkt_threshold: float = Query(0.85, description="BKT posterior mastery threshold"),
    use_saved_config: bool = Query(False, description="Use current teacher configuration values"),
    db: Session = Depends(get_db)
):
    if use_saved_config:
        cfg = db.query(TeacherConfig).first()
        if cfg:
            p0 = cfg.bkt_p0
            transition = cfg.bkt_transition
            slip = cfg.bkt_slip
            guess = cfg.bkt_guess
            up_threshold = cfg.up_streak_threshold

    valid, err_msg = validate_bkt_params(p0, transition, slip, guess)
    if not valid:
        raise HTTPException(status_code=400, detail=err_msg)

    return evaluate_models(
        p0=p0,
        transition=transition,
        slip=slip,
        guess=guess,
        up_threshold=up_threshold,
        bkt_mastery_threshold=bkt_threshold
    )

@router.get("/export")
def export_csv(
    p0: float = Query(0.30),
    transition: float = Query(0.15),
    slip: float = Query(0.10),
    guess: float = Query(0.25),
    up_threshold: int = Query(2),
    bkt_threshold: float = Query(0.85)
):
    data = evaluate_models(p0, transition, slip, guess, up_threshold, bkt_threshold)
    csv_content = export_evaluation_csv(data)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=udaan_rule_vs_bkt_evaluation.csv"}
    )
