"""
Phase 5 acceptance tests: ParentConnect verified contacts, weekly report
calculation, email/SMS delivery, scheduling, duplicate prevention, retries, and
authorization boundaries.

All providers are mocked. No test can send a real email or SMS.
"""
import datetime
import json
import re
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import or_

from app.main import app
from app.database import SessionLocal
from app.models import (
    Attempt,
    Concept,
    ConceptMastery,
    DiagnosticRecord,
    NotificationLog,
    ParentContact,
    ParentNotificationPreference,
    ParentProfile,
    ParentStudentLink,
    SchedulerJobRun,
    User,
    WeeklyProgressReport,
)
from app.auth import create_access_token, hash_password
from app.config import settings
from app.services import parent_connect as pc
from app.services import parent_connect_delivery as delivery
from app.services import parent_connect_scheduler as scheduler

client = TestClient(app)


def _uid(prefix="t"):
    return f"phase5_{prefix}_{uuid.uuid4().hex[:12]}"


def _make_user(db, role, name=None):
    user = User(
        email=f"{_uid(role)}@udaan.test",
        hashed_password=hash_password("udaan123"),
        full_name=name or f"Phase5 {role.title()}",
        role=role,
        class_name="Class 8 - Section A",
        grade=8,
        is_active=True,
        created_by="phase5_test",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _link(db, parent, student):
    link = ParentStudentLink(
        parent_id=parent.id,
        student_id=student.id,
        relationship_type="mother",
        status="verified",
        verified_at=datetime.datetime.utcnow(),
        verification_method="teacher_assisted",
        notes="phase5 test verified link",
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _headers(user):
    token = create_access_token({"sub": user.email, "role": user.role, "id": user.id})
    return {"Authorization": f"Bearer {token}"}


def _make_concept(db, label):
    cid = f"phase5_c_{uuid.uuid4().hex[:8]}"
    concept = Concept(
        id=cid,
        code=cid,
        grade=8,
        subject="Mathematics",
        chapter="Phase5 Test Chapter",
        title_en=f"Phase5 {label}",
        title_te=f"Phase5 {label}",
        sequence_order=9000,
    )
    db.add(concept)
    db.commit()
    return concept


def _make_attempt(db, user, concept, when_utc, correct, seconds=300, hints=0):
    attempt = Attempt(
        id=f"phase5_a_{uuid.uuid4().hex}",
        user_id=user.id,
        question_id=f"phase5_q_{uuid.uuid4().hex[:8]}",
        concept_id=concept.id,
        selected_index=0,
        is_correct=correct,
        hints_used=hints,
        time_spent_sec=seconds,
        attempt_source="practice",
        created_at=when_utc,
        synced_at=when_utc,
    )
    db.add(attempt)
    db.commit()
    return attempt


def _cleanup(db):
    test_users = db.query(User).filter(User.email.like("phase5_%@udaan.test")).all()
    ids = {u.id for u in test_users}
    links = db.query(ParentStudentLink).filter(
        or_(ParentStudentLink.parent_id.in_(ids), ParentStudentLink.student_id.in_(ids))
    ).all() if ids else []
    all_ids = set(ids) | {l.parent_id for l in links} | {l.student_id for l in links}

    reports = db.query(WeeklyProgressReport).filter(
        or_(
            WeeklyProgressReport.parent_id.in_(all_ids),
            WeeklyProgressReport.student_id.in_(all_ids),
        )
    ).all() if all_ids else []
    report_ids = {r.id for r in reports}
    if report_ids:
        db.query(NotificationLog).filter(NotificationLog.report_id.in_(report_ids)).delete(synchronize_session=False)
        db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id.in_(report_ids)).delete(synchronize_session=False)

    if all_ids:
        db.query(ParentContact).filter(ParentContact.parent_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ParentNotificationPreference).filter(
            ParentNotificationPreference.parent_id.in_(all_ids)
        ).delete(synchronize_session=False)
        db.query(ParentStudentLink).filter(
            or_(ParentStudentLink.parent_id.in_(all_ids), ParentStudentLink.student_id.in_(all_ids))
        ).delete(synchronize_session=False)
        db.query(ParentProfile).filter(ParentProfile.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(DiagnosticRecord).filter(DiagnosticRecord.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(ConceptMastery).filter(ConceptMastery.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(Attempt).filter(Attempt.user_id.in_(all_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(all_ids)).delete(synchronize_session=False)

    db.query(Concept).filter(Concept.id.like("phase5_c_%")).delete(synchronize_session=False)
    db.query(SchedulerJobRun).filter(SchedulerJobRun.run_key.like("phase5_%")).delete(synchronize_session=False)
    db.commit()


@pytest.fixture
def db():
    session = SessionLocal()
    _cleanup(session)
    try:
        yield session
    finally:
        _cleanup(session)
        session.close()


@pytest.fixture
def family(db):
    parent = _make_user(db, "parent", "Phase5 Parent")
    student = _make_user(db, "student", "Phase5 Student")
    _link(db, parent, student)
    return parent, student


def _fake_email(sent):
    def _send(to_address, subject, html_body, text_body=""):
        sent.append({"to": to_address, "subject": subject, "html": html_body, "text": text_body})
        return delivery.DeliveryResult("email", "sent", provider_message_id=f"email-{len(sent)}")
    return _send


def _fake_sms(sent):
    def _send(phone, message, variables=None):
        sent.append({"phone": phone, "message": message, "variables": variables})
        return delivery.DeliveryResult("sms", "sent", provider_message_id=f"sms-{len(sent)}")
    return _send


def _extract_otp(text):
    matches = re.findall(r"\b\d{6}\b", text or "")
    assert matches, "No 6-digit OTP found in provider payload"
    return matches[0]


def _register_and_verify_email(db, parent, monkeypatch, sent, email=None):
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))
    address = email or f"{_uid('guardian')}@example.test"
    response = client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": address},
    )
    assert response.status_code == 201, response.text
    otp = _extract_otp(sent[-1]["text"])
    verify = client.post(
        "/api/parent-connect/contact/verify",
        headers=_headers(parent),
        json={"otp": otp},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["is_verified"] is True
    return address


# ---------------------------------------------------------------------------
# Contact registration and verification
# ---------------------------------------------------------------------------
def test_email_registration_and_otp_verification(db, family, monkeypatch):
    parent, _student = family
    sent = []
    address = _register_and_verify_email(db, parent, monkeypatch, sent)

    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    assert contact.email == address
    assert contact.phone is None
    assert contact.is_verified is True
    assert contact.verification_method == "email_otp"
    assert len(sent) == 1
    assert "UDAAN" in sent[0]["subject"]


def test_phone_registration_and_otp_verification(db, family, monkeypatch):
    parent, _student = family
    sent = []
    monkeypatch.setattr(delivery, "send_sms", _fake_sms(sent))
    response = client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "sms", "phone": "+91 98765 43210"},
    )
    assert response.status_code == 201, response.text
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    assert contact.phone == "+919876543210"
    assert contact.email is None
    otp = _extract_otp(sent[-1]["message"])
    verify = client.post(
        "/api/parent-connect/contact/verify",
        headers=_headers(parent),
        json={"otp": otp},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["is_verified"] is True
    assert verify.json()["destination"].endswith("3210")


@pytest.mark.parametrize(
    "payload",
    [
        {"contact_type": "email", "email": "not-an-email"},
        {"contact_type": "email", "email": "valid@example.com", "phone": "9876543210"},
        {"contact_type": "sms", "phone": "12345"},
        {"contact_type": "sms", "phone": "5876543210"},
        {"contact_type": "whatsapp", "phone": "9876543210"},
    ],
)
def test_invalid_contacts_are_rejected(db, family, payload):
    parent, _student = family
    response = client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json=payload,
    )
    assert response.status_code in (400, 422)
    assert db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first() is None


def test_contact_change_requires_reverification(db, family, monkeypatch):
    parent, _student = family
    sent = []
    _register_and_verify_email(db, parent, monkeypatch, sent, email="old@example.test")

    response = client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": "new@example.test"},
    )
    assert response.status_code == 201, response.text
    assert response.json()["is_verified"] is False
    assert response.json()["otp_delivery_status"] == "sent"
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    assert contact.email == "new@example.test"
    assert contact.is_verified is False
    assert len(sent) == 2

    # Re-submitting the same already-verified value must not reset verification.
    otp = _extract_otp(sent[-1]["text"])
    client.post("/api/parent-connect/contact/verify", headers=_headers(parent), json={"otp": otp})
    same = client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": "new@example.test"},
    )
    assert same.status_code == 201
    assert same.json()["is_verified"] is True
    assert len(sent) == 2


