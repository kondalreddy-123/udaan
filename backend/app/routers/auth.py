import datetime
import hmac
import re
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    User, RevokedToken, Concept, ConceptMastery, ParentProfile, ParentContact,
    ParentNotificationPreference, ParentStudentLink, ParentInvitation, RelationshipAuditLog
)
from app.schemas import (
    UserLogin, Token, UserResponse, StudentRegisterRequest,
    LogoutResponse, AdminBootstrapRequest, DemoUserSwitch,
    ParentRegisterRequest, ParentVerifyOtpRequest, ParentResendOtpRequest,
    ParentForgotPasswordRequest, ParentResetPasswordRequest
)
from app.auth import (
    verify_and_check_rehash, hash_password, create_access_token,
    decode_token, get_current_user, oauth2_scheme
)
from app.config import settings
from app.services import parent_connect as pc
from app.services import parent_connect_delivery as delivery

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register/parent", status_code=status.HTTP_201_CREATED)
def register_parent(req: ParentRegisterRequest, db: Session = Depends(get_db)):
    """
    Public parent registration endpoint.
    1. Validates email format and matching passwords.
    2. Securely hashes password with Argon2id.
    3. Creates parent user, profile, and contact.
    4. Generates cryptographically secure 6-digit OTP (5 min expiry).
    5. Dispatches OTP to parent's email via Resend.
    6. Returns pending verification response.
    """
    if req.password != req.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match."
        )
    if len(req.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters long."
        )

    clean_email = pc.normalize_email(req.email)
    existing = db.query(User).filter(User.email == clean_email).first()

    if existing:
        if existing.role != "parent":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"An account with this email already exists with role '{existing.role}'."
            )
        contact = db.query(ParentContact).filter(ParentContact.parent_id == existing.id).first()
        if contact and contact.is_verified:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="An account with this email address already exists. Please sign in."
            )
        # Update credentials for unverified account
        existing.full_name = req.full_name.strip()
        existing.hashed_password = hash_password(req.password)
        parent_user = existing
    else:
        hashed = hash_password(req.password)
        parent_user = User(
            email=clean_email,
            hashed_password=hashed,
            full_name=req.full_name.strip(),
            role="parent",
            class_name="Parents Cohort",
            grade=8,
            is_active=True,
            created_by="parent_self_registration"
        )
        db.add(parent_user)
        db.flush()

    profile = db.query(ParentProfile).filter(ParentProfile.user_id == parent_user.id).first()
    if not profile:
        profile = ParentProfile(
            user_id=parent_user.id,
            preferred_language="en",
            contact_method="email",
            is_verified=False,
            notification_preference="not_configured",
            notifications_consent=True,
            notify_email=True,
        )
        db.add(profile)
    else:
        profile.is_verified = False

    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent_user.id).first()
    if not contact:
        contact = ParentContact(
            parent_id=parent_user.id,
            guardian_name=parent_user.full_name,
            contact_type="email",
            email=clean_email,
            is_verified=False,
            notification_consent=True,
            weekly_reports_enabled=True,
        )
        db.add(contact)
    else:
        contact.email = clean_email
        contact.contact_type = "email"
        contact.guardian_name = parent_user.full_name
        contact.is_verified = False

    pref = pc.get_or_create_preferences(db, parent_user)
    pref.preferred_channel = "email"

    # Optional: connect student code provided during registration
    raw_code = (req.connection_code or req.student_connection_code or "").strip()
    if raw_code:
        import hashlib
        code_hash = hashlib.sha256(raw_code.encode()).hexdigest()
        now_dt = datetime.datetime.utcnow()
        inv = db.query(ParentInvitation).filter(ParentInvitation.code_hash == code_hash).first()
        if inv and not inv.is_revoked and not inv.is_redeemed and (not inv.expires_at or inv.expires_at > now_dt):
            # Check if student is not already claimed by another active parent
            active_link = db.query(ParentStudentLink).filter(
                ParentStudentLink.student_id == inv.student_id,
                ParentStudentLink.status.in_(("pending", "verified")),
                ParentStudentLink.parent_id != parent_user.id
            ).first()
            if not active_link:
                existing_link = db.query(ParentStudentLink).filter(
                    ParentStudentLink.parent_id == parent_user.id,
                    ParentStudentLink.student_id == inv.student_id
                ).first()
                if not existing_link:
                    new_link = ParentStudentLink(
                        parent_id=parent_user.id,
                        student_id=inv.student_id,
                        relationship_type="parent",
                        status="pending",  # strictly pending until email verified + student accepts
                        school_name=req.school_name.strip() if req.school_name else None,
                        teacher_name=(req.teacher_name or req.teacher_details or "").strip() or None,
                        verification_method="connection_code",
                        expires_at=now_dt + datetime.timedelta(days=settings.PARENT_CONNECTION_REQUEST_EXPIRE_DAYS),
                        notes="Registered with student code, awaiting email verification and student approval",
                    )
                    db.add(new_link)
                    inv.is_redeemed = True
                    inv.redeemed_by_parent_id = parent_user.id
                    inv.redeemed_at = now_dt

    # Issue secure 6-digit OTP (expires in 5 minutes)
    otp = pc._issue_otp(contact)
    db.commit()
    db.refresh(contact)

    # Deliver OTP via Resend
    delivery_res = pc.send_contact_otp(contact, otp, "en")
    delivery_status = delivery_res.status if delivery_res else "not_configured"
    delivery_err = delivery_res.error if delivery_res and delivery_res.status == "failed" else None

    return {
        "status": "pending_verification",
        "email": clean_email,
        "full_name": parent_user.full_name,
        "otp_delivery_status": delivery_status,
        "error": delivery_err,
        "message": (
            "Verification code sent to your email. Enter the 6-digit code to activate your account."
            if delivery_status == "sent" else
            (f"Account registered, but email delivery reported: {delivery_err}" if delivery_err
             else "Account registered. Please enter your verification code.")
        )
    }


