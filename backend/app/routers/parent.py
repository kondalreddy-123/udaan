import hashlib
import hmac
import re
import datetime
import logging
import time
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from typing import List, Optional

from app.config import settings
from app.database import get_db
from app.models import (
    User, ParentProfile, ParentStudentLink, ParentInvitation, RelationshipAuditLog,
    ParentNotification, ParentTeacherMessage, MessageReply, Concept,
)
from app.schemas import (
    ValidateInvitationRequest, ValidateInvitationResponse,
    ParentOnboardingRequest, ParentMeResponse, ParentProfileUpdate,
    ParentStudentLinkResponse, ParentLinkedChildSummary, Token,
    ParentNotificationResponse, NotificationPreferencesResponse,
    ParentMessageCreate, MessageReplyCreate, ParentMessageResponse,
    MessageReplyResponse, ConnectStudentRequest, ParentChildTeacherResponse,
    RevocationOtpVerifyRequest,
)
from app.auth import require_role, hash_password, create_access_token
from app.services import parent_alerts, parent_links, teacher_alerts
from app.services.parent_messaging import message_response as _message_response

logger = logging.getLogger("udaan.parent")

router = APIRouter(prefix="/parent", tags=["Parent Onboarding & Profiles"])

# ---------------------------------------------------------------------------
# Lightweight in-process rate limiting for PUBLIC invitation endpoints.
# UDAAN runs as a single uvicorn process for this phase; this is intentionally
# simple and has no external dependency. It never stores raw invitation codes.
# ---------------------------------------------------------------------------
_RATE_LIMIT_STORE: dict[str, list[float]] = {}


def reset_parent_rate_limits() -> None:
    """Test helper: clear the in-process rate limiter."""
    _RATE_LIMIT_STORE.clear()


def _enforce_public_rate_limit(request: Optional[Request], bucket: str) -> None:
    if request is None:
        return
    host = request.client.host if request.client else "unknown"
    key = f"{bucket}:{host}"
    now = time.monotonic()
    window = max(1, settings.PARENT_INVITE_RATE_WINDOW_SECONDS)
    max_requests = max(1, settings.PARENT_INVITE_RATE_MAX_REQUESTS)

    recent = [t for t in _RATE_LIMIT_STORE.get(key, []) if now - t < window]
    if len(recent) >= max_requests:
        retry_after = int(window - (now - recent[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Too many attempts. Please wait {retry_after} seconds and try again, or ask a teacher for help.",
            headers={"Retry-After": str(retry_after)},
        )
    recent.append(now)
    _RATE_LIMIT_STORE[key] = recent


def _hash_invitation_code(raw_code: str) -> str:
    return hashlib.sha256(raw_code.strip().upper().encode()).hexdigest()


def _find_invitation(db: Session, raw_code: str) -> Optional[ParentInvitation]:
    return db.query(ParentInvitation).filter(
        ParentInvitation.code_hash == _hash_invitation_code(raw_code)
    ).first()


def _assert_invitation_usable(inv: ParentInvitation, now: datetime.datetime) -> None:
    if inv.is_revoked:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation has been cancelled or revoked."
        )
    if inv.is_redeemed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation code has already been redeemed."
        )
    if inv.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This invitation code has expired. Please request a fresh invitation code."
        )
    if inv.attempts_count >= inv.max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Maximum verification attempts exceeded for this code. Please request a new invitation."
        )


def _profile_values(parent: User, db: Session):
    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    return {
        "phone_number": profile.phone_number if profile else None,
        "preferred_language": profile.preferred_language if profile else "te",
        "contact_method": profile.contact_method if profile else "in_app",
        "is_verified": profile.is_verified if profile else False,
        "notification_preference": (profile.notification_preference if profile else "not_configured") or "not_configured",
        "notifications_consent": bool(profile.notifications_consent) if profile else True,
        "notify_in_app": bool(profile.notify_in_app) if profile else True,
        "notify_email": bool(profile.notify_email) if profile else False,
        "notify_voice": bool(profile.notify_voice) if profile else False,
    }


def _assert_verified_child(db: Session, parent: User, student_id: int) -> ParentStudentLink:
    """Relationship-based authorization for every parent data endpoint."""
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.student_id == student_id,
        ParentStudentLink.status == "verified",
    ).first()
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have verified parental access to this student's records.",
        )
    return link