def test_otp_resend_rate_limit_and_expiry(db, family, monkeypatch):
    parent, _student = family
    sent = []
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))
    client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": "resend@example.test"},
    )
    too_soon = client.post("/api/parent-connect/contact/resend", headers=_headers(parent))
    assert too_soon.status_code == 429

    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    contact.otp_sent_at = datetime.datetime.utcnow() - datetime.timedelta(
        seconds=settings.PARENT_CONNECT_OTP_RESEND_SECONDS + 5
    )
    db.commit()
    resent = client.post("/api/parent-connect/contact/resend", headers=_headers(parent))
    assert resent.status_code == 200, resent.text

    expired_otp = _extract_otp(sent[-1]["text"])
    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    contact.otp_expires_at = datetime.datetime.utcnow() - datetime.timedelta(minutes=1)
    db.commit()
    expired = client.post(
        "/api/parent-connect/contact/verify",
        headers=_headers(parent),
        json={"otp": expired_otp},
    )
    assert expired.status_code == 400
    assert "expired" in expired.json()["detail"].lower()


def test_otp_wrong_attempts_are_limited(db, family, monkeypatch):
    parent, _student = family
    sent = []
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))
    client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": "attempts@example.test"},
    )
    for _ in range(settings.PARENT_CONNECT_OTP_MAX_ATTEMPTS):
        failed = client.post(
            "/api/parent-connect/contact/verify",
            headers=_headers(parent),
            json={"otp": "000000"},
        )
        assert failed.status_code == 400
    blocked = client.post(
        "/api/parent-connect/contact/verify",
        headers=_headers(parent),
        json={"otp": "000000"},
    )
    assert blocked.status_code == 429


