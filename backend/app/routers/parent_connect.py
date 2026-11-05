"""ParentConnect API (Phase 5).

Authenticated endpoints for verified contacts, notification preferences, weekly
reports, and restricted manual generation. The public report-view endpoint is
the only unauthenticated route and requires an unexpired, unrevoked random
token.
"""
from __future__ import annotations

import datetime
import hashlib
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import require_role
from app.database import get_db
from app.models import (
    ParentContact,
    ParentNotificationPreference,
    ParentStudentLink,
    ParentInvitation,
    RelationshipAuditLog,
    User,
    WeeklyProgressReport,
)
from app.schemas import (
    ParentConnectPreferencesResponse,
    ParentConnectPreferencesUpdate,
    ParentConnectPublicReportResponse,
    ParentConnectStatusResponse,
    ParentContactOtpRequest,
    ParentContactRegisterRequest,
    ParentContactResponse,
    StudentParentConnectOverviewResponse,
    StudentParentConnectPreferencesUpdate,
    StudentParentContactOtpRequest,
    StudentParentContactRequest,
    StudentParentLinkStatus,
    StudentParentRefRequest,
    WeeklyReportDetailResponse,
    WeeklyReportGenerateRequest,
    WeeklyReportSummaryResponse,
    ParentEmailChangeRequest,
    ParentEmailChangeVerifyRequest,
    ConnectStudentRequest,
)
from app.services import parent_connect as pc
from app.services import parent_connect_delivery as delivery
from app.services import parent_connect_scheduler as scheduler
from app.services import parent_links

logger = logging.getLogger("udaan.parent_connect.router")

router = APIRouter(prefix="/parent-connect", tags=["ParentConnect Weekly Reports"])


def _http_error(exc: pc.ParentConnectError) -> HTTPException:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return HTTPException(status_code=exc.status_code, detail=exc.message, headers=headers)


def _provider_configured(channel: Optional[str]) -> bool:
    if channel == "sms":
        return delivery.sms_is_configured()
    return delivery.email_is_configured()


def _contact_response(
    contact: ParentContact,
    preferences: Optional[ParentNotificationPreference],
    *,
    result: Optional[delivery.DeliveryResult] = None,
    message: Optional[str] = None,
) -> ParentContactResponse:
    snapshot = pc.contact_snapshot(contact, preferences)
    channel = contact.contact_type if contact else None
    configured = _provider_configured(channel) if channel else False
    if message is None and result is not None:
        if result.status == "sent":
            message = "Verification code sent. Enter it below to verify this contact."
        elif result.status == "not_configured":
            message = (
                "Contact saved, but the email/SMS provider is not configured on this server. "
                "No message was sent. Ask the administrator to configure delivery."
            )
        else:
            message = "Contact saved, but the verification message could not be delivered. Please try again."
    return ParentContactResponse(
        **snapshot,
        otp_delivery_status=result.status if result else None,
        provider_configured=configured,
        message=message,
    )


def _preferences_response(
    db: Session,
    parent: User,
    contact: ParentContact,
    pref: ParentNotificationPreference,
) -> ParentConnectPreferencesResponse:
    snapshot = pc.contact_snapshot(contact, pref)
    next_run = scheduler.next_run_info()
    latest_report = (
        db.query(WeeklyProgressReport)
        .filter(WeeklyProgressReport.parent_id == parent.id)
        .order_by(WeeklyProgressReport.created_at.desc())
        .first()
    )
    last_sent_str = latest_report.sent_at.isoformat() + "Z" if latest_report and latest_report.sent_at else None
    last_status = latest_report.delivery_status if latest_report else None
    return ParentConnectPreferencesResponse(
        enabled=bool(pref.enabled),
        frequency=pref.frequency or "weekly",
        preferred_channel=pref.preferred_channel or contact.contact_type or "email",
        report_language=pref.report_language or "en",
        delivery_day=getattr(pref, "delivery_day", "Sunday") or "Sunday",
        delivery_time=getattr(pref, "delivery_time", "18:00") or "18:00",
        notification_consent=bool(contact.notification_consent),
        weekly_reports_enabled=bool(contact.weekly_reports_enabled),
        contact=ParentContactResponse(**snapshot),
        email_provider=delivery.email_provider_label(),
        sms_provider=delivery.sms_provider_label(),
        next_run_at_ist=next_run.get("next_run_at_ist"),
        last_report_sent_at=last_sent_str,
        last_delivery_status=last_status,
    )