def _assigned_teacher_for(db: Session, student: User) -> User:
    """Return the active teacher assigned to this student's class.

    UDAAN currently assigns teachers by class name (the same rule used for
    relationship verification). Communication is never routed to a teacher who
    does not teach the child's class.
    """
    teacher = db.query(User).filter(
        User.role == "teacher",
        User.is_active == True,  # noqa: E712 - SQLAlchemy boolean expression
        User.class_name == student.class_name,
    ).order_by(User.id.asc()).first()
    if not teacher:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="No teacher is assigned to this class yet. Please ask the school office for help.",
        )
    return teacher


def _notification_response(record: ParentNotification) -> ParentNotificationResponse:
    return ParentNotificationResponse(
        id=record.id,
        category=record.category,
        trigger_type=record.trigger_type,
        severity=record.severity,
        title=record.title,
        body=record.body,
        language=record.language,
        is_read=bool(record.is_read),
        read_at=record.read_at,
        student_id=record.student_id,
        student_name=record.student.full_name if record.student else "Student",
        concept_id=record.concept_id,
        message_id=record.message_id,
        email_status=record.email_status,
        created_at=record.created_at,
    )


def _link_summary(link: ParentStudentLink, student: User) -> ParentLinkedChildSummary:
    return ParentLinkedChildSummary(
        link_id=link.id,
        student_id=student.id,
        student_name=student.full_name,
        class_name=student.class_name or "Class 8",
        grade=student.grade or 8,
        relationship_type=link.relationship_type,
        verification_status=link.status,
        verification_method=link.verification_method,
        verified_at=link.verified_at,
    )