# ---------------------------------------------------------------------------
# Consent and relationship authorization
# ---------------------------------------------------------------------------
def test_consent_opt_out_blocks_delivery(db, family, monkeypatch):
    parent, student = family
    sent = []
    _register_and_verify_email(db, parent, monkeypatch, sent)

    response = client.put(
        "/api/parent-connect/preferences",
        headers=_headers(parent),
        json={"notification_consent": False},
    )
    assert response.status_code == 200, response.text
    assert response.json()["notification_consent"] is False
    assert response.json()["enabled"] is False

    def _must_not_send(*args, **kwargs):
        raise AssertionError("Unverified/consent-blocked contact must not be contacted")

    monkeypatch.setattr(delivery, "send_email", _must_not_send)
    eligibility = pc.delivery_eligibility(db, parent, student)
    assert eligibility["eligible"] is False
    assert eligibility["reason"] == "skipped_consent"

    report, created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )
    assert created is True
    result = pc.deliver_report(db, report)
    assert result.status != "sent"
    db.refresh(report)
    assert report.delivery_status == "skipped_consent"


def test_unverified_contact_never_receives_report(db, family, monkeypatch):
    parent, student = family
    monkeypatch.setattr(delivery, "send_email", _fake_email([]))
    client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "email", "email": "unverified@example.test"},
    )
    eligibility = pc.delivery_eligibility(db, parent, student)
    assert eligibility["eligible"] is False
    assert eligibility["reason"] == "skipped_unverified"

    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )
    result = pc.deliver_report(db, report)
    assert result.status != "sent"
    db.refresh(report)
    assert report.delivery_status == "skipped_unverified"


def test_relationship_authorization_boundaries(db, family, monkeypatch):
    parent, student = family
    other_parent = _make_user(db, "parent", "Other Parent")
    other_student = _make_user(db, "student", "Other Student")
    _link(db, other_parent, other_student)
    _register_and_verify_email(db, parent, monkeypatch, [])

    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )

    no_link_student = client.get(
        f"/api/parent-connect/reports?student_id={other_student.id}",
        headers=_headers(parent),
    )
    assert no_link_student.status_code == 403

    generate_other = client.post(
        "/api/parent-connect/reports/generate",
        headers=_headers(parent),
        json={"student_id": other_student.id, "deliver": False},
    )
    assert generate_other.status_code == 403

    other_reads = client.get(
        f"/api/parent-connect/reports/{report.id}",
        headers=_headers(other_parent),
    )
    assert other_reads.status_code == 403


def test_unauthorized_and_wrong_role_requests_are_rejected(db, family, monkeypatch):
    parent, student = family
    _register_and_verify_email(db, parent, monkeypatch, [])
    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )

    assert client.get("/api/parent-connect/reports").status_code == 401

    student_token = _headers(student)
    assert client.get("/api/parent-connect/reports", headers=student_token).status_code == 403
    assert client.get("/api/parent-connect/contact", headers=student_token).status_code == 403

    admin = _make_user(db, "admin", "Phase5 Admin")
    assert client.get(
        f"/api/parent-connect/reports/{report.id}", headers=_headers(admin)
    ).status_code == 200


def test_existing_parent_login_still_works(db, family):
    parent, _student = family
    login = client.post(
        "/api/auth/login",
        json={"email": parent.email, "password": "udaan123"},
    )
    assert login.status_code == 200, login.text
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    assert client.get("/api/parent/me", headers=headers).status_code == 200
    assert client.get("/api/parent-connect/contact", headers=headers).status_code == 200
    assert client.get("/api/parent-connect/preferences", headers=headers).status_code == 200