def _assert_student_access(db: Session, user: User, student_id: int) -> User:
    student = db.query(User).filter(User.id == student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    if user.role != "admin":
        link = db.query(ParentStudentLink).filter(
            ParentStudentLink.parent_id == user.id,
            ParentStudentLink.student_id == student_id,
            ParentStudentLink.status == "verified",
        ).first()
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: You do not have verified parental access to this student.",
            )
    return student


def _resolve_student_parent(
    db: Session, student: User, parent_id: int
) -> tuple[User, ParentStudentLink]:
    """Return a parent only when this student has a teacher-verified link.

    Students may manage ParentConnect contacts on behalf of an existing parent
    account, but they can never create a parent account or self-verify a
    relationship. Pending, rejected, and revoked links must first go through
    the normal invitation plus teacher-verification flow.
    """
    parent = db.query(User).filter(User.id == parent_id, User.role == "parent").first()
    if not parent:
        raise HTTPException(status_code=404, detail="Parent account not found.")
    link = parent_links.link_for_pair(db, parent_id, student.id)
    if not link:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This parent is not linked to your account. Use Create Parent Account first.",
        )
    if link.status != "verified":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "A teacher must verify this parent-student relationship before weekly "
                "reports can be set up. Use Create Parent Account to invite and verify a parent."
            ),
        )
    return parent, link


def _student_link_status(
    db: Session, student: User, link: ParentStudentLink
) -> StudentParentLinkStatus:
    parent = db.query(User).filter(User.id == link.parent_id).first()
    contact = db.query(ParentContact).filter(
        ParentContact.parent_id == link.parent_id
    ).first()
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == link.parent_id
    ).first()
    snapshot = pc.contact_snapshot(contact, pref)
    can_manage = (
        link.status == "verified"
        and parent is not None
        and parent.role == "parent"
    )

    eligible: Dict[str, Any] = {
        "eligible": False,
        "reason": "skipped_no_relationship",
        "channel": None,
    }
    if can_manage:
        eligible = pc.delivery_eligibility(db, parent, student)

    latest = db.query(WeeklyProgressReport).filter(
        WeeklyProgressReport.student_id == student.id,
        WeeklyProgressReport.parent_id == link.parent_id,
    ).order_by(
        WeeklyProgressReport.week_start.desc(),
        WeeklyProgressReport.id.desc(),
    ).first()

    return StudentParentLinkStatus(
        parent_id=link.parent_id,
        parent_name=parent.full_name if parent else "Parent",
        parent_email=parent.email if parent else None,
        relationship_type=link.relationship_type,
        status=link.status,
        verified_at=link.verified_at,
        can_manage=can_manage,
        contact=ParentContactResponse(**snapshot),
        delivery_eligible=bool(eligible.get("eligible")),
        delivery_reason=eligible.get("reason"),
        delivery_channel=eligible.get("channel"),
        latest_report=(
            WeeklyReportSummaryResponse(**pc.report_summary(latest)) if latest else None
        ),
    )


def _resolve_week(req: WeeklyReportGenerateRequest) -> tuple[datetime.date, datetime.date]:
    latest_start, latest_end = pc.latest_completed_week()
    if req.week_start is None and req.week_end is None:
        return latest_start, latest_end
    if req.week_start is None or req.week_end is None:
        raise HTTPException(status_code=400, detail="Provide both week_start and week_end, or neither.")
    if req.week_end.weekday() != 4:
        raise HTTPException(status_code=400, detail="week_end must be a Friday.")
    if (req.week_end - req.week_start).days != 6:
        raise HTTPException(status_code=400, detail="The reporting week must run Saturday through Friday.")
    if req.week_end > latest_end:
        raise HTTPException(status_code=400, detail="Reports can only be generated for completed weeks.")
    return req.week_start, req.week_end