@router.post("/invitations/validate", response_model=ValidateInvitationResponse)
def validate_invitation(
    req: ValidateInvitationRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Validates a student-generated parent invitation code.
    Protects privacy: returns ONLY student's first name, class, and expiration.
    Does NOT leak full student learning records or sensitive profiles.
    """
    _enforce_public_rate_limit(request, "parent-invitation-validate")

    inv = _find_invitation(db, req.code)
    if not inv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invitation code. Please check the code or ask your child/teacher for assistance."
        )

    now = datetime.datetime.utcnow()
    _assert_invitation_usable(inv, now)

    # Attempt accounting: every validation consumes one of the limited attempts.
    inv.attempts_count = (inv.attempts_count or 0) + 1
    db.commit()

    student = db.query(User).filter(User.id == inv.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Associated student account not found")

    student_first_name = student.full_name.split()[0] if student.full_name else "Student"

    return ValidateInvitationResponse(
        valid=True,
        student_first_name=student_first_name,
        class_name=student.class_name or "Class 8",
        preferred_language=inv.preferred_language or "te",
        expires_at=inv.expires_at
    )


@router.post("/invitations/redeem", response_model=Token, status_code=status.HTTP_201_CREATED)
@router.post("/onboarding/complete", response_model=Token, status_code=status.HTTP_201_CREATED)
@router.post("/onboarding/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register_with_invitation(
    req: ParentOnboardingRequest,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Method B / Voice-Guided Onboarding:
    Registers a parent account using a single-use verified invitation code.
    Establishes a PENDING ParentStudentLink requiring teacher approval.
    The backend ALWAYS forces role='parent'; no role can be supplied by callers.
    """
    _enforce_public_rate_limit(request, "parent-invitation-redeem")

    inv = _find_invitation(db, req.invitation_code)
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid invitation code.")

    now = datetime.datetime.utcnow()
    _assert_invitation_usable(inv, now)

    normalized_email = req.email.strip().lower()
    if "@" not in normalized_email or len(normalized_email) > 255:
        raise HTTPException(status_code=400, detail="Please enter a valid email address, or ask a teacher for assisted setup.")

    # Count this redemption attempt before creating anything.
    inv.attempts_count = (inv.attempts_count or 0) + 1
    if inv.attempts_count > inv.max_attempts:
        db.commit()
        raise HTTPException(status_code=429, detail="Maximum attempts exceeded for this code.")

    # A teacher-issued account-setup code targets an existing parent account:
    # the teacher already verified the relationship in person, and the parent
    # is only choosing their own sign-in credentials here.
    is_credential_setup = inv.target_parent_id is not None

    # Check if parent user already exists
    parent = db.query(User).filter(User.email == normalized_email).first()

    # Enforce one pending-or-verified parent per student before creating any
    # account or link. A different parent (or a brand-new parent account) can
    # never claim a student who is already reserved.
    prospective_parent_id = (
        inv.target_parent_id if is_credential_setup else (parent.id if parent else None)
    )
    existing_active = parent_links.active_link_for_student(db, inv.student_id)
    if existing_active and existing_active.parent_id != prospective_parent_id:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )

    if is_credential_setup:
        target = db.query(User).filter(User.id == inv.target_parent_id).first()
        if not target or target.role != "parent" or not target.is_active:
            raise HTTPException(
                status_code=400,
                detail="This setup code is no longer valid. Please ask a teacher to issue a new one."
            )
        if parent and parent.id != target.id:
            raise HTTPException(
                status_code=400,
                detail="This email is already used by another account. Please choose a different email or ask a teacher for help."
            )
        target.email = normalized_email
        target.full_name = req.parent_name.strip()
        target.hashed_password = hash_password(req.password)
        parent = target
    elif parent:
        if parent.role not in ("parent", "guest"):
            db.commit()
            raise HTTPException(
                status_code=400,
                detail=f"An account with this email already exists with role '{parent.role}'."
            )
        if parent.role == "guest":
            parent.role = "parent"
            parent.hashed_password = hash_password(req.password)
            parent.full_name = req.parent_name.strip()
    else:
        # Create new parent account. Role is server-enforced.
        hashed_pwd = hash_password(req.password)
        parent = User(
            email=normalized_email,
            hashed_password=hashed_pwd,
            full_name=req.parent_name.strip(),
            role="parent",
            class_name="Parents Cohort",
            grade=8,
            is_active=True,
            created_by="invitation_onboarding"
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)

    # Create or update ParentProfile. Normal invitation registration is still
    # unverified until a teacher approves the relationship. A teacher-assisted
    # setup code keeps the in-person contact verification the teacher recorded.
    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    if not profile:
        profile = ParentProfile(
            user_id=parent.id,
            phone_number=req.phone_number.strip() if req.phone_number else None,
            preferred_language=req.preferred_language or "te",
            contact_method=req.contact_method or "in_app",
            is_verified=is_credential_setup,
            notification_preference="not_configured",
        )
        db.add(profile)
    else:
        if req.phone_number:
            profile.phone_number = req.phone_number.strip()
        profile.preferred_language = req.preferred_language or profile.preferred_language
        if req.contact_method:
            profile.contact_method = req.contact_method
        if not is_credential_setup:
            profile.is_verified = False

    # Create or update ParentStudentLink
    link = parent_links.link_for_pair(db, parent.id, inv.student_id)
    previous_link_status = link.status if link else None

    if link:
        if link.status in ("verified", "pending") and not is_credential_setup:
            db.rollback()
            raise HTTPException(status_code=400, detail="A link between this parent and student already exists.")
        if is_credential_setup:
            # Keep the teacher's in-person verification intact.
            link.relationship_type = req.relationship_type or link.relationship_type
            link.expires_at = None
            link.notes = "Teacher-assisted account setup completed by the parent"
        else:
            parent_links.reserve_as_pending(
                db,
                link,
                relationship_type=req.relationship_type or "parent",
                verification_method="invitation_code",
                notes="Re-registered via invitation code",
                now=now,
            )
    else:
        link = ParentStudentLink(
            parent_id=parent.id,
            student_id=inv.student_id,
            relationship_type=req.relationship_type or inv.relationship_type or "parent",
            status="pending",  # Pending school verification
            verification_method="invitation_code",
            expires_at=parent_links.pending_expiry(now),
            notes="Registered via student-assisted invitation"
        )
        db.add(link)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )
    db.refresh(link)

    # Record relationship audit log
    audit = RelationshipAuditLog(
        link_id=link.id,
        performed_by_id=parent.id,
        action="credentials_setup" if is_credential_setup else "created",
        previous_status=previous_link_status,
        new_status=link.status,
        notes=(
            "Parent chose their own sign-in credentials using a teacher-issued setup code."
            if is_credential_setup
            else f"Parent registered via single-use invitation. Relationship: {req.relationship_type}"
        )
    )
    db.add(audit)

    # Invalidate / mark invitation as redeemed (single use)
    inv.is_redeemed = True
    inv.redeemed_by_parent_id = parent.id
    inv.redeemed_at = now
    db.commit()

    token = create_access_token(data={"sub": parent.email, "role": parent.role, "id": parent.id})
    return {"access_token": token, "token_type": "bearer", "user": parent}