# ---------------------------------------------------------------------------
# Report calculation
# ---------------------------------------------------------------------------
def _attempt_time(week_start, day_offset=0, hour_ist=10):
    start_utc = pc.ist_date_start_utc(week_start) + datetime.timedelta(days=day_offset, hours=hour_ist)
    return start_utc


def test_report_calculation_uses_real_activity_and_comparison(db, family):
    parent, student = family
    week_start, week_end = pc.latest_completed_week()
    concept_a = _make_concept(db, "Fractions")
    concept_b = _make_concept(db, "Decimals")

    for day in (0, 0, 1):
        _make_attempt(db, student, concept_a, _attempt_time(week_start, day), True, seconds=300)
    _make_attempt(db, student, concept_b, _attempt_time(week_start, 1), False, seconds=180)
    _make_attempt(db, student, concept_b, _attempt_time(week_start, 1, 11), False, seconds=180)

    db.add_all([
        ConceptMastery(user_id=student.id, concept_id=concept_a.id, mastery_score=0.85, bkt_p=0.85, attempts_count=3),
        ConceptMastery(user_id=student.id, concept_id=concept_b.id, mastery_score=0.30, bkt_p=0.30, attempts_count=2),
    ])
    db.commit()

    # Previous week: only concept A, one correct out of three (33%).
    for index in range(3):
        _make_attempt(
            db,
            student,
            concept_a,
            _attempt_time(week_start - datetime.timedelta(days=7), 0, 10 + index),
            index == 0,
            seconds=120,
        )

    report = pc.build_weekly_report(db, student, week_start, week_end, "en")
    assert report["inactive"] is False
    assert report["activity"]["questions_attempted"] == 5
    assert report["activity"]["correct_answers"] == 3
    assert report["activity"]["accuracy_pct"] == 60
    assert report["activity"]["active_days"] == 2
    assert report["activity"]["lessons_started"] == 2
    assert report["activity"]["lessons_completed"] == 1
    assert report["activity"]["learning_minutes"] == 21
    # Distinct concept-day practice sessions: concept A on two days, concept B on one.
    assert report["activity"]["quizzes_attempted"] == 3
    assert len(report["topics"]) == 2
    assert any("Fractions" in item for item in report["strengths"])
    assert any("Fractions" in item for item in report["improvements"])
    assert any("Decimals" in item for item in report["needs_practice"])
    assert report["previous_week"] is not None
    assert report["comparison"]["accuracy_delta"] == 27
    assert report["recommendations"]


def test_inactive_week_has_no_fabricated_statistics(db, family):
    _parent, student = family
    week_start, week_end = pc.latest_completed_week()
    report = pc.build_weekly_report(db, student, week_start, week_end, "te")
    assert report["inactive"] is True
    assert report["activity"]["questions_attempted"] == 0
    assert report["activity"]["accuracy_pct"] == 0
    assert report["activity"]["learning_minutes"] == 0
    assert report["topics"] == []
    assert report["strengths"] == []
    assert report["improvements"] == []
    assert report["needs_practice"] == []
    assert report["previous_week"] is None
    assert report["comparison"] is None
    assert len(report["recommendations"]) >= 1
    assert report["language"] == "te"


def test_duplicate_report_prevention(db, family):
    parent, student = family
    week_start, week_end = pc.latest_completed_week()
    first, created_first = pc.generate_report_for_pair(db, parent, student, week_start, week_end)
    second, created_second = pc.generate_report_for_pair(db, parent, student, week_start, week_end)
    assert created_first is True
    assert created_second is False
    assert first.id == second.id
    count = db.query(WeeklyProgressReport).filter(
        WeeklyProgressReport.parent_id == parent.id,
        WeeklyProgressReport.student_id == student.id,
        WeeklyProgressReport.week_start == week_start,
        WeeklyProgressReport.week_end == week_end,
    ).count()
    assert count == 1


# ---------------------------------------------------------------------------
# Delivery providers
# ---------------------------------------------------------------------------
def test_email_delivery_uses_branded_template_and_logs(db, family, monkeypatch):
    parent, student = family
    sent = []
    _register_and_verify_email(db, parent, monkeypatch, sent)

    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))
    week = pc.latest_completed_week()
    report, _created = pc.generate_report_for_pair(db, parent, student, *week, generated_by="test")
    result = pc.deliver_report(db, report)
    assert result.status == "sent"
    assert sent[-1]["to"].endswith("@example.test")
    assert "UDAAN" in sent[-1]["html"]
    assert student.full_name.split()[0] in sent[-1]["html"]
    db.refresh(report)
    assert report.delivery_status == "sent"
    assert report.sent_at is not None

    log = db.query(NotificationLog).filter(NotificationLog.report_id == report.id).one()
    assert log.status == "sent"
    assert log.channel == "email"


