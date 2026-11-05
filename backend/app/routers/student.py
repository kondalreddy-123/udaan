"""
Student self-service endpoints.
Returns real data from the database for the authenticated (or demo) student.
"""
import datetime
import hashlib
import hmac
import logging
import re
import secrets
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    User, Attempt, ConceptMastery, Concept, TeacherActionCard, DiagnosticRecord,
    ParentInvitation, ParentStudentLink, RelationshipAuditLog,
    ParentRevocationOtp, ParentContact,
)
from app.schemas import (
    ParentInvitationCreate, ParentInvitationResponse, StudentParentConnectionResponse,
    RevocationRequestResponse, RevocationStatusResponse,
    TeacherSearchResponse, TeacherSearchResult,
)
from app.auth import get_current_user, require_role
from app.engine.bkt import classify_mastery, get_pacing_tier
from app.config import settings
from app.services import parent_links
from app.services import parent_connect_delivery as delivery

logger = logging.getLogger("udaan.student")

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
    user_id = user.id
    student_name = user.full_name
    student_email = user.email

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
    user_id = user.id
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
    user_id = user.id
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


@router.post("/parent-invitation", response_model=ParentInvitationResponse, status_code=status.HTTP_201_CREATED)
def create_parent_invitation(
    req: ParentInvitationCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Method B: Student-assisted parent invitation.
    Generates a cryptographically random, single-use, configurable-expiry invitation code.
    Enforces rate-limiting: maximum active invitations per student and a short cooldown.
    Stores ONLY the SHA-256 hash of the code; displays the plain code only once.
    """
    now = datetime.datetime.utcnow()

    # Exactly one parent relationship may be pending or active at a time, so
    # there is nothing an invitation could be used for while one exists.
    active_link = parent_links.active_link_for_student(db, user.id, now=now)
    if active_link:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )

    # Rate limiting: check active pending invitations
    active_invs = db.query(ParentInvitation).filter(
        ParentInvitation.student_id == user.id,
        ParentInvitation.is_redeemed == False,
        ParentInvitation.is_revoked == False,
        ParentInvitation.expires_at > now
    ).count()

    if active_invs >= settings.PARENT_INVITATION_MAX_ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"You already have {settings.PARENT_INVITATION_MAX_ACTIVE} active parent invitations. Please revoke an existing invitation or wait for it to expire."
        )

    # Cooldown prevents rapid-fire invitation generation.
    last_inv = db.query(ParentInvitation).filter(
        ParentInvitation.student_id == user.id
    ).order_by(ParentInvitation.created_at.desc()).first()
    if last_inv and last_inv.created_at:
        elapsed = (now - last_inv.created_at).total_seconds()
        if elapsed < settings.PARENT_INVITATION_MIN_INTERVAL_SECONDS:
            wait_for = int(settings.PARENT_INVITATION_MIN_INTERVAL_SECONDS - elapsed) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Please wait {wait_for} seconds before creating another invitation."
            )

    # Generate cryptographically secure unguessable 8-char code
    charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"  # Excludes ambiguous characters (0, O, 1, I)
    code_body = "".join(secrets.choice(charset) for _ in range(8))
    raw_code = f"UD-{code_body}"
    code_hash = hashlib.sha256(raw_code.encode()).hexdigest()

    expires_at = now + datetime.timedelta(days=settings.PARENT_INVITATION_EXPIRE_DAYS)

    invitation = ParentInvitation(
        code_hash=code_hash,
        student_id=user.id,
        created_by_id=user.id,
        role_target="parent",
        relationship_type=req.relationship_type or "parent",
        preferred_language=req.preferred_language or "te",
        max_attempts=settings.PARENT_INVITATION_MAX_ATTEMPTS,
        expires_at=expires_at
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)

    return ParentInvitationResponse(
        id=invitation.id,
        invitation_code=raw_code,  # Revealed once at creation
        student_id=user.id,
        student_name=user.full_name,
        relationship_type=invitation.relationship_type,
        preferred_language=invitation.preferred_language,
        expires_at=invitation.expires_at,
        is_redeemed=invitation.is_redeemed,
        is_revoked=invitation.is_revoked,
        is_expired=False,
        attempts_count=invitation.attempts_count,
        max_attempts=invitation.max_attempts,
        created_at=invitation.created_at
    )


@router.get("/parent-invitations", response_model=List[ParentInvitationResponse])
def list_parent_invitations(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Returns list of invitations generated by this student.
    Does not expose raw invitation codes after initial creation.
    """
    invitations = db.query(ParentInvitation).filter(
        ParentInvitation.student_id == user.id
    ).order_by(ParentInvitation.created_at.desc()).all()

    return [
        ParentInvitationResponse(
            id=inv.id,
            invitation_code=None,  # Masked for security
            student_id=user.id,
            student_name=user.full_name,
            relationship_type=inv.relationship_type,
            preferred_language=inv.preferred_language,
            expires_at=inv.expires_at,
            is_redeemed=inv.is_redeemed,
            is_revoked=inv.is_revoked,
            is_expired=inv.expires_at < datetime.datetime.utcnow(),
            attempts_count=inv.attempts_count or 0,
            max_attempts=inv.max_attempts,
            created_at=inv.created_at
        )
        for inv in invitations
    ]


@router.delete("/parent-invitations/{invitation_id}")
def revoke_parent_invitation(
    invitation_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Allows a student to revoke an unused parent invitation.
    """
    inv = db.query(ParentInvitation).filter(
        ParentInvitation.id == invitation_id,
        ParentInvitation.student_id == user.id
    ).first()

    if not inv:
        raise HTTPException(status_code=404, detail="Invitation not found")

    if inv.is_redeemed:
        raise HTTPException(status_code=400, detail="Cannot revoke an already redeemed invitation.")

    inv.is_revoked = True
    db.commit()
    return {"status": "success", "message": "Invitation revoked successfully."}


@router.get("/parent-connections", response_model=List[StudentParentConnectionResponse])
def list_parent_connections(
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Lists all parent connection requests and active links for this student.
    Allows the student to review pending approval requests.
    """
    parent_links.expire_stale_pending_links(db, student_id=user.id)
    db.commit()
    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == user.id
    ).order_by(ParentStudentLink.created_at.desc()).all()

    result = []
    for link in links:
        parent = db.query(User).filter(User.id == link.parent_id).first()
        parent_name = parent.full_name if parent else "Parent"
        parent_email = parent.email if parent else None
        contact = db.query(ParentContact).filter(ParentContact.parent_id == link.parent_id).first()
        email_verified = bool(contact and contact.is_verified)

        if not email_verified:
            display_status = "Email Not Verified"
        elif link.status == "pending":
            display_status = "Pending Student Approval"
        elif link.status == "verified":
            display_status = "Parent Verified"
        elif link.status == "rejected":
            display_status = "Request Rejected"
        elif link.status == "revoked":
            display_status = "Access Revoked"
        else:
            display_status = link.status.title()

        result.append(
            StudentParentConnectionResponse(
                id=link.id,
                parent_id=link.parent_id,
                parent_name=parent_name,
                parent_email=parent_email,
                relationship_type=link.relationship_type or "parent",
                status=link.status,
                email_verified=email_verified,
                school_name=link.school_name,
                teacher_name=link.teacher_name,
                display_status=display_status,
                created_at=link.created_at,
                verified_at=link.verified_at,
            )
        )
    return result


@router.post("/parent-connections/{link_id}/approve", response_model=StudentParentConnectionResponse)
def approve_parent_connection(
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Student approves a pending parent connection request.
    Parent can view student progress only after approval.
    """
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.student_id == user.id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Connection request not found.")

    if link.status == "verified":
        raise HTTPException(status_code=400, detail="This connection is already approved.")
    if link.status != "pending":
        raise HTTPException(status_code=400, detail="Only a pending request can be approved.")

    now = datetime.datetime.utcnow()
    if link.expires_at and link.expires_at < now:
        parent_links.release_link(
            db,
            link,
            status="expired",
            performed_by_id=None,
            action="expired",
            notes="Pending request expired before the student approved it.",
            now=now,
        )
        db.commit()
        raise HTTPException(status_code=400, detail="This request has expired. The parent must send a new request.")

    old_status = link.status
    link.status = "verified"
    link.verified_at = now
    link.expires_at = None
    link.notes = f"Approved by student {user.full_name} on {now.isoformat()}"
    parent_links.add_audit(
        db,
        link,
        performed_by_id=user.id,
        action="approved_by_student",
        previous_status=old_status,
        new_status="verified",
        notes=f"Student {user.full_name} approved parent connection request.",
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )
    db.refresh(link)

    parent = db.query(User).filter(User.id == link.parent_id).first()
    contact = db.query(ParentContact).filter(ParentContact.parent_id == link.parent_id).first()
    email_verified = bool(contact and contact.is_verified)
    return StudentParentConnectionResponse(
        id=link.id,
        parent_id=link.parent_id,
        parent_name=parent.full_name if parent else "Parent",
        parent_email=parent.email if parent else None,
        relationship_type=link.relationship_type or "parent",
        status=link.status,
        email_verified=email_verified,
        school_name=link.school_name,
        teacher_name=link.teacher_name,
        display_status="Parent Verified" if email_verified else "Email Not Verified",
        created_at=link.created_at,
        verified_at=link.verified_at,
    )


@router.post("/parent-connections/{link_id}/reject", response_model=StudentParentConnectionResponse)
def reject_parent_connection(
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Student rejects a pending parent connection request.
    """
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.student_id == user.id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Connection request not found.")

    if link.status != "pending":
        raise HTTPException(status_code=400, detail="Only a pending request can be rejected.")

    parent_links.release_link(
        db,
        link,
        status="rejected",
        performed_by_id=user.id,
        action="rejected_by_student",
        notes=f"Rejected by student {user.full_name}",
    )
    db.commit()
    db.refresh(link)

    parent = db.query(User).filter(User.id == link.parent_id).first()
    contact = db.query(ParentContact).filter(ParentContact.parent_id == link.parent_id).first()
    return StudentParentConnectionResponse(
        id=link.id,
        parent_id=link.parent_id,
        parent_name=parent.full_name if parent else "Parent",
        parent_email=parent.email if parent else None,
        relationship_type=link.relationship_type or "parent",
        status=link.status,
        email_verified=bool(contact and contact.is_verified),
        school_name=link.school_name,
        teacher_name=link.teacher_name,
        display_status="Request Rejected",
        created_at=link.created_at,
        verified_at=link.verified_at,
    )


@router.post("/parent-connections/{link_id}/revoke", response_model=StudentParentConnectionResponse)
def revoke_parent_connection(
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"]))
):
    """
    Student revokes/disconnects an existing parent connection.
    Access to reports and progress is immediately blocked.
    """
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.student_id == user.id
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Connection not found.")

    if link.status not in parent_links.ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail="This connection is no longer active.")

    now = datetime.datetime.utcnow()
    parent_links.release_link(
        db,
        link,
        status="revoked",
        performed_by_id=user.id,
        action="revoked_by_student",
        notes=f"Revoked by student {user.full_name} on {now.isoformat()}",
        now=now,
    )
    db.commit()
    db.refresh(link)

    parent = db.query(User).filter(User.id == link.parent_id).first()
    contact = db.query(ParentContact).filter(ParentContact.parent_id == link.parent_id).first()
    return StudentParentConnectionResponse(
        id=link.id,
        parent_id=link.parent_id,
        parent_name=parent.full_name if parent else "Parent",
        parent_email=parent.email if parent else None,
        relationship_type=link.relationship_type or "parent",
        status=link.status,
        email_verified=bool(contact and contact.is_verified),
        school_name=link.school_name,
        teacher_name=link.teacher_name,
        display_status="Access Revoked",
        created_at=link.created_at,
        verified_at=link.verified_at,
    )



# ---------------------------------------------------------------------------
# OTP-based parent access revocation (Part 3)
# ---------------------------------------------------------------------------

def _hash_revocation_otp(parent_id: int, otp: str) -> str:
    """HMAC-SHA256 so the hash is unique per user and prevents rainbow tables."""
    key = f"{settings.SECRET_KEY}:revocation:{parent_id}".encode()
    return hmac.new(key, otp.encode(), hashlib.sha256).hexdigest()


def _mask_email(email: str) -> str:
    """Mask email for safe display: pa***@example.com"""
    if not email or "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    visible = local[:2] if len(local) > 2 else local[:1]
    return f"{visible}***@{domain}"


def _build_revocation_email_html(otp: str, parent_name: str, student_name: str) -> str:
    return f"""<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;padding:20px;background:#0a0a1a;color:#e2e8f0;">
<div style="max-width:560px;margin:0 auto;background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px;border-radius:16px;border:1px solid rgba(139,92,246,0.4);">

  <div style="text-align:center;margin-bottom:24px;">
    <h1 style="font-size:28px;font-weight:900;background:linear-gradient(135deg,#8b5cf6,#06b6d4);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin:0;">UDAAN</h1>
    <p style="color:#94a3b8;font-size:13px;margin:4px 0 0;">Understanding-Driven Adaptive Academic Navigator</p>
  </div>

  <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px;margin-bottom:24px;">
    <p style="color:#fca5a5;font-weight:700;margin:0;font-size:14px;">⚠️ Parent Access Removal Request</p>
  </div>

  <!-- English -->
  <div style="margin-bottom:28px;">
    <p style="color:#e2e8f0;line-height:1.7;">Dear <strong>{parent_name}</strong>,</p>
    <p style="color:#e2e8f0;line-height:1.7;">Your child <strong>{student_name}</strong> has requested to remove your access to their UDAAN learning account.</p>
    <p style="color:#e2e8f0;line-height:1.7;">To confirm this request, please enter the OTP below in UDAAN:</p>

    <div style="background:rgba(139,92,246,0.15);border:2px solid rgba(139,92,246,0.5);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#a78bfa;">{otp}</span>
    </div>

    <p style="color:#94a3b8;font-size:13px;line-height:1.6;">This OTP is valid for <strong>5 minutes</strong>.<br>
    If you do not approve this request, <strong>do not share the OTP</strong>. Your access will remain active.</p>
    <p style="color:#94a3b8;font-size:13px;">Regards,<br><strong>UDAAN Team</strong></p>
  </div>

  <hr style="border:none;border-top:1px solid rgba(139,92,246,0.2);margin:24px 0;">

  <!-- Telugu -->
  <div>
    <p style="color:#e2e8f0;line-height:1.7;">ప్రియమైన <strong>{parent_name}</strong> గారికి,</p>
    <p style="color:#e2e8f0;line-height:1.7;">మీ బిడ్డ <strong>{student_name}</strong> వారి UDAAN లెర్నింగ్ ఖాతాకు మీకున్న యాక్సెస్‌ను తొలగించాలని అభ్యర్థించారు.</p>
    <p style="color:#e2e8f0;line-height:1.7;">ఈ అభ్యర్థనను నిర్ధారించడానికి, దయచేసి UDAANలో క్రింద ఇచ్చిన OTPను నమోదు చేయండి:</p>

    <div style="background:rgba(139,92,246,0.15);border:2px solid rgba(139,92,246,0.5);border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <span style="font-size:36px;font-weight:900;letter-spacing:8px;color:#a78bfa;">{otp}</span>
    </div>

    <p style="color:#94a3b8;font-size:13px;line-height:1.6;">ఈ OTP <strong>5 నిమిషాల</strong> వరకు మాత్రమే చెల్లుబాటు అవుతుంది.<br>
    మీరు ఈ అభ్యర్థనను ఆమోదించకపోతే, OTPను <strong>ఎవరికీ తెలియజేయవద్దు</strong>. మీ యాక్సెస్ యథావిధిగా కొనసాగుతుంది.</p>
    <p style="color:#94a3b8;font-size:13px;">ధన్యవాదాలు,<br><strong>UDAAN బృందం</strong></p>
  </div>

</div>
</body>
</html>"""


def _build_revocation_email_text(otp: str, parent_name: str, student_name: str) -> str:
    return f"""UDAAN - Parent Access Removal Request

Dear {parent_name},

Your child {student_name} has requested to remove your access to their UDAAN learning account.

To confirm this request, please enter the OTP below in UDAAN:

OTP: {otp}

This OTP is valid for 5 minutes.
If you do not approve this request, do not share the OTP. Your access will remain active.

Regards,
UDAAN Team

---

ప్రియమైన {parent_name} గారికి,

మీ బిడ్డ {student_name} వారి UDAAN లెర్నింగ్ ఖాతాకు మీకున్న యాక్సెస్‌ను తొలగించాలని అభ్యర్థించారు.

OTP: {otp}

ఈ OTP 5 నిమిషాల వరకు మాత్రమే చెల్లుబాటు అవుతుంది.
మీరు ఈ అభ్యర్థనను ఆమోదించకపోతే, OTPను ఎవరికీ తెలియజేయవద్దు.

UDAAN బృందం"""


@router.post(
    "/parent-connections/{link_id}/request-revocation",
    response_model=RevocationRequestResponse,
)
def request_parent_access_revocation(
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"])),
):
    """
    Student initiates OTP-based parent access removal.
    Does NOT immediately revoke access – sends OTP to parent's registered email.
    Parent must confirm by entering the OTP in their own dashboard.
    """
    # Validate the link belongs to this student and is currently active.
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.student_id == user.id,
        ParentStudentLink.status == "verified",
    ).first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active parent connection found with this ID.",
        )

    now = datetime.datetime.utcnow()

    # Prevent duplicate pending revocation requests.
    existing_pending = db.query(ParentRevocationOtp).filter(
        ParentRevocationOtp.link_id == link_id,
        ParentRevocationOtp.status == "pending",
        ParentRevocationOtp.expires_at > now,
    ).first()
    if existing_pending:
        parent_user = db.query(User).filter(User.id == link.parent_id).first()
        parent_email = parent_user.email if parent_user else "parent"
        return RevocationRequestResponse(
            revocation_id=existing_pending.id,
            link_id=link_id,
            parent_email_masked=_mask_email(parent_email),
            otp_sent=True,
            expires_at=existing_pending.expires_at,
            message="A revocation OTP is already pending. Please wait for the parent to confirm or for it to expire.",
        )

    parent_user = db.query(User).filter(User.id == link.parent_id).first()
    if not parent_user:
        raise HTTPException(status_code=404, detail="Parent account not found.")

    # Look up the parent's verified email contact.
    parent_contact = db.query(ParentContact).filter(
        ParentContact.parent_id == link.parent_id,
    ).first()
    parent_email = (
        parent_contact.email
        if parent_contact and parent_contact.email
        else parent_user.email
    )
    if not parent_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Parent does not have a registered email address. Contact your school administrator.",
        )

    # Generate and store the OTP.
    otp = "".join(secrets.choice("0123456789") for _ in range(6))
    otp_hash = _hash_revocation_otp(link.parent_id, otp)
    expires_at = now + datetime.timedelta(minutes=5)

    revocation = ParentRevocationOtp(
        link_id=link_id,
        parent_id=link.parent_id,
        student_id=user.id,
        otp_hash=otp_hash,
        status="pending",
        attempts=0,
        max_attempts=5,
        expires_at=expires_at,
        requested_by_student_id=user.id,
    )
    db.add(revocation)
    db.commit()
    db.refresh(revocation)

    # Send the bilingual email – do NOT log the OTP itself.
    html_body = _build_revocation_email_html(otp, parent_user.full_name, user.full_name)
    text_body = _build_revocation_email_text(otp, parent_user.full_name, user.full_name)
    subject = "UDAAN – Parent Access Removal Request"

    result = delivery.send_email(parent_email, subject, html_body, text_body)
    otp_sent = result is not None and result.status == "sent"

    logger.info(
        "Revocation OTP issued: revocation_id=%s link=%s student=%s email_status=%s",
        revocation.id,
        link_id,
        user.id,
        result.status if result else "not_configured",
    )

    return RevocationRequestResponse(
        revocation_id=revocation.id,
        link_id=link_id,
        parent_email_masked=_mask_email(parent_email),
        otp_sent=otp_sent,
        expires_at=expires_at,
        message=(
            f"A verification code has been sent to the parent's email ({_mask_email(parent_email)}). "
            "The parent must enter the code to confirm the removal."
            if otp_sent
            else "Request created. Email delivery is not configured on this server – the parent must confirm manually."
        ),
    )