@router.post("/parent/verify-otp", response_model=Token)
def verify_parent_otp(req: ParentVerifyOtpRequest, db: Session = Depends(get_db)):
    """
    Verifies OTP for parent registration.
    On success: marks email verified and returns JWT token so parent is logged in.
    """
    clean_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email, User.role == "parent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Parent account not found.")

    contact = db.query(ParentContact).filter(ParentContact.parent_id == user.id).first()
    if not contact or not contact.otp_hash:
        raise HTTPException(status_code=400, detail="No verification code is pending. Please request a new code.")

    now = pc.utc_now()
    if not contact.otp_expires_at or contact.otp_expires_at < now:
        contact.otp_hash = None
        contact.otp_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Verification code expired (5 minute limit). Please request a new code.")

    max_attempts = settings.PARENT_CONNECT_OTP_MAX_ATTEMPTS
    if (contact.otp_attempts or 0) >= max_attempts:
        raise HTTPException(status_code=429, detail="Maximum attempts exceeded. Please request a new code.")

    clean_otp = re.sub(r"\s+", "", req.otp or "")
    expected = pc.hash_otp(user.id, clean_otp)
    if not hmac.compare_digest(contact.otp_hash, expected):
        contact.otp_attempts = (contact.otp_attempts or 0) + 1
        db.commit()
        remaining = max(0, max_attempts - contact.otp_attempts)
        raise HTTPException(
            status_code=400,
            detail=f"Invalid verification code. {remaining} attempt(s) remaining."
        )

    contact.is_verified = True
    contact.verified_at = now
    contact.verification_method = "email_otp"
    contact.otp_hash = None
    contact.otp_expires_at = None
    contact.otp_attempts = 0

    profile = db.query(ParentProfile).filter(ParentProfile.user_id == user.id).first()
    if profile:
        profile.is_verified = True

    pref = pc.get_or_create_preferences(db, user)
    pref.preferred_channel = "email"

    db.commit()

    token = create_access_token(data={"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/parent/resend-otp")
def resend_parent_otp(req: ParentResendOtpRequest, db: Session = Depends(get_db)):
    """
    Resends OTP with cooldown limit (60s).
    """
    clean_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email, User.role == "parent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Parent account not found.")

    contact = db.query(ParentContact).filter(ParentContact.parent_id == user.id).first()
    if not contact:
        raise HTTPException(status_code=400, detail="Parent contact not found.")

    if contact.is_verified:
        raise HTTPException(status_code=400, detail="Email is already verified. Please sign in.")

    now = pc.utc_now()
    if contact.otp_sent_at:
        elapsed = (now - contact.otp_sent_at).total_seconds()
        if elapsed < settings.PARENT_CONNECT_OTP_RESEND_SECONDS:
            wait = int(settings.PARENT_CONNECT_OTP_RESEND_SECONDS - elapsed) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Please wait {wait} seconds before requesting another code."
            )

    otp = pc._issue_otp(contact)
    db.commit()
    db.refresh(contact)

    result = pc.send_contact_otp(contact, otp, "en")
    return {
        "status": "sent" if result.status == "sent" else result.status,
        "email": clean_email,
        "error": result.error if result.status == "failed" else None,
        "message": "A new verification code has been sent to your email."
    }