def test_sms_delivery_is_concise_and_includes_secure_link(db, family, monkeypatch):
    parent, student = family
    sent = []
    monkeypatch.setattr(delivery, "send_sms", _fake_sms(sent))
    client.post(
        "/api/parent-connect/contact",
        headers=_headers(parent),
        json={"contact_type": "sms", "phone": "9876543210"},
    )
    otp = _extract_otp(sent[-1]["message"])
    client.post("/api/parent-connect/contact/verify", headers=_headers(parent), json={"otp": otp})

    week = pc.latest_completed_week()
    report, _created = pc.generate_report_for_pair(db, parent, student, *week, generated_by="test")
    result = pc.deliver_report(db, report)
    assert result.status == "sent"
    message = sent[-1]["message"]
    assert "UDAAN" in message
    assert report.public_token in message
    assert "accuracy" not in message.lower()
    assert "needs practice" not in message.lower()


def test_missing_provider_is_not_configured_never_sent(db, family, monkeypatch):
    parent, student = family
    monkeypatch.setattr(settings, "PARENT_CONNECT_EMAIL_PROVIDER", "disabled")
    monkeypatch.setattr(settings, "PARENT_CONNECT_SMS_PROVIDER", "disabled")

    direct = delivery.send_email("parent@example.test", "Subject", "<p>Hello</p>", "Hello")
    assert direct.status == "not_configured"

    contact = ParentContact(
        parent_id=parent.id,
        contact_type="email",
        email="verified@example.test",
        is_verified=True,
        verified_at=datetime.datetime.utcnow(),
        verification_method="email_otp",
        notification_consent=True,
        weekly_reports_enabled=True,
    )
    db.add(contact)
    db.commit()

    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )
    result = pc.deliver_report(db, report)
    assert result.status == "not_configured"
    db.refresh(report)
    assert report.delivery_status == "not_configured"

    resend = client.post(
        f"/api/parent-connect/reports/{report.id}/resend",
        headers=_headers(parent),
    )
    assert resend.status_code == 409


def test_failed_delivery_is_retried(db, family, monkeypatch):
    parent, student = family
    sent = []
    _register_and_verify_email(db, parent, monkeypatch, sent)

    def _first_failure(*args, **kwargs):
        return delivery.DeliveryResult("email", "failed", error="temporary provider failure")

    monkeypatch.setattr(delivery, "send_email", _first_failure)
    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )
    first = pc.deliver_report(db, report)
    assert first.status == "failed"
    db.refresh(report)
    assert report.delivery_status == "failed"

    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))
    retried = pc.retry_failed_reports(db)
    assert retried == 1
    db.refresh(report)
    assert report.delivery_status == "sent"
    logs = db.query(NotificationLog).filter(NotificationLog.report_id == report.id).order_by(NotificationLog.id).all()
    assert [log.status for log in logs] == ["failed", "sent"]
    assert logs[-1].retry_count == 1


# ---------------------------------------------------------------------------
# Scheduler
# ---------------------------------------------------------------------------
def test_saturday_week_bounds_and_due_time():
    saturday_morning = datetime.datetime(2026, 11, 7, 9, 5, tzinfo=pc.IST_TZ)
    start, end = pc.latest_completed_week(saturday_morning)
    assert (start, end) == (datetime.date(2026, 10, 31), datetime.date(2026, 11, 6))

    friday = datetime.datetime(2026, 11, 6, 23, 0, tzinfo=pc.IST_TZ)
    start, end = pc.latest_completed_week(friday)
    assert (start, end) == (datetime.date(2026, 10, 24), datetime.date(2026, 10, 30))

    week_start, week_end = datetime.date(2026, 10, 31), datetime.date(2026, 11, 6)
    before = datetime.datetime(2026, 11, 7, 8, 59, tzinfo=pc.IST_TZ)
    after = datetime.datetime(2026, 11, 7, 9, 1, tzinfo=pc.IST_TZ)
    assert pc.is_week_due(week_end, before) is False
    assert pc.is_week_due(week_end, after) is True


def test_scheduler_lock_prevents_duplicate_runs(db):
    run_key = f"phase5_{uuid.uuid4().hex[:12]}"
    first = scheduler.acquire_job_lock(db, run_key)
    assert first is not None
    assert first.status == "running"
    second = scheduler.acquire_job_lock(db, run_key)
    assert second is None

    scheduler.finish_job(db, first, status="completed", details={"ok": True})
    third = scheduler.acquire_job_lock(db, run_key)
    assert third is None
    assert scheduler.next_run_info(datetime.datetime(2026, 11, 7, 9, 5, tzinfo=pc.IST_TZ))["next_run_at_ist"].startswith("2026-11-14")