@router.get(
    "/parent-connections/{link_id}/revocation-status",
    response_model=RevocationStatusResponse,
)
def get_revocation_status(
    link_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"])),
):
    """Check the current revocation OTP status for a given parent-student link."""
    # Verify this link belongs to the student.
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.student_id == user.id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Connection not found.")

    now = datetime.datetime.utcnow()
    pending = db.query(ParentRevocationOtp).filter(
        ParentRevocationOtp.link_id == link_id,
        ParentRevocationOtp.status == "pending",
    ).order_by(ParentRevocationOtp.created_at.desc()).first()

    if not pending:
        return RevocationStatusResponse(
            link_id=link_id,
            status="none",
        )

    # Auto-expire if window elapsed.
    if pending.expires_at < now and pending.status == "pending":
        pending.status = "expired"
        db.commit()

    return RevocationStatusResponse(
        revocation_id=pending.id,
        link_id=link_id,
        status=pending.status,
        attempts=pending.attempts,
        max_attempts=pending.max_attempts,
        expires_at=pending.expires_at,
        created_at=pending.created_at,
    )


# ---------------------------------------------------------------------------
# Student teacher search (Part 6)
# ---------------------------------------------------------------------------

@router.get("/teachers/search", response_model=TeacherSearchResponse)
def search_teachers(
    q: Optional[str] = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["student"])),
):
    """
    Student can search for teachers assigned to their own class.
    Does NOT expose teachers from other classes.
    Email is only shown for the student's own class teacher.
    """
    student_class = user.class_name or ""

    # Base query: active teachers in this student's class only.
    query = db.query(User).filter(
        User.role == "teacher",
        User.is_active == True,  # noqa: E712
    )

    # Restrict to the student's own class.
    if student_class:
        query = query.filter(User.class_name == student_class)

    if q and q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(
            (User.full_name.ilike(term)) | (User.email.ilike(term))
        )

    teachers = query.all()

    results = [
        TeacherSearchResult(
            id=t.id,
            full_name=t.full_name,
            class_name=t.class_name,
            grade=t.grade,
            # Email visible to students in the same class.
            email=t.email if (t.class_name == student_class) else None,
        )
        for t in teachers
    ]

    return TeacherSearchResponse(results=results, total=len(results))