@router.post("/parent/forgot-password")
def parent_forgot_password(req: ParentForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Issues a password reset OTP to registered email.
    """
    clean_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email, User.role == "parent").first()
    if not user:
        return {"status": "ok", "message": "If an account with that email exists, a password reset code has been sent."}

    contact = pc.get_or_create_contact(db, user)
    otp = pc._issue_otp(contact)
    db.commit()

    subject = "UDAAN Password Reset Code"
    html_body = f"""<!doctype html><html><body style="font-family:sans-serif;padding:20px;background:#f8fafc;">
    <div style="max-width:500px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;border:1px solid #e2e8f0;">
      <h2 style="color:#0f172a;">Password Reset</h2>
      <p style="color:#475569;">You requested a password reset for your UDAAN parent account.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
        <span style="font-size:32px;font-weight:800;letter-spacing:4px;color:#0ea5e9;">{otp}</span>
      </div>
      <p style="color:#64748b;font-size:12px;">Valid for 5 minutes. If you did not request this, please ignore.</p>
    </div></body></html>"""
    text_body = f"Your UDAAN password reset code is: {otp} (expires in 5 minutes)."

    delivery.send_email(contact.email or clean_email, subject, html_body, text_body)
    return {"status": "ok", "message": "If an account with that email exists, a password reset code has been sent."}


@router.post("/parent/reset-password")
def parent_reset_password(req: ParentResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Verifies OTP and resets parent password.
    """
    if req.new_password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match.")
    if len(req.new_password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long.")

    clean_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == clean_email, User.role == "parent").first()
    if not user:
        raise HTTPException(status_code=404, detail="Parent account not found.")

    contact = db.query(ParentContact).filter(ParentContact.parent_id == user.id).first()
    if not contact or not contact.otp_hash:
        raise HTTPException(status_code=400, detail="No reset code pending. Please request a new code.")

    now = pc.utc_now()
    if not contact.otp_expires_at or contact.otp_expires_at < now:
        contact.otp_hash = None
        contact.otp_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Reset code has expired. Please request a new code.")

    clean_otp = re.sub(r"\s+", "", req.otp or "")
    if not hmac.compare_digest(contact.otp_hash, pc.hash_otp(user.id, clean_otp)):
        contact.otp_attempts = (contact.otp_attempts or 0) + 1
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid verification code.")

    user.hashed_password = hash_password(req.new_password)
    contact.otp_hash = None
    contact.otp_expires_at = None
    contact.otp_attempts = 0
    db.commit()

    return {"status": "success", "message": "Password reset successfully. You can now log in with your new password."}


@router.post("/register/student", response_model=Token, status_code=status.HTTP_201_CREATED)
def register_student(req: StudentRegisterRequest, db: Session = Depends(get_db)):
    """
    Public student self-registration endpoint.
    Strictly forces role to 'student' regardless of any request data.
    Initializes concept masteries baseline for the new student.
    """
    normalized_email = req.email.strip().lower()

    # Reject duplicate registrations
    existing = db.query(User).filter(User.email == normalized_email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists"
        )

    # Hash with Argon2id
    hashed = hash_password(req.password)

    # Create new student account
    new_user = User(
        email=normalized_email,
        hashed_password=hashed,
        full_name=req.full_name.strip(),
        role="student",  # Server-enforced role
        class_name=req.class_name or "Class 8 - Section A",
        grade=req.grade or 8,
        is_active=True,
        created_by="self_registration"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Initialize baseline concept masteries
    concepts = db.query(Concept).all()
    for c in concepts:
        mastery = ConceptMastery(
            user_id=new_user.id,
            concept_id=c.id,
            mastery_score=settings.DEFAULT_BKT_P0,
            bkt_p=settings.DEFAULT_BKT_P0,
            rule_level=1,
            streak_correct=0,
            streak_wrong=0,
            last_path="Focused practice",
            last_reason="Baseline profile initialized upon registration"
        )
        db.add(mastery)
    db.commit()

    token = create_access_token(data={"sub": new_user.email, "role": new_user.role, "id": new_user.id})
    return {"access_token": token, "token_type": "bearer", "user": new_user}


@router.post("/login", response_model=Token)
def login(creds: UserLogin, db: Session = Depends(get_db)):
    """
    Authenticates user credentials using Argon2id with automatic migration from legacy SHA-256.
    Returns signed JWT access token and sanitized user profile.
    """
    normalized_email = creds.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    is_valid, needs_rehash = verify_and_check_rehash(creds.password, user.hashed_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is deactivated. Please contact an administrator."
        )

    # Seamless hash migration: rehash legacy passwords to Argon2id upon login
    if needs_rehash:
        user.hashed_password = hash_password(creds.password)
        db.commit()

    token = create_access_token(data={"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.post("/demo-switch", response_model=Token)
def demo_switch(switch_req: DemoUserSwitch, db: Session = Depends(get_db)):
    """
    Assisted role switcher for judge evaluation and local development.
    Validates target demo accounts and generates authentic cryptographically signed tokens.
    """
    email_map = {
        "student": "student@udaan.edu",
        "teacher": "teacher@udaan.edu",
        "admin": "admin@udaan.edu",
        "author": "author@udaan.edu",
        "parent": "parent@udaan.edu"
    }
    target_email = email_map.get(switch_req.role.lower(), "student@udaan.edu")
    user = db.query(User).filter(User.email == target_email).first()
    if not user:
        raise HTTPException(status_code=404, detail=f"Demo user for role '{switch_req.role}' not found")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Demo user account is currently deactivated")

    token = create_access_token(data={"sub": user.email, "role": user.role, "id": user.id})
    return {"access_token": token, "token_type": "bearer", "user": user}


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    """
    Returns the authenticated user's verified identity from the database.
    Requires a valid JWT Bearer token.
    """
    return user


@router.post("/logout", response_model=LogoutResponse)
def logout(
    token: str = Depends(oauth2_scheme),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Invalidates the current session by registering the token's unique jti on the backend revocation list.
    """
    payload = decode_token(token)
    if not payload:
        raise HTTPException(status_code=400, detail="Invalid token for logout")

    jti = payload.get("jti")
    exp_ts = payload.get("exp", int(datetime.datetime.utcnow().timestamp()) + 3600)
    expires_at = datetime.datetime.utcfromtimestamp(exp_ts)

    if jti:
        already_revoked = db.query(RevokedToken).filter(RevokedToken.jti == jti).first()
        if not already_revoked:
            revocation = RevokedToken(
                jti=jti,
                user_id=user.id,
                expires_at=expires_at
            )
            db.add(revocation)
            db.commit()

    return LogoutResponse(
        status="success",
        message="Session revoked successfully. Token has been blacklisted."
    )


@router.post("/bootstrap-admin")
def bootstrap_admin(req: AdminBootstrapRequest, db: Session = Depends(get_db)):
    """
    Initial administrator setup.
    Allowed only if no active administrator exists, or with the master bootstrap secret.
    """
    admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
    if admin_count > 0:
        # Require secret key if admin already exists
        if req.bootstrap_secret != settings.SECRET_KEY:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="An administrator is already configured. Valid bootstrap secret is required."
            )

    normalized_email = req.email.strip().lower()
    user = db.query(User).filter(User.email == normalized_email).first()

    hashed = hash_password(req.password)
    if user:
        user.role = "admin"
        user.hashed_password = hashed
        user.is_active = True
        user.full_name = req.full_name.strip()
    else:
        user = User(
            email=normalized_email,
            hashed_password=hashed,
            full_name=req.full_name.strip(),
            role="admin",
            class_name="Administration",
            grade=8,
            is_active=True,
            created_by="system_bootstrap"
        )
        db.add(user)

    db.commit()
    db.refresh(user)

    return {
        "status": "success",
        "message": f"Administrator account '{user.email}' initialized successfully with Argon2id credentials.",
        "admin_id": user.id
    }