def test_job_not_due_returns_not_due(db):
    # Saturday 08:00 IST is before the 09:00 run for the week ending yesterday.
    saturday_before_schedule = datetime.datetime(2026, 11, 7, 8, 0, tzinfo=pc.IST_TZ)
    result = scheduler.run_weekly_job(db, now=saturday_before_schedule)
    assert result["status"] == "not_due"


# ---------------------------------------------------------------------------
# Public secure links
# ---------------------------------------------------------------------------
def test_public_report_link_token_expiry_and_revocation(db, family, monkeypatch):
    parent, student = family
    _register_and_verify_email(db, parent, monkeypatch, [])
    report, _created = pc.generate_report_for_pair(
        db, parent, student, *pc.latest_completed_week(), generated_by="test"
    )

    public = client.get(f"/api/parent-connect/public/reports/{report.public_token}")
    assert public.status_code == 200, public.text
    assert public.json()["student_name"] == student.full_name
    assert "student_id" not in public.json()

    invalid = client.get("/api/parent-connect/public/reports/not-a-real-token")
    assert invalid.status_code == 404

    revoke = client.post(
        f"/api/parent-connect/reports/{report.id}/revoke-link",
        headers=_headers(parent),
    )
    assert revoke.status_code == 200
    revoked = client.get(f"/api/parent-connect/public/reports/{report.public_token}")
    assert revoked.status_code == 410

    rotate = client.post(
        f"/api/parent-connect/reports/{report.id}/rotate-link",
        headers=_headers(parent),
    )
    assert rotate.status_code == 200
    new_link = rotate.json()["link"]
    new_token = new_link.split("report_token=")[-1]
    assert client.get(f"/api/parent-connect/public/reports/{new_token}").status_code == 200

    report = db.query(WeeklyProgressReport).filter(WeeklyProgressReport.id == report.id).first()
    report.token_expires_at = datetime.datetime.utcnow() - datetime.timedelta(seconds=1)
    db.commit()
    expired = client.get(f"/api/parent-connect/public/reports/{new_token}")
    assert expired.status_code == 410


def test_manual_generation_endpoint_and_delivery_status(db, family, monkeypatch):
    parent, student = family
    sent = []
    _register_and_verify_email(db, parent, monkeypatch, sent)
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))

    week_start, week_end = pc.latest_completed_week()
    response = client.post(
        "/api/parent-connect/reports/generate",
        headers=_headers(parent),
        json={
            "student_id": student.id,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "deliver": True,
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["student_id"] == student.id
    assert body["week_start"] == week_start.isoformat()
    assert body["week_end"] == week_end.isoformat()
    assert body["delivery_status"] == "sent"
    assert body["inactive"] is True
    assert body["public_link_active"] is True


def test_manual_generation_rejects_incomplete_week(db, family):
    parent, student = family
    response = client.post(
        "/api/parent-connect/reports/generate",
        headers=_headers(parent),
        json={
            "student_id": student.id,
            "week_start": "2026-11-01",
            "week_end": "2026-11-03",
            "deliver": False,
        },
    )
    assert response.status_code == 400
    assert "Friday" in response.json()["detail"] or "Saturday" in response.json()["detail"]


def test_status_endpoint_never_exposes_provider_credentials(db, family, monkeypatch):
    parent, _student = family
    monkeypatch.setattr(settings, "RESEND_API_KEY", "super-secret-resend-key")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "super-secret-twilio-token")
    response = client.get("/api/parent-connect/status", headers=_headers(parent))
    assert response.status_code == 200
    text = json.dumps(response.json())
    assert "super-secret" not in text
    assert "email_provider" in response.json()
    assert "next_run_at_ist" in response.json()


# ---------------------------------------------------------------------------
# Student-driven ParentConnect setup (verified parent link required)
# ---------------------------------------------------------------------------
def _student_register_email(student, parent, address, consent=True):
    return client.post(
        "/api/parent-connect/student/contact",
        headers=_headers(student),
        json={
            "parent_id": parent.id,
            "contact_type": "email",
            "email": address,
            "guardian_name": parent.full_name,
            "relationship_type": "mother",
            "notification_consent": consent,
            "weekly_reports_enabled": consent,
            "report_language": "te",
        },
    )


def test_student_overview_lists_verified_and_pending_links(db, family):
    parent, student = family
    pending_parent = _make_user(db, "parent", "Phase5 Pending Parent")
    # One parent per student: the pending request belongs to a *different*
    # student, which is the only valid way to observe both statuses at once.
    pending_student = _make_user(db, "student", "Phase5 Pending Student")
    db.add(ParentStudentLink(
        parent_id=pending_parent.id,
        student_id=pending_student.id,
        relationship_type="father",
        status="pending",
        verification_method="teacher_assisted",
    ))
    db.commit()

    response = client.get("/api/parent-connect/student/overview", headers=_headers(student))
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["student_id"] == student.id
    assert body["has_verified_link"] is True
    assert body["verified_link_count"] == 1
    assert len(body["links"]) == 1

    verified = next(item for item in body["links"] if item["parent_id"] == parent.id)
    assert verified["can_manage"] is True
    assert verified["status"] == "verified"
    assert verified["contact"]["registered"] is False
    assert verified["delivery_eligible"] is False
    assert verified["latest_report"] is None

    pending_body = client.get(
        "/api/parent-connect/student/overview", headers=_headers(pending_student)
    ).json()
    assert len(pending_body["links"]) == 1
    pending = next(item for item in pending_body["links"] if item["parent_id"] == pending_parent.id)
    assert pending["can_manage"] is False
    assert pending["status"] == "pending"
    assert "email_configured" in body
    assert "schedule" in body


def test_student_registers_and_verifies_parent_contact(db, family, monkeypatch):
    parent, student = family
    sent = []
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))

    response = _student_register_email(student, parent, "student-setup@example.test")
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["registered"] is True
    assert body["is_verified"] is False
    assert body["otp_delivery_status"] == "sent"

    contact = db.query(ParentContact).filter(ParentContact.parent_id == parent.id).first()
    assert contact is not None
    assert contact.email == "student-setup@example.test"
    assert contact.guardian_name == parent.full_name
    assert contact.relationship_type == "mother"
    assert contact.notification_consent is True

    otp = _extract_otp(sent[-1]["text"])
    verify = client.post(
        "/api/parent-connect/student/contact/verify",
        headers=_headers(student),
        json={"parent_id": parent.id, "otp": otp},
    )
    assert verify.status_code == 200, verify.text
    assert verify.json()["is_verified"] is True

    overview = client.get(
        "/api/parent-connect/student/overview", headers=_headers(student)
    ).json()
    link = next(item for item in overview["links"] if item["parent_id"] == parent.id)
    assert link["contact"]["is_verified"] is True
    assert link["contact"]["contact_type"] == "email"
    assert link["contact"]["notification_consent"] is True
    assert link["delivery_eligible"] is True

    # The parent account sees the same verified contact through the parent API.
    parent_view = client.get("/api/parent-connect/contact", headers=_headers(parent))
    assert parent_view.status_code == 200
    assert parent_view.json()["is_verified"] is True