# ---------------------------------------------------------------------------
# Contact registration and verification
# ---------------------------------------------------------------------------
@router.get("/contact", response_model=ParentContactResponse)
def get_contact(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    return _contact_response(contact, pref, message=None)


@router.post("/contact", response_model=ParentContactResponse, status_code=status.HTTP_201_CREATED)
def register_contact(
    req: ParentContactRegisterRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    try:
        contact, _otp, result = pc.register_contact(
            db,
            parent,
            contact_type=req.contact_type,
            email=req.email,
            phone=req.phone,
            guardian_name=req.guardian_name,
            relationship_type=req.relationship_type,
            notification_consent=req.notification_consent,
            weekly_reports_enabled=req.weekly_reports_enabled,
            report_language=req.report_language,
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    except Exception as exc:  # pragma: no cover - defensive
        db.rollback()
        logger.exception("ParentConnect contact registration failed")
        raise HTTPException(status_code=500, detail=f"Could not save contact: {type(exc).__name__}")

    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    if result is None:
        message = "This contact is already verified."
    else:
        message = None
    return _contact_response(contact, pref, result=result, message=message)


@router.post("/contact/resend", response_model=ParentContactResponse)
def resend_otp(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    try:
        contact, _otp, result = pc.resend_contact_otp(db, parent)
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    return _contact_response(contact, pref, result=result)


@router.post("/contact/verify", response_model=ParentContactResponse)
def verify_contact(
    req: ParentContactOtpRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    try:
        contact = pc.verify_contact_otp(db, parent, req.otp)
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    return _contact_response(contact, pref, message="Contact verified. Weekly reports can now be delivered.")


# ---------------------------------------------------------------------------
# Student bridge: manage ParentConnect for an already-verified parent link
# ---------------------------------------------------------------------------
@router.get("/student/overview", response_model=StudentParentConnectOverviewResponse)
def get_student_overview(
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    links = db.query(ParentStudentLink).filter(
        ParentStudentLink.student_id == student.id
    ).order_by(ParentStudentLink.id.asc()).all()
    statuses = [_student_link_status(db, student, link) for link in links]
    verified = [item for item in statuses if item.can_manage]
    info = pc.provider_status()
    next_run = scheduler.next_run_info()
    return StudentParentConnectOverviewResponse(
        student_id=student.id,
        student_name=student.full_name,
        links=statuses,
        verified_link_count=len(verified),
        has_verified_link=bool(verified),
        provider_ready=bool(info.get("email_configured") or info.get("sms_configured")),
        email_provider=info.get("email_provider", "not_configured"),
        email_configured=bool(info.get("email_configured")),
        sms_provider=info.get("sms_provider", "not_configured"),
        sms_configured=bool(info.get("sms_configured")),
        scheduler_enabled=bool(info.get("scheduler_enabled")),
        schedule=info.get("schedule", ""),
        next_run_at_ist=next_run.get("next_run_at_ist"),
        next_reporting_week_start=next_run.get("next_reporting_week_start"),
        next_reporting_week_end=next_run.get("next_reporting_week_end"),
    )


@router.post(
    "/student/contact",
    response_model=ParentContactResponse,
    status_code=status.HTTP_201_CREATED,
)
def student_register_contact(
    req: StudentParentContactRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    parent, _link = _resolve_student_parent(db, student, req.parent_id)
    try:
        contact, _otp, result = pc.register_contact(
            db,
            parent,
            contact_type=req.contact_type,
            email=req.email,
            phone=req.phone,
            guardian_name=req.guardian_name,
            relationship_type=req.relationship_type,
            notification_consent=req.notification_consent,
            weekly_reports_enabled=req.weekly_reports_enabled,
            report_language=req.report_language,
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    except Exception as exc:  # pragma: no cover - defensive
        db.rollback()
        logger.exception("Student ParentConnect contact registration failed")
        raise HTTPException(status_code=500, detail=f"Could not save contact: {type(exc).__name__}")

    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    message = "This contact is already verified." if result is None else None
    return _contact_response(contact, pref, result=result, message=message)


@router.post("/student/contact/resend", response_model=ParentContactResponse)
def student_resend_otp(
    req: StudentParentRefRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    parent, _link = _resolve_student_parent(db, student, req.parent_id)
    try:
        contact, _otp, result = pc.resend_contact_otp(db, parent)
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    return _contact_response(contact, pref, result=result)


@router.post("/student/contact/verify", response_model=ParentContactResponse)
def student_verify_contact(
    req: StudentParentContactOtpRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    parent, _link = _resolve_student_parent(db, student, req.parent_id)
    try:
        contact = pc.verify_contact_otp(db, parent, req.otp)
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    pref = db.query(ParentNotificationPreference).filter(
        ParentNotificationPreference.parent_id == parent.id
    ).first()
    return _contact_response(
        contact,
        pref,
        message="Contact verified. Weekly reports can now be delivered.",
    )


@router.put("/student/preferences", response_model=ParentConnectPreferencesResponse)
def student_update_preferences(
    req: StudentParentConnectPreferencesUpdate,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    parent, _link = _resolve_student_parent(db, student, req.parent_id)
    try:
        contact, pref = pc.update_preferences(
            db,
            parent,
            enabled=req.enabled,
            preferred_channel=req.preferred_channel,
            report_language=req.report_language,
            notification_consent=req.notification_consent,
            weekly_reports_enabled=req.weekly_reports_enabled,
            delivery_day=req.delivery_day,
            delivery_time=req.delivery_time,
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    return _preferences_response(db, parent, contact, pref)


# ---------------------------------------------------------------------------
# Preferences
# ---------------------------------------------------------------------------
@router.get("/preferences", response_model=ParentConnectPreferencesResponse)
def get_preferences(
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    contact = pc.get_or_create_contact(db, parent)
    pref = pc.get_or_create_preferences(db, parent)
    db.commit()
    db.refresh(contact)
    db.refresh(pref)
    return _preferences_response(db, parent, contact, pref)


@router.put("/preferences", response_model=ParentConnectPreferencesResponse)
def update_preferences(
    req: ParentConnectPreferencesUpdate,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    try:
        contact, pref = pc.update_preferences(
            db,
            parent,
            enabled=req.enabled,
            preferred_channel=req.preferred_channel,
            report_language=req.report_language,
            notification_consent=req.notification_consent,
            weekly_reports_enabled=req.weekly_reports_enabled,
            delivery_day=req.delivery_day,
            delivery_time=req.delivery_time,
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    return _preferences_response(db, parent, contact, pref)


# ---------------------------------------------------------------------------
# Reports (authenticated)
# ---------------------------------------------------------------------------
@router.get("/reports", response_model=List[WeeklyReportSummaryResponse])
def list_reports(
    student_id: Optional[int] = None,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    query = db.query(WeeklyProgressReport)
    if user.role == "admin":
        if student_id is not None:
            query = query.filter(WeeklyProgressReport.student_id == student_id)
    else:
        if student_id is not None:
            _assert_student_access(db, user, student_id)
        query = query.filter(WeeklyProgressReport.parent_id == user.id)
    reports = query.order_by(WeeklyProgressReport.week_start.desc(), WeeklyProgressReport.id.desc()).limit(limit).all()
    return [WeeklyReportSummaryResponse(**pc.report_summary(report)) for report in reports]


@router.get("/reports/{report_id}", response_model=WeeklyReportDetailResponse)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    report = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not pc.can_parent_access_report(db, user, report):
        raise HTTPException(status_code=403, detail="You do not have access to this report.")
    return WeeklyReportDetailResponse(**pc.report_detail(report))


@router.post("/reports/generate", response_model=WeeklyReportDetailResponse)
def generate_report(
    req: WeeklyReportGenerateRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    if req.student_id is None:
        raise HTTPException(status_code=400, detail="student_id is required.")
    student = _assert_student_access(db, user, req.student_id)
    week_start, week_end = _resolve_week(req)
    parent: Optional[User] = None
    if user.role == "admin":
        # Admins can generate for any verified parent-child pair; choose the
        # first verified parent link for this student when no parent is passed.
        link = db.query(ParentStudentLink).filter(
            ParentStudentLink.student_id == student.id,
            ParentStudentLink.status == "verified",
        ).order_by(ParentStudentLink.id.asc()).first()
        if not link:
            raise HTTPException(status_code=400, detail="This student has no verified parent contact.")
        parent = db.query(User).filter(User.id == link.parent_id).first()
    else:
        parent = user
    if not parent:
        raise HTTPException(status_code=400, detail="Parent account not found for this report.")

    report, created, result = pc.generate_and_deliver_for_pair(
        db,
        parent,
        student,
        week_start,
        week_end,
        generated_by=user.role,
        force_delivery=bool(req.deliver),
    )
    if result is not None:
        db.refresh(report)
    logger.info(
        "ParentConnect manual report generated=%s report=%s user=%s student=%s week=%s..%s",
        created,
        report.id,
        user.id,
        student.id,
        week_start,
        week_end,
    )
    return WeeklyReportDetailResponse(**pc.report_detail(report))


@router.post("/reports/{report_id}/resend", response_model=WeeklyReportDetailResponse)
def resend_report(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    report = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not pc.can_parent_access_report(db, user, report):
        raise HTTPException(status_code=403, detail="You do not have access to this report.")
    result = pc.deliver_report(db, report, force=True)
    db.refresh(report)
    if result.status == "not_configured":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Delivery provider is not configured on this server; nothing was sent.",
        )
    if result.status == "failed":
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Delivery failed: {result.error or 'provider error'}",
        )
    return WeeklyReportDetailResponse(**pc.report_detail(report))


@router.post("/reports/{report_id}/revoke-link")
def revoke_report_link(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    report = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not pc.can_parent_access_report(db, user, report):
        raise HTTPException(status_code=403, detail="You do not have access to this report.")
    pc.revoke_report_token(db, report)
    return {"status": "revoked", "report_id": report.id}


@router.post("/reports/{report_id}/rotate-link")
def rotate_report_link(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_role(["parent", "admin"])),
):
    report = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    if not pc.can_parent_access_report(db, user, report):
        raise HTTPException(status_code=403, detail="You do not have access to this report.")
    pc.rotate_report_token(db, report)
    return {
        "status": "rotated",
        "report_id": report.id,
        "link": delivery.build_report_link(report.public_token),
        "expires_at": report.token_expires_at,
    }


# ---------------------------------------------------------------------------
# Public secure link
# ---------------------------------------------------------------------------
@router.get("/public/reports/{token}", response_model=ParentConnectPublicReportResponse)
def get_public_report(token: str, db: Session = Depends(get_db)):
    try:
        report = pc.get_report_by_token(db, token)
    except pc.ParentConnectError as exc:
        raise _http_error(exc)
    data = pc.report_detail(report)
    return ParentConnectPublicReportResponse(
        id=data["id"],
        student_name=data.get("student_name"),
        class_name=data.get("class_name"),
        week_start=data.get("week_start"),
        week_end=data.get("week_end"),
        week_label=data.get("week_label"),
        language=data.get("language", "en"),
        inactive=bool(data.get("inactive")),
        activity=data.get("activity") or {},
        topics=data.get("topics") or [],
        strengths=data.get("strengths") or [],
        improvements=data.get("improvements") or [],
        needs_practice=data.get("needs_practice") or [],
        recommendations=data.get("recommendations") or [],
        recommendation_source=data.get("recommendation_source"),
        previous_week=data.get("previous_week"),
        comparison=data.get("comparison"),
        generated_at=data.get("generated_at"),
        token_expires_at=data.get("token_expires_at"),
    )


# ---------------------------------------------------------------------------
# Operational status
# ---------------------------------------------------------------------------
@router.get("/status", response_model=ParentConnectStatusResponse)
def get_status(
    user: User = Depends(require_role(["parent", "admin"])),
):
    info = pc.provider_status()
    next_run = scheduler.next_run_info()
    return ParentConnectStatusResponse(
        **info,
        scheduler_running=scheduler.scheduler_running(),
        next_run_at_ist=next_run.get("next_run_at_ist"),
        next_reporting_week_start=next_run.get("next_reporting_week_start"),
        next_reporting_week_end=next_run.get("next_reporting_week_end"),
    )


@router.post("/reports/send-test")
def send_test_report(
    student_id: Optional[int] = None,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    """
    Manually generates and immediately delivers a test weekly report to the
    authenticated parent's verified email address via Resend.
    """
    try:
        result = pc.send_test_report_now(db, parent, student_id)
        return result
    except pc.ParentConnectError as exc:
        raise _http_error(exc)


@router.post("/email/request-change", response_model=ParentContactResponse)
def request_email_change(
    req: ParentEmailChangeRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    """
    Requests changing the parent's verified email address.
    Dispatches a 6-digit OTP to the new email address via Resend.
    """
    try:
        contact, otp, result = pc.request_email_change(db, parent, req.new_email)
        pref = pc.get_or_create_preferences(db, parent)
        return _contact_response(
            contact,
            pref,
            result=result,
            message="Verification code sent to your new email. Enter the code to confirm the change.",
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)


@router.post("/email/verify-change", response_model=ParentContactResponse)
def verify_email_change(
    req: ParentEmailChangeVerifyRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    """
    Verifies the OTP sent to the new email address and updates the account.
    """
    try:
        contact = pc.verify_email_change(db, parent, req.otp)
        pref = pc.get_or_create_preferences(db, parent)
        return _contact_response(
            contact,
            pref,
            message="Email address successfully updated and verified.",
        )
    except pc.ParentConnectError as exc:
        raise _http_error(exc)


@router.post("/connect")
def parent_connect_student(
    req: ConnectStudentRequest,
    db: Session = Depends(get_db),
    parent: User = Depends(require_role(["parent", "admin"])),
):
    """
    Parent enters a student's connection code to request access.
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

    student = db.query(User).filter(User.id == inv.student_id, User.role == "student").first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found.")

    check = parent_links.check_connection(db, parent.id, student.id, now=now)
    link = check.same_parent_link

    # Never allow a second parent to claim a reserved or connected student.
    if check.active_link and (not link or check.active_link.id != link.id):
        raise HTTPException(status_code=409, detail=parent_links.GENERIC_ALREADY_CONNECTED)

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
            relationship_type=req.relationship_type or "parent",
            status="pending",
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
        raise HTTPException(status_code=409, detail=parent_links.GENERIC_ALREADY_CONNECTED)
    db.refresh(link)

    return {
        "status": "pending_approval",
        "link_id": link.id,
        "student_id": student.id,
        "student_name": student.full_name,
        "message": f"Connection request sent! Waiting for {student.full_name} to approve."
    }