@router.get("/me", response_model=ParentMeResponse)
def get_parent_me(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """
    Returns the authenticated parent's profile, contact settings, and linked children.
    Linked children include pending/rejected/revoked links for status transparency,
    but NO learning records are included here.
    """
    values = _profile_values(parent, db)

    links = db.query(ParentStudentLink).filter(ParentStudentLink.parent_id == parent.id).all()
    children_summaries = []
    for l in links:
        student = db.query(User).filter(User.id == l.student_id, User.role == "student").first()
        if student:
            children_summaries.append(_link_summary(l, student))

    return ParentMeResponse(
        id=parent.id,
        full_name=parent.full_name,
        email=parent.email,
        role=parent.role,
        phone_number=values["phone_number"],
        preferred_language=values["preferred_language"],
        contact_method=values["contact_method"],
        is_verified=values["is_verified"],
        notification_preference=values["notification_preference"],
        notifications_consent=values["notifications_consent"],
        notify_in_app=values["notify_in_app"],
        notify_email=values["notify_email"],
        notify_voice=values["notify_voice"],
        email_notifications_available=parent_alerts.email_is_configured(),
        linked_children=children_summaries
    )


@router.get("/profile", response_model=ParentMeResponse)
def get_parent_profile(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """Alias for /parent/me used by the profile management panel."""
    return get_parent_me(db=db, parent=parent)


@router.get("/links", response_model=List[ParentLinkedChildSummary])
def list_parent_links(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """Returns this parent's link statuses. No student learning records are exposed."""
    links = db.query(ParentStudentLink).filter(ParentStudentLink.parent_id == parent.id).all()
    result = []
    for l in links:
        student = db.query(User).filter(User.id == l.student_id, User.role == "student").first()
        if student:
            result.append(_link_summary(l, student))
    return result


@router.put("/profile", response_model=ParentMeResponse)
def update_parent_profile(
    req: ParentProfileUpdate,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    """
    Updates non-privileged parent profile preferences (language, phone, contact method).
    Does NOT allow parents to modify their own verification status or student links.
    Unknown/privileged fields are ignored by the request schema.
    """
    if req.full_name and len(req.full_name.strip()) >= 2:
        parent.full_name = req.full_name.strip()

    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    if not profile:
        profile = ParentProfile(
            user_id=parent.id,
            preferred_language=req.preferred_language or "te",
            phone_number=req.phone_number,
            contact_method=req.contact_method or "in_app",
            notification_preference=req.notification_preference or "not_configured",
            notifications_consent=True if req.notifications_consent is None else req.notifications_consent,
            notify_in_app=True if req.notify_in_app is None else req.notify_in_app,
            notify_email=False if req.notify_email is None else req.notify_email,
            notify_voice=False if req.notify_voice is None else req.notify_voice,
        )
        db.add(profile)
    else:
        if req.preferred_language:
            profile.preferred_language = req.preferred_language
        if req.phone_number is not None:
            profile.phone_number = req.phone_number.strip() if req.phone_number else None
        if req.contact_method:
            profile.contact_method = req.contact_method
        if req.notification_preference:
            profile.notification_preference = req.notification_preference[:30]
        if req.notifications_consent is not None:
            profile.notifications_consent = req.notifications_consent
        if req.notify_in_app is not None:
            profile.notify_in_app = req.notify_in_app
        if req.notify_email is not None:
            profile.notify_email = req.notify_email
        if req.notify_voice is not None:
            profile.notify_voice = req.notify_voice

    db.commit()
    return get_parent_me(db=db, parent=parent)


@router.get("/children/{student_id}")
def get_parent_child_overview(
    student_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """
    Strict relationship-based access control:
    Parents can ONLY view data for students where a VERIFIED link exists.
    Rejects pending, rejected, revoked, or non-existent parent-student links with HTTP 403.
    """
    if parent.role != "admin":
        link = db.query(ParentStudentLink).filter(
            ParentStudentLink.parent_id == parent.id,
            ParentStudentLink.student_id == student_id,
            ParentStudentLink.status == "verified"
        ).first()

        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have verified parental access to this student's records."
            )

    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return {
        "student_id": student.id,
        "full_name": student.full_name,
        "class_name": student.class_name,
        "grade": student.grade,
        "verified_access": True
    }


@router.get("/children/{student_id}/teacher", response_model=ParentChildTeacherResponse)
def get_child_assigned_teacher(
    student_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"])),
):
    """Show the verified parent which teacher is assigned to their child.

    The response is limited to school-facing teacher details; no other parent
    or student data is exposed.
    """
    link = parent_links.active_link_for_student(db, student_id)
    if not link or link.parent_id != parent.id or link.status != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: You do not have verified parental access to this student.",
        )

    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    teacher = _assigned_teacher_for(db, student)
    return ParentChildTeacherResponse(
        student_id=student.id,
        student_name=student.full_name,
        class_name=student.class_name or "",
        teacher_id=teacher.id if teacher else None,
        teacher_name=teacher.full_name if teacher else None,
        teacher_email=teacher.email if teacher else None,
    )


@router.post("/connect-student")
def connect_student(
    req: ConnectStudentRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """
    Connect a student to this parent using the student's connection code.
    Creates a ParentStudentLink with status='pending' requiring student approval.
    """
    code_raw = req.invitation_code.strip()
    code_hash = hashlib.sha256(code_raw.encode()).hexdigest()
    now = datetime.datetime.utcnow()

    inv = db.query(ParentInvitation).filter(ParentInvitation.code_hash == code_hash).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invalid connection code.")

    if inv.is_revoked:
        raise HTTPException(status_code=400, detail="This connection code has been cancelled.")
    if inv.is_redeemed:
        raise HTTPException(status_code=400, detail="This connection code has already been used.")
    if inv.expires_at < now:
        raise HTTPException(status_code=400, detail="This connection code has expired.")
    if (inv.attempts_count or 0) >= (inv.max_attempts or 5):
        raise HTTPException(status_code=429, detail="Maximum attempts exceeded for this code.")

    student = db.query(User).filter(User.id == inv.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    check = parent_links.check_connection(db, parent.id, student.id, now=now)
    link = check.same_parent_link

    # Another parent already reserves this student (pending OR connected).
    if check.active_link and (not link or check.active_link.id != link.id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )

    if link and link.status == "verified":
        inv.is_redeemed = True
        inv.redeemed_by_parent_id = parent.id
        inv.redeemed_at = now
        db.commit()
        return {
            "status": "already_connected",
            "link_id": link.id,
            "student_id": student.id,
            "student_name": student.full_name,
            "message": f"You are already connected to {student.full_name}.",
        }

    if link and link.status == "pending":
        inv.is_redeemed = True
        inv.redeemed_by_parent_id = parent.id
        inv.redeemed_at = now
        db.commit()
        return {
            "status": "pending_approval",
            "link_id": link.id,
            "student_id": student.id,
            "student_name": student.full_name,
            "message": f"Connection request is already pending approval from {student.full_name}."
        }

    previous_status = link.status if link else None
    if link:
        if req.school_name:
            link.school_name = req.school_name.strip()
        if req.teacher_name or req.teacher_details:
            link.teacher_name = (req.teacher_name or req.teacher_details).strip()
        parent_links.reserve_as_pending(
            db,
            link,
            relationship_type=req.relationship_type or link.relationship_type or "parent",
            verification_method="connection_code",
            notes="Re-requested connection via code",
            now=now,
        )
    else:
        link = ParentStudentLink(
            parent_id=parent.id,
            student_id=student.id,
            relationship_type=req.relationship_type or inv.relationship_type or "parent",
            status="pending",
            school_name=req.school_name.strip() if req.school_name else None,
            teacher_name=(req.teacher_name or req.teacher_details or "").strip() or None,
            verification_method="connection_code",
            expires_at=parent_links.pending_expiry(now),
            notes="Connected via student connection code, awaiting student approval"
        )
        db.add(link)

    inv.is_redeemed = True
    inv.redeemed_by_parent_id = parent.id
    inv.redeemed_at = now
    try:
        db.flush()
        parent_links.add_audit(
            db,
            link,
            performed_by_id=parent.id,
            action="connect_requested",
            previous_status=previous_status,
            new_status="pending",
            notes=f"Parent {parent.full_name} requested connection to {student.full_name} via code.",
        )
        db.commit()
    except IntegrityError:
        db.rollback()
        # A concurrent request won the race. Report the same safe outcome
        # without revealing which parent holds the student.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=parent_links.GENERIC_ALREADY_CONNECTED,
        )
    db.refresh(link)

    return {
        "status": "pending_approval",
        "link_id": link.id,
        "student_id": student.id,
        "student_name": student.full_name,
        "message": f"Connection request sent! Waiting for {student.full_name} to approve."
    }


@router.post("/children/{student_id}/disconnect")
def disconnect_student(
    student_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"]))
):
    """
    Disconnects a child from the parent's account.
    """
    link = parent_links.link_for_pair(db, parent.id, student_id)
    if not link:
        raise HTTPException(status_code=404, detail="Child connection not found.")

    if link.status not in parent_links.ACTIVE_STATUSES:
        raise HTTPException(status_code=400, detail="This connection is no longer active.")

    now = datetime.datetime.utcnow()
    parent_links.release_link(
        db,
        link,
        status="revoked",
        performed_by_id=parent.id,
        action="disconnected_by_parent",
        notes=f"Disconnected by parent {parent.full_name} on {now.isoformat()}",
        now=now,
    )
    db.commit()
    return {"status": "success", "message": "Child connection disconnected."}


# ---------------------------------------------------------------------------
# Phase 4: Parent notifications
# ---------------------------------------------------------------------------
@router.get("/notifications", response_model=List[ParentNotificationResponse])
def list_parent_notifications(
    unread_only: bool = False,
    limit: int = 50,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    """
    Returns this parent's notification history.

    Evidence is re-evaluated for each verified child on read. The evaluation is
    idempotent (dedup + cooldown), so this never creates duplicate alerts.
    """
    verified_links = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
        ParentStudentLink.status == "verified",
    ).all()

    for link in verified_links:
        student = db.query(User).filter(User.id == link.student_id, User.role == "student").first()
        if not student:
            continue
        try:
            parent_alerts.evaluate_student_alerts(db, student)
            db.commit()
        except Exception:  # pragma: no cover - defensive isolation
            db.rollback()
            logger.exception("Parent alert evaluation failed for student %s", student.id)

    query = db.query(ParentNotification).filter(ParentNotification.parent_id == parent.id)
    if unread_only:
        query = query.filter(ParentNotification.is_read == False)  # noqa: E712
    records = query.order_by(ParentNotification.created_at.desc()).limit(max(1, min(limit, 100))).all()
    return [_notification_response(r) for r in records]


@router.post("/notifications/read-all")
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    now = datetime.datetime.utcnow()
    updated = db.query(ParentNotification).filter(
        ParentNotification.parent_id == parent.id,
        ParentNotification.is_read == False,  # noqa: E712
    ).update({"is_read": True, "read_at": now}, synchronize_session=False)
    db.commit()
    return {"status": "success", "updated": updated}


@router.post("/notifications/{notification_id}/read", response_model=ParentNotificationResponse)
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    record = db.query(ParentNotification).filter(
        ParentNotification.id == notification_id,
        ParentNotification.parent_id == parent.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not record.is_read:
        record.is_read = True
        record.read_at = datetime.datetime.utcnow()
        db.commit()
        db.refresh(record)
    return _notification_response(record)


@router.get("/notification-preferences", response_model=NotificationPreferencesResponse)
def get_notification_preferences(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    values = _profile_values(parent, db)
    return NotificationPreferencesResponse(
        notifications_consent=values["notifications_consent"],
        notify_in_app=values["notify_in_app"],
        notify_email=values["notify_email"],
        notify_voice=values["notify_voice"],
        email_notifications_available=parent_alerts.email_is_configured(),
        preferred_language=values["preferred_language"],
    )


@router.put("/notification-preferences", response_model=NotificationPreferencesResponse)
def update_notification_preferences(
    req: ParentProfileUpdate,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    """
    Consent management. Email delivery is only attempted when the operator has
    configured a provider; the response reports whether that is available.
    """
    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent.id).first()
    if not profile:
        profile = ParentProfile(user_id=parent.id)
        db.add(profile)

    if req.notifications_consent is not None:
        profile.notifications_consent = req.notifications_consent
        if not req.notifications_consent:
            # Revoking consent disables every channel immediately.
            profile.notify_in_app = False
            profile.notify_email = False
            profile.notify_voice = False
    if req.notify_in_app is not None:
        profile.notify_in_app = req.notify_in_app
    if req.notify_email is not None:
        profile.notify_email = req.notify_email
    if req.notify_voice is not None:
        profile.notify_voice = req.notify_voice
    db.commit()

    values = _profile_values(parent, db)
    return NotificationPreferencesResponse(
        notifications_consent=values["notifications_consent"],
        notify_in_app=values["notify_in_app"],
        notify_email=values["notify_email"],
        notify_voice=values["notify_voice"],
        email_notifications_available=parent_alerts.email_is_configured(),
        preferred_language=values["preferred_language"],
    )


# ---------------------------------------------------------------------------
# Phase 4: Parent -> teacher messaging
# ---------------------------------------------------------------------------
@router.get("/messages", response_model=List[ParentMessageResponse])
def list_parent_messages(
    limit: int = 50,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    messages = db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.parent_id == parent.id
    ).order_by(ParentTeacherMessage.last_activity_at.desc()).limit(max(1, min(limit, 100))).all()
    return [_message_response(m, "parent") for m in messages]


@router.post("/messages", response_model=ParentMessageResponse, status_code=status.HTTP_201_CREATED)
def create_parent_message(
    req: ParentMessageCreate,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    """
    Sends a message only to the teacher assigned to a VERIFIED child's class.
    """
    _assert_verified_child(db, parent, req.student_id)

    student = db.query(User).filter(User.id == req.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    teacher = _assigned_teacher_for(db, student)

    since = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    recent_count = db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.parent_id == parent.id,
        ParentTeacherMessage.created_at >= since,
    ).count()
    if recent_count >= max(1, settings.PARENT_MESSAGES_MAX_PER_DAY):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="You have sent several messages today. Please wait before sending another, or ask the teacher in person.",
        )

    now = datetime.datetime.utcnow()
    message = ParentTeacherMessage(
        parent_id=parent.id,
        teacher_id=teacher.id,
        student_id=student.id,
        category=req.category,
        subject=req.subject.strip(),
        body=req.body.strip(),
        status="open",
        parent_read_at=now,
        last_activity_at=now,
        created_at=now,
    )
    db.add(message)
    db.flush()
    teacher_alerts.notify_teacher_of_parent_message(db, message, now=now)
    db.commit()
    db.refresh(message)
    return _message_response(message, "parent")


@router.get("/messages/{message_id}", response_model=ParentMessageResponse)
def get_parent_message(
    message_id: int,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    message = db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.id == message_id,
        ParentTeacherMessage.parent_id == parent.id,
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    message.parent_read_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(message)
    return _message_response(message, "parent")


@router.post("/messages/{message_id}/reply", response_model=ParentMessageResponse)
def reply_to_teacher(
    message_id: int,
    req: MessageReplyCreate,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"]))
):
    message = db.query(ParentTeacherMessage).filter(
        ParentTeacherMessage.id == message_id,
        ParentTeacherMessage.parent_id == parent.id,
    ).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")

    # A revoked relationship must immediately stop new communication.
    _assert_verified_child(db, parent, message.student_id)

    now = datetime.datetime.utcnow()
    reply = MessageReply(
        message_id=message.id,
        author_id=parent.id,
        author_role="parent",
        body=req.body.strip(),
        meeting_requested=bool(req.meeting_requested),
        created_at=now,
    )
    db.add(reply)
    db.flush()
    message.status = "open"
    message.resolved_at = None
    message.parent_read_at = now
    # A parent follow-up is a new unread item for the teacher.
    message.teacher_read_at = None
    message.last_activity_at = now
    teacher_alerts.notify_teacher_of_parent_reply(
        db, message, reply_id=reply.id, now=now
    )
    db.commit()
    db.refresh(message)
    return _message_response(message, "parent")


# ---------------------------------------------------------------------------
# OTP-based parent access revocation – parent confirms (Part 3)
# ---------------------------------------------------------------------------

from app.models import ParentRevocationOtp, ParentContact  # noqa: E402


def _hash_revocation_otp_parent(parent_id: int, otp: str) -> str:
    key = f"{settings.SECRET_KEY}:revocation:{parent_id}".encode()
    return hmac.new(key, otp.encode(), hashlib.sha256).hexdigest()


@router.post("/revoke-confirm")
def parent_confirm_revocation(
    req: RevocationOtpVerifyRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"])),
):
    """
    Parent confirms the access removal OTP sent to their email.
    Only after this confirmation is the parent-student link actually revoked.
    """
    link_id = req.link_id
    otp_raw = req.otp

    now = datetime.datetime.utcnow()

    # Find the pending revocation request for this link.
    revocation = db.query(ParentRevocationOtp).filter(
        ParentRevocationOtp.link_id == link_id,
        ParentRevocationOtp.parent_id == parent.id,
        ParentRevocationOtp.status == "pending",
    ).order_by(ParentRevocationOtp.created_at.desc()).first()

    if not revocation:
        raise HTTPException(
            status_code=404,
            detail="No pending revocation request found. The request may have expired.",
        )

    # Expiry check.
    if revocation.expires_at < now:
        revocation.status = "expired"
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Verification code has expired (5 minute limit). The student can send a new request.",
        )

    # Attempt limit.
    max_att = revocation.max_attempts or 5
    if (revocation.attempts or 0) >= max_att:
        raise HTTPException(
            status_code=429,
            detail="Maximum verification attempts exceeded. The student can send a new request.",
        )

    # Verify OTP.
    clean_otp = re.sub(r"\s+", "", otp_raw or "")
    expected = _hash_revocation_otp_parent(parent.id, clean_otp)
    if not hmac.compare_digest(revocation.otp_hash, expected):
        revocation.attempts = (revocation.attempts or 0) + 1
        db.commit()
        remaining = max(0, max_att - revocation.attempts)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining.",
        )

    # OTP is correct – revoke the connection immediately.
    link = db.query(ParentStudentLink).filter(
        ParentStudentLink.id == link_id,
        ParentStudentLink.parent_id == parent.id,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Parent-student connection not found.")

    parent_links.release_link(
        db,
        link,
        status="revoked",
        performed_by_id=parent.id,
        action="revoked_by_parent_otp_confirmation",
        notes=f"Parent {parent.full_name} confirmed OTP-based access removal on {now.isoformat()}",
        now=now,
    )

    revocation.status = "confirmed"
    revocation.confirmed_at = now

    db.commit()
    logger.info(
        "Parent access revoked via OTP: link_id=%s parent=%s student=%s",
        link_id,
        parent.id,
        link.student_id,
    )
    return {
        "status": "revoked",
        "link_id": link_id,
        "message": "Access has been revoked. You can no longer view the student's data.",
    }


# ---------------------------------------------------------------------------
# Parent: view connected child with composite status (Part 5)
# ---------------------------------------------------------------------------

@router.get("/my-child")
def get_parent_connected_child(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent"])),
):
    """
    Returns the parent's connected child with detailed status information.
    Parents can ONLY see their approved/connected child – never other students.
    """
    from app.models import Attempt, ConceptMastery

    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.parent_id == parent.id,
    ).order_by(ParentStudentLink.created_at.desc()).all()

    # Get parent email verification status.
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    email_verified = bool(contact and contact.is_verified)

    results = []
    for link in links:
        student = db.query(User).filter(User.id == link.student_id, User.role == "student").first()
        if not student:
            continue

        # Composite display status.
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

        # Only expose learning data for verified links.
        overall_mastery = None
        overall_mastery_pct = None
        accuracy_pct = None
        last_active = None

        if link.status == "verified":
            masteries = db.query(ConceptMastery).filter(
                ConceptMastery.user_id == student.id
            ).all()
            if masteries:
                scores = [m.mastery_score for m in masteries]
                overall_mastery = round(sum(scores) / len(scores), 3)
                overall_mastery_pct = int(round(overall_mastery * 100))

            last_att = db.query(Attempt).filter(
                Attempt.user_id == student.id
            ).order_by(Attempt.created_at.desc()).first()
            if last_att:
                last_active = last_att.created_at

            # Accuracy from all attempts.
            all_atts = db.query(Attempt).filter(Attempt.user_id == student.id).all()
            if all_atts:
                correct = sum(1 for a in all_atts if a.is_correct)
                accuracy_pct = int(round(correct / len(all_atts) * 100))

        # Check if student requested revocation (pending OTP).
        pending_rev = db.query(ParentRevocationOtp).filter(
            ParentRevocationOtp.link_id == link.id,
            ParentRevocationOtp.parent_id == parent.id,
            ParentRevocationOtp.status == "pending",
            ParentRevocationOtp.expires_at > datetime.datetime.utcnow(),
        ).first()

        results.append({
            "student_id": student.id,
            "full_name": student.full_name,
            "class_name": student.class_name,
            "grade": student.grade,
            "link_id": link.id,
            "link_status": link.status,
            "email_verified": email_verified,
            "connection_display_status": display_status,
            "school_name": link.school_name,
            "teacher_name": link.teacher_name,
            "has_pending_revocation": bool(pending_rev),
            "connected_at": link.created_at,
            "verified_at": link.verified_at,
            "overall_mastery": overall_mastery,
            "overall_mastery_pct": overall_mastery_pct,
            "accuracy_pct": accuracy_pct,
            "last_active": last_active,
        })

    return {"children": results, "total": len(results)}