def test_student_cannot_manage_pending_or_unlinked_parents(db, family, monkeypatch):
    _parent, student = family
    sent = []
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))

    pending_parent = _make_user(db, "parent", "Phase5 Pending Parent")
    # The pending request must live on an otherwise-unlinked student, because
    # a student can only ever have one pending-or-verified parent.
    other_student = _make_user(db, "student", "Phase5 Other Student")
    db.add(ParentStudentLink(
        parent_id=pending_parent.id,
        student_id=other_student.id,
        relationship_type="guardian",
        status="pending",
        verification_method="teacher_assisted",
    ))
    db.commit()

    pending = _student_register_email(other_student, pending_parent, "pending@example.test")
    assert pending.status_code == 403
    assert "verify" in pending.json()["detail"].lower()

    unrelated = _make_user(db, "parent", "Phase5 Unrelated Parent")
    unlinked = _student_register_email(student, unrelated, "unlinked@example.test")
    assert unlinked.status_code == 403

    assert db.query(ParentContact).filter(
        ParentContact.parent_id.in_([pending_parent.id, unrelated.id])
    ).count() == 0

    anonymous = client.get("/api/parent-connect/student/overview")
    assert anonymous.status_code == 401

    forbidden = client.get(
        "/api/parent-connect/student/overview", headers=_headers(other_student)
    )
    assert forbidden.status_code == 200
    assert forbidden.json()["has_verified_link"] is False

    other_parent = _student_register_email(other_student, _parent, "other-student@example.test")
    assert other_parent.status_code == 403

    # Parent-only endpoints stay parent-only.
    assert client.get(
        "/api/parent-connect/contact", headers=_headers(student)
    ).status_code == 403


