from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
import datetime

from app.database import get_db
from app.models import User, TeacherConfig
from app.schemas import (
    TeacherCreateRequest, TeacherResponse, TeacherStatusUpdate, UserResponse
)
from app.auth import require_role, hash_password

router = APIRouter(prefix="/admin", tags=["Administrator Management"])


@router.post("/teachers", response_model=TeacherResponse, status_code=status.HTTP_201_CREATED)
def create_teacher(
    req: TeacherCreateRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(["admin"]))
):
    """
    Administrator endpoint to provision teacher accounts.
    Teachers cannot register publicly; only authorized admins can create them.
    Does NOT return plain password or password hash.
    """
    normalized_email = req.email.strip().lower()

    # Check for duplicate email
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"An account with email '{normalized_email}' already exists"
        )

    hashed = hash_password(req.password)
    teacher = User(
        email=normalized_email,
        hashed_password=hashed,
        full_name=req.full_name.strip(),
        role="teacher",
        class_name=req.class_name or "Class 8 - Section A",
        grade=req.grade or 8,
        is_active=True,
        created_by=admin.email
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)

    # Initialize default teacher config thresholds
    teacher_cfg = TeacherConfig(
        teacher_id=teacher.id,
        up_streak_threshold=2,
        down_streak_threshold=2,
        help_streak_threshold=3,
        misconception_percent_threshold=30,
        bkt_p0=0.30,
        bkt_transition=0.15,
        bkt_slip=0.10,
        bkt_guess=0.25
    )
    db.add(teacher_cfg)
    db.commit()

    return teacher


@router.get("/teachers", response_model=List[TeacherResponse])
def list_teachers(
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(["admin"]))
):
    """
    Lists all teachers with account status, assigned class, and creation audit data.
    """
    teachers = db.query(User).filter(User.role == "teacher").order_by(User.id.desc()).all()
    return teachers


@router.patch("/teachers/{teacher_id}/status", response_model=TeacherResponse)
def update_teacher_status(
    teacher_id: int,
    req: TeacherStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(["admin"]))
):
    """
    Activates or deactivates a teacher's account.
    Deactivated teachers are immediately blocked from logging in.
    """
    teacher = db.query(User).filter(User.id == teacher_id, User.role == "teacher").first()
    if not teacher:
        raise HTTPException(status_code=404, detail=f"Teacher with ID {teacher_id} not found")

    teacher.is_active = req.is_active
    db.commit()
    db.refresh(teacher)
    return teacher


@router.get("/users", response_model=List[UserResponse])
def list_users(
    role: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(["admin"]))
):
    """
    System monitoring endpoint to audit registered users and their assigned roles.
    """
    query = db.query(User)
    if role:
        query = query.filter(User.role == role)
    users = query.offset(skip).limit(limit).all()
    return users