def test_student_preferences_and_last_report_status(db, family, monkeypatch):
    parent, student = family
    sent = []
    monkeypatch.setattr(delivery, "send_email", _fake_email(sent))

    response = _student_register_email(student, parent, "prefs@example.test")
    assert response.status_code == 201, response.text
    otp = _extract_otp(sent[-1]["text"])
    verify = client.post(
        "/api/parent-connect/student/contact/verify",
        headers=_headers(student),
        json={"parent_id": parent.id, "otp": otp},
    )
    assert verify.status_code == 200, verify.text

    week_start, week_end = pc.latest_completed_week()
    report, _created = pc.generate_report_for_pair(
        db, parent, student, week_start, week_end, generated_by="test"
    )
    report.delivery_status = "not_configured"
    db.commit()

    overview = client.get(
        "/api/parent-connect/student/overview", headers=_headers(student)
    ).json()
    link = next(item for item in overview["links"] if item["parent_id"] == parent.id)
    assert link["latest_report"]["id"] == report.id
    assert link["latest_report"]["delivery_status"] == "not_configured"
    assert link["delivery_channel"] == "email"

    disable = client.put(
        "/api/parent-connect/student/preferences",
        headers=_headers(student),
        json={
            "parent_id": parent.id,
            "enabled": False,
            "weekly_reports_enabled": True,
            "notification_consent": True,
            "report_language": "hi",
        },
    )
    assert disable.status_code == 200, disable.text
    body = disable.json()
    assert body["enabled"] is False
    assert body["weekly_reports_enabled"] is True
    assert body["report_language"] == "hi"

    disabled_overview = client.get(
        "/api/parent-connect/student/overview", headers=_headers(student)
    ).json()
    link = next(
        item for item in disabled_overview["links"] if item["parent_id"] == parent.id
    )
    assert link["delivery_eligible"] is False
    assert link["delivery_reason"] == "skipped_disabled"

    withdraw = client.put(
        "/api/parent-connect/student/preferences",
        headers=_headers(student),
        json={
            "parent_id": parent.id,
            "notification_consent": False,
            "weekly_reports_enabled": True,
        },
    )
    assert withdraw.status_code == 200, withdraw.text
    assert withdraw.json()["notification_consent"] is False
    assert withdraw.json()["weekly_reports_enabled"] is False

    withdrawn_overview = client.get(
        "/api/parent-connect/student/overview", headers=_headers(student)
    ).json()
    link = next(
        item for item in withdrawn_overview["links"] if item["parent_id"] == parent.id
    )
    assert link["delivery_eligible"] is False
    assert link["delivery_reason"] == "skipped_consent"


def test_student_endpoints_require_verified_role_and_valid_parent(db, family):
    parent, student = family
    teacher = _make_user(db, "teacher", "Phase5 Teacher")
    assert client.get(
        "/api/parent-connect/student/overview", headers=_headers(teacher)
    ).status_code == 403
    assert client.post(
        "/api/parent-connect/student/contact/resend",
        headers=_headers(student),
        json={"parent_id": 999999},
    ).status_code == 404
    assert client.put(
        "/api/parent-connect/student/preferences",
        headers=_headers(student),
        json={"parent_id": parent.id, "weekly_reports_enabled": True},
    ).status_code == 200


# ---------------------------------------------------------------------------
# Delivery transport regressions
# ---------------------------------------------------------------------------
def test_resend_request_carries_explicit_user_agent(monkeypatch):
    """api.resend.com sits behind Cloudflare, which rejects urllib's default
    ``Python-urllib/x.y`` User-Agent with HTTP 403 (error code 1010) before the
    request reaches Resend. The client must always identify itself."""
    captured = {}

    class _FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def read(self):
            return b'{"id": "test-message-id"}'

    def _fake_urlopen(request, timeout=None):
        captured["request"] = request
        return _FakeResponse()

    monkeypatch.setattr(settings, "PARENT_CONNECT_EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(settings, "RESEND_API_KEY", "re_test_key")
    monkeypatch.setattr(
        settings, "PARENT_CONNECT_EMAIL_FROM", "UDAAN <onboarding@resend.dev>"
    )
    monkeypatch.setattr(delivery.urllib.request, "urlopen", _fake_urlopen)

    result = delivery.send_email(
        "parent@example.test", "Subject", "<p>Hello</p>", "Hello"
    )

    assert result.status == "sent"
    assert result.provider_message_id == "test-message-id"
    request = captured["request"]
    user_agent = request.get_header("User-agent")
    assert user_agent == delivery._HTTP_USER_AGENT
    assert "Python-urllib" not in user_agent


def test_email_provider_auto_detection(monkeypatch):
    from app.config import _detect_email_provider

    monkeypatch.delenv("PARENT_CONNECT_EMAIL_PROVIDER", raising=False)
    monkeypatch.setenv("RESEND_API_KEY", "re_x")
    monkeypatch.setenv("SMTP_HOST", "")
    assert _detect_email_provider() == "resend"

    monkeypatch.setenv("PARENT_CONNECT_EMAIL_PROVIDER", "")
    assert _detect_email_provider() == "resend"

    monkeypatch.setenv("PARENT_CONNECT_EMAIL_PROVIDER", "auto")
    assert _detect_email_provider() == "resend"

    monkeypatch.setenv("PARENT_CONNECT_EMAIL_PROVIDER", "smtp")
    assert _detect_email_provider() == "smtp"
