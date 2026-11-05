import datetime
import json
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Date, ForeignKey, Text,
    UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(String(50), default="student")  # student, teacher, admin, guest
    class_name = Column(String(100), default="Class 8 - Section A")
    grade = Column(Integer, default=8)
    is_active = Column(Boolean, default=True)
    created_by = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    attempts = relationship("Attempt", back_populates="user", cascade="all, delete-orphan")
    masteries = relationship("ConceptMastery", back_populates="user", cascade="all, delete-orphan")
    action_cards = relationship("TeacherActionCard", back_populates="student", cascade="all, delete-orphan")
    diagnostic_records = relationship("DiagnosticRecord", back_populates="user", cascade="all, delete-orphan")


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    id = Column(Integer, primary_key=True, index=True)
    jti = Column(String(64), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    revoked_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)


class ParentProfile(Base):
    __tablename__ = "parent_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    phone_number = Column(String(30), nullable=True)
    preferred_language = Column(String(10), default="te")  # 'te', 'hi', 'en'
    contact_method = Column(String(30), default="in_app")  # 'in_app', 'sms', 'whatsapp'
    is_verified = Column(Boolean, default=False)
    notification_preference = Column(String(30), default="not_configured")  # Phase 3 placeholder
    # --- Phase 4: consent-aware parent notifications ---
    notifications_consent = Column(Boolean, default=True)
    notify_in_app = Column(Boolean, default=True)
    notify_email = Column(Boolean, default=False)
    notify_voice = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")


class ParentStudentLink(Base):
    __tablename__ = "parent_student_links"
    __table_args__ = (
        UniqueConstraint("parent_id", "student_id", name="uq_parent_student"),
        Index("ix_parent_links_student_status", "student_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    relationship_type = Column(String(50), default="parent")  # father, mother, guardian
    status = Column(String(50), default="pending")  # pending, verified, rejected, revoked, expired
    verified_by_teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    verified_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)
    # A pending request reserves the student only until this moment. Approved
    # and rejected/revoked links clear it. The database partial unique index
    # (see database.enforce_single_active_parent) enforces at most one
    # pending-or-verified row per student.
    expires_at = Column(DateTime, nullable=True)
    verification_method = Column(String(50), default="teacher_assisted")  # teacher_assisted, invitation_code, voice_assisted
    school_name = Column(String(255), nullable=True)
    teacher_name = Column(String(255), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parent = relationship("User", foreign_keys=[parent_id])
    student = relationship("User", foreign_keys=[student_id])
    verified_by = relationship("User", foreign_keys=[verified_by_teacher_id])
    audit_logs = relationship("RelationshipAuditLog", back_populates="link", cascade="all, delete-orphan")


class ParentInvitation(Base):
    __tablename__ = "parent_invitations"

    id = Column(Integer, primary_key=True, index=True)
    code_hash = Column(String(64), unique=True, index=True, nullable=False)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role_target = Column(String(50), default="parent")
    relationship_type = Column(String(50), default="parent")
    preferred_language = Column(String(10), default="te")
    attempts_count = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    is_redeemed = Column(Boolean, default=False)
    redeemed_by_parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    redeemed_at = Column(DateTime, nullable=True)
    is_revoked = Column(Boolean, default=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    # When set, this invitation is an account-setup code for an existing
    # teacher-assisted parent account (the parent chooses their own password).
    target_parent_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    student = relationship("User", foreign_keys=[student_id])
    created_by = relationship("User", foreign_keys=[created_by_id])
    redeemed_by = relationship("User", foreign_keys=[redeemed_by_parent_id])
    target_parent = relationship("User", foreign_keys=[target_parent_id])


class RelationshipAuditLog(Base):
    __tablename__ = "relationship_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("parent_student_links.id"), nullable=False)
    # NULL means the system performed the action (for example an automatic
    # expiry); human actions always record the acting user.
    performed_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)  # created, credentials_setup, verified, rejected, revoked, reissued
    previous_status = Column(String(50), nullable=True)
    new_status = Column(String(50), nullable=False)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    link = relationship("ParentStudentLink", back_populates="audit_logs")
    performed_by = relationship("User")


class Concept(Base):
    __tablename__ = "concepts"

    id = Column(String(50), primary_key=True)  # e.g., 'c1', 'c2'
    code = Column(String(50), unique=True, index=True)
    grade = Column(Integer, default=8)
    subject = Column(String(100), default="Mathematics")
    chapter = Column(String(150), default="Rational Numbers")
    title_en = Column(String(255), nullable=False)
    title_te = Column(String(255), nullable=False)
    prerequisite_id = Column(String(50), ForeignKey("concepts.id"), nullable=True)
    sequence_order = Column(Integer, default=0)
    description = Column(Text, nullable=True)

    prerequisite = relationship("Concept", remote_side=[id])
    questions = relationship("Question", back_populates="concept", foreign_keys="[Question.concept_id]")


class Question(Base):
    __tablename__ = "questions"

    id = Column(String(50), primary_key=True)  # e.g., 'Q1', 'Q2'
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=False)
    prerequisite_id = Column(String(50), ForeignKey("concepts.id"), nullable=True)
    grade = Column(Integer, default=8)
    difficulty = Column(Integer, default=2)  # 1: Easy, 2: Medium, 3: Hard
    stem_en = Column(Text, nullable=False)
    stem_te = Column(Text, nullable=False)
    
    # JSON encoded list of options:
    # [{"text_en": str, "text_te": str, "misconception_tag": str|null, "explanation_en": str|null, "explanation_te": str|null}]
    options_json = Column(Text, nullable=False)
    correct_index = Column(Integer, nullable=False)
    
    hint_en = Column(Text, nullable=True)
    hint_te = Column(Text, nullable=True)
    worked_example_en = Column(Text, nullable=True)
    worked_example_te = Column(Text, nullable=True)
    
    status = Column(String(50), default="draft")  # draft, reviewed, published, archived
    current_version = Column(Integer, default=1)
    is_translation_verified = Column(Boolean, default=False)
    created_by = Column(String(100), default="system")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    concept = relationship("Concept", foreign_keys=[concept_id], back_populates="questions")
    prerequisite = relationship("Concept", foreign_keys=[prerequisite_id])
    versions = relationship("QuestionVersion", back_populates="question", cascade="all, delete-orphan")
    reports = relationship("CorrectionReport", back_populates="question", cascade="all, delete-orphan")

    def get_options(self):
        try:
            return json.loads(self.options_json)
        except Exception:
            return []

    def set_options(self, opts):
        self.options_json = json.dumps(opts)


class QuestionVersion(Base):
    __tablename__ = "question_versions"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(String(50), ForeignKey("questions.id"), nullable=False)
    version_num = Column(Integer, nullable=False)
    snapshot_json = Column(Text, nullable=False)
    change_note = Column(String(255), nullable=True)
    created_by = Column(String(100), default="system")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    question = relationship("Question", back_populates="versions")


class CorrectionReport(Base):
    __tablename__ = "correction_reports"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(String(50), ForeignKey("questions.id"), nullable=False)
    reporter_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reporter_name = Column(String(150), default="Teacher/Student")
    issue_type = Column(String(100), nullable=False)  # typo, ambiguity, wrong_key, bad_translation, other
    description = Column(Text, nullable=False)
    status = Column(String(50), default="open")  # open, under_review, resolved, rejected
    resolution_notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)

    question = relationship("Question", back_populates="reports")


class Attempt(Base):
    __tablename__ = "attempts"

    id = Column(String(64), primary_key=True)  # Client UUID for deduplication and idempotent sync
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    question_id = Column(String(50), nullable=False)
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=False)
    selected_index = Column(Integer, nullable=False)
    is_correct = Column(Boolean, nullable=False)
    hints_used = Column(Integer, default=0)
    time_spent_sec = Column(Float, default=0.0)
    misconception_tag = Column(String(255), nullable=True)
    attempt_source = Column(String(50), default="practice")  # practice, detective_main, detective_followup, detective_reassess
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    synced_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="attempts")
    concept = relationship("Concept")


class ConceptMastery(Base):
    __tablename__ = "concept_masteries"
    __table_args__ = (UniqueConstraint("user_id", "concept_id", name="uq_user_concept"),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=False)
    mastery_score = Column(Float, default=0.3)
    bkt_p = Column(Float, default=0.3)
    rule_level = Column(Integer, default=1)
    streak_correct = Column(Integer, default=0)
    streak_wrong = Column(Integer, default=0)
    last_path = Column(String(100), default="Focused practice")
    last_reason = Column(String(255), default="Initial baseline state")
    attempts_count = Column(Integer, default=0)
    last_attempt_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="masteries")
    concept = relationship("Concept")


class TeacherActionCard(Base):
    __tablename__ = "teacher_action_cards"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    student_name = Column(String(150), default="Learner")
    concept_id = Column(String(50), nullable=False)
    concept_title = Column(String(255), nullable=False)
    observation = Column(Text, nullable=False)
    triggering_rule = Column(String(255), nullable=False)
    suggested_action = Column(Text, nullable=False)
    reassessment_status = Column(String(50), default="pending")  # pending, recovered, failed
    status = Column(String(50), default="pending")  # pending, accepted, edited, dismissed, completed
    notes = Column(Text, nullable=True)
    is_sample = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    student = relationship("User", back_populates="action_cards")


class TeacherConfig(Base):
    __tablename__ = "teacher_configs"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    up_streak_threshold = Column(Integer, default=2)
    down_streak_threshold = Column(Integer, default=2)
    help_streak_threshold = Column(Integer, default=3)
    misconception_percent_threshold = Column(Integer, default=30)
    bkt_p0 = Column(Float, default=0.30)
    bkt_transition = Column(Float, default=0.15)
    bkt_slip = Column(Float, default=0.10)
    bkt_guess = Column(Float, default=0.25)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class DiagnosticRecord(Base):
    __tablename__ = "diagnostic_records"

    id = Column(String(64), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=False)
    case_id = Column(String(100), nullable=False)
    original_question = Column(Text, nullable=False)
    student_response = Column(Text, nullable=False)
    suspected_misconception = Column(String(255), nullable=False)
    diagnostic_question = Column(Text, nullable=True)
    followup_response = Column(Text, nullable=True)
    confirmation_status = Column(String(50), default="pending")  # pending, confirmed, refuted_slip, mastered
    confidence_level = Column(String(50), default="Medium")  # Low, Medium, High
    supporting_evidence = Column(Text, nullable=True)
    recommended_intervention = Column(Text, nullable=True)
    reassessment_question = Column(Text, nullable=True)
    reassessment_response = Column(Text, nullable=True)
    reassessment_result = Column(String(50), default="pending")  # pending, recovered, persistent
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="diagnostic_records")
    concept = relationship("Concept")


# ---------------------------------------------------------------------------
# Phase 4: Parent notifications and parent-teacher communication
# ---------------------------------------------------------------------------
class ParentNotification(Base):
    __tablename__ = "parent_notifications"
    __table_args__ = (
        Index("ix_parent_notifications_parent_read", "parent_id", "is_read"),
        Index("ix_parent_notifications_dedup", "parent_id", "dedup_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=True)
    message_id = Column(Integer, ForeignKey("parent_teacher_messages.id"), nullable=True)
    category = Column(String(40), default="learning_support")  # learning_support, teacher_message, meeting, general
    trigger_type = Column(String(60), nullable=False)  # repeated_mistakes, low_mastery, no_improvement, decline, teacher_reply
    severity = Column(String(20), default="support")  # info, support
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    language = Column(String(10), default="te")
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    in_app_delivered = Column(Boolean, default=True)
    email_status = Column(String(30), default="not_requested")  # not_requested, not_configured, sent, failed
    email_sent_at = Column(DateTime, nullable=True)
    dedup_key = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parent = relationship("User", foreign_keys=[parent_id])
    student = relationship("User", foreign_keys=[student_id])
    concept = relationship("Concept")


class TeacherNotification(Base):
    """In-app notification for a teacher when a verified parent writes.

    Mirrors :class:`ParentNotification` so unread counts and notification
    history use the same pattern on both sides of a conversation. Teacher
    accounts have no separate verified contact channel, so notifications are
    in-app only; email is never sent to an unverified address.
    """
    __tablename__ = "teacher_notifications"
    __table_args__ = (
        Index("ix_teacher_notifications_teacher_read", "teacher_id", "is_read"),
        Index("ix_teacher_notifications_dedup", "teacher_id", "dedup_key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    message_id = Column(Integer, ForeignKey("parent_teacher_messages.id"), nullable=True)
    reply_id = Column(Integer, ForeignKey("message_replies.id"), nullable=True)
    category = Column(String(40), default="parent_message")  # parent_message, parent_reply
    title = Column(String(255), nullable=False)
    body = Column(Text, nullable=False)
    language = Column(String(10), default="en")
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    in_app_delivered = Column(Boolean, default=True)
    dedup_key = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    teacher = relationship("User", foreign_keys=[teacher_id])
    parent = relationship("User", foreign_keys=[parent_id])
    student = relationship("User", foreign_keys=[student_id])


class ParentTeacherMessage(Base):
    __tablename__ = "parent_teacher_messages"
    __table_args__ = (
        Index("ix_parent_messages_teacher_status", "teacher_id", "status"),
        Index("ix_parent_messages_student", "student_id", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    category = Column(String(40), default="question")  # question, learning_difficulty, support_request, meeting_request, general
    subject = Column(String(150), nullable=False)
    body = Column(Text, nullable=False)
    # Who wrote the opening message in ``body``. Existing rows were always
    # parent-initiated, so the default preserves history.
    initiated_by_role = Column(String(20), default="parent", nullable=False)
    status = Column(String(20), default="open")  # open, replied, resolved
    parent_read_at = Column(DateTime, nullable=True)
    teacher_read_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, default=datetime.datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    parent = relationship("User", foreign_keys=[parent_id])
    teacher = relationship("User", foreign_keys=[teacher_id])
    student = relationship("User", foreign_keys=[student_id])
    replies = relationship(
        "MessageReply",
        back_populates="message",
        cascade="all, delete-orphan",
        order_by="MessageReply.created_at",
    )


class MessageReply(Base):
    __tablename__ = "message_replies"
    __table_args__ = (Index("ix_message_replies_message", "message_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("parent_teacher_messages.id"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    author_role = Column(String(20), nullable=False)  # parent, teacher
    body = Column(Text, nullable=False)
    recommended_activity = Column(Text, nullable=True)
    meeting_requested = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    message = relationship("ParentTeacherMessage", back_populates="replies")
    author = relationship("User")


# ---------------------------------------------------------------------------
# Phase 5: ParentConnect weekly progress reports
# ---------------------------------------------------------------------------
class ParentContact(Base):
    """Verified delivery contact for one parent account.

    A parent registers either email or SMS (never both). Any change to the
    selected channel, email address, or phone number resets ``is_verified`` and
    requires a fresh OTP, so unverified contacts can never receive reports.
    """
    __tablename__ = "parent_contacts"
    __table_args__ = (
        UniqueConstraint("parent_id", name="uq_parent_contact_parent"),
        Index("ix_parent_contacts_verified", "is_verified", "weekly_reports_enabled"),
    )

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    guardian_name = Column(String(255), nullable=True)
    relationship_type = Column(String(50), default="parent")
    contact_type = Column(String(20), default="email")  # email, sms
    email = Column(String(255), nullable=True)
    phone = Column(String(30), nullable=True)
    is_verified = Column(Boolean, default=False)
    verification_method = Column(String(40), nullable=True)  # email_otp, sms_otp
    verified_at = Column(DateTime, nullable=True)
    otp_hash = Column(String(128), nullable=True)
    otp_expires_at = Column(DateTime, nullable=True)
    otp_sent_at = Column(DateTime, nullable=True)
    otp_attempts = Column(Integer, default=0)
    notification_consent = Column(Boolean, default=True)
    weekly_reports_enabled = Column(Boolean, default=True)
    last_otp_channel = Column(String(20), nullable=True)
    # Secure email address change support
    pending_email = Column(String(255), nullable=True)
    pending_email_otp_hash = Column(String(128), nullable=True)
    pending_email_otp_expires_at = Column(DateTime, nullable=True)
    pending_email_otp_sent_at = Column(DateTime, nullable=True)
    pending_email_otp_attempts = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    parent = relationship("User")


class ParentNotificationPreference(Base):
    __tablename__ = "parent_notification_preferences"
    __table_args__ = (UniqueConstraint("parent_id", name="uq_parent_notification_pref_parent"),)

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    frequency = Column(String(20), default="weekly")  # weekly (only supported cadence)
    enabled = Column(Boolean, default=True)
    preferred_channel = Column(String(20), default="email")  # email, sms
    report_language = Column(String(10), default="en")  # te, en, hi
    delivery_day = Column(String(20), default="Sunday")
    delivery_time = Column(String(10), default="18:00")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    parent = relationship("User")


class WeeklyProgressReport(Base):
    __tablename__ = "weekly_progress_reports"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "parent_id", "week_start", "week_end",
            name="uq_weekly_report_student_parent_week",
        ),
        Index("ix_weekly_reports_parent_week", "parent_id", "week_start"),
        Index("ix_weekly_reports_student_week", "student_id", "week_start"),
        Index("ix_weekly_reports_delivery_status", "delivery_status"),
        Index("ix_weekly_reports_public_token", "public_token"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    week_start = Column(Date, nullable=False)
    week_end = Column(Date, nullable=False)
    report_data = Column(Text, nullable=False)
    delivery_channel = Column(String(20), nullable=True)
    delivery_status = Column(String(30), default="pending")
    # pending, sent, failed, not_configured, skipped_unverified,
    # skipped_consent, skipped_disabled, skipped_no_contact
    sent_at = Column(DateTime, nullable=True)
    last_error = Column(String(500), nullable=True)
    public_token = Column(String(128), nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    token_revoked_at = Column(DateTime, nullable=True)
    generated_by = Column(String(50), default="scheduler")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    student = relationship("User", foreign_keys=[student_id])
    parent = relationship("User", foreign_keys=[parent_id])


class NotificationLog(Base):
    __tablename__ = "notification_logs"
    __table_args__ = (Index("ix_notification_logs_report", "report_id", "created_at"),)

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("weekly_progress_reports.id"), nullable=True, index=True)
    recipient = Column(String(255), nullable=True)
    channel = Column(String(20), nullable=False)
    provider_message_id = Column(String(255), nullable=True)
    status = Column(String(30), nullable=False)
    error_message = Column(String(500), nullable=True)
    retry_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    report = relationship("WeeklyProgressReport")


class ParentRevocationOtp(Base):
    """OTP issued to a parent when a student requests removal of parental access.

    The connection is NOT revoked until the parent proves they received the OTP.
    One active pending revocation per parent-student pair is allowed at a time.
    """
    __tablename__ = "parent_revocation_otps"
    __table_args__ = (
        Index("ix_revocation_otp_link_status", "link_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    link_id = Column(Integer, ForeignKey("parent_student_links.id"), nullable=False, index=True)
    # Redundant denormalised columns so we can query without joining:
    parent_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    # Stored as HMAC-SHA256(user_id || otp) – never the raw value.
    otp_hash = Column(String(128), nullable=False)
    status = Column(String(20), default="pending")  # pending, confirmed, expired, cancelled
    attempts = Column(Integer, default=0)
    max_attempts = Column(Integer, default=5)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    confirmed_at = Column(DateTime, nullable=True)
    # Student who requested; kept for the audit trail.
    requested_by_student_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    link = relationship("ParentStudentLink", foreign_keys=[link_id])
    parent = relationship("User", foreign_keys=[parent_id])
    student = relationship("User", foreign_keys=[student_id])
    requested_by = relationship("User", foreign_keys=[requested_by_student_id])


class SchedulerJobRun(Base):
    """Cross-process lock for the weekly ParentConnect job.

    A unique ``(job_name, run_key)`` row means only one application instance
    can run a given reporting week. Stale leases can be safely taken over.
    """
    __tablename__ = "scheduler_job_runs"
    __table_args__ = (
        UniqueConstraint("job_name", "run_key", name="uq_scheduler_job_run"),
        Index("ix_scheduler_job_status", "job_name", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    job_name = Column(String(80), nullable=False)
    run_key = Column(String(80), nullable=False)
    status = Column(String(20), default="running")  # running, completed, failed
    instance_id = Column(String(64), nullable=True)
    attempts = Column(Integer, default=0)
    started_at = Column(DateTime, default=datetime.datetime.utcnow)
    heartbeat_at = Column(DateTime, default=datetime.datetime.utcnow)
    finished_at = Column(DateTime, nullable=True)
    details = Column(Text, nullable=True)



# ============================================================================
# AI COURSE & ENGAGEMENT ORCHESTRATOR MODELS (Phase 8)
# ============================================================================

class UploadedCourseMaterial(Base):
    __tablename__ = "uploaded_course_materials"
    __table_args__ = (
        Index("ix_uploaded_materials_teacher_class", "teacher_id", "class_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    subject = Column(String(100), default="Mathematics")
    title = Column(String(200), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_type = Column(String(20), nullable=False)  # pdf, docx, pptx, txt, md
    file_size = Column(Integer, default=0)
    file_path = Column(String(500), nullable=False)
    preferred_language = Column(String(10), default="en")
    sessions_count = Column(Integer, default=5)
    learning_objectives_input = Column(Text, nullable=True)
    status = Column(String(30), default="uploaded")  # uploaded, parsing, processed, failed
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    teacher = relationship("User", foreign_keys=[teacher_id])
    extracted_content = relationship("ExtractedCourseContent", uselist=False, back_populates="material", cascade="all, delete-orphan")
    course_plans = relationship("CoursePlan", back_populates="material")


class ExtractedCourseContent(Base):
    __tablename__ = "extracted_course_contents"

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("uploaded_course_materials.id"), nullable=False, unique=True, index=True)
    raw_text = Column(Text, nullable=False)
    clean_text = Column(Text, nullable=False)
    toc_json = Column(Text, nullable=True)  # JSON: list of chapters & page numbers
    chapters_json = Column(Text, nullable=True)  # JSON: list of extracted chapters/subtopics
    concepts_detected_json = Column(Text, nullable=True)  # JSON: detected concepts
    prerequisites_json = Column(Text, nullable=True)  # JSON: detected prerequisites
    source_metadata_json = Column(Text, nullable=True)  # JSON: page counts, headers, source refs
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    material = relationship("UploadedCourseMaterial", back_populates="extracted_content")


class CoursePlan(Base):
    __tablename__ = "course_plans"
    __table_args__ = (
        Index("ix_course_plans_teacher_class", "teacher_id", "class_name"),
        Index("ix_course_plans_status", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("uploaded_course_materials.id"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    subject = Column(String(100), default="Mathematics")
    title_en = Column(String(200), nullable=False)
    title_te = Column(String(200), nullable=False)
    description_en = Column(Text, nullable=True)
    description_te = Column(Text, nullable=True)
    status = Column(String(30), default="draft")  # draft, approved, published, archived
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    total_sessions = Column(Integer, default=5)
    estimated_hours = Column(Float, default=2.5)
    pedagogical_notes = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    published_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    teacher = relationship("User", foreign_keys=[teacher_id])
    material = relationship("UploadedCourseMaterial", back_populates="course_plans")
    lessons = relationship("CourseLesson", back_populates="course_plan", cascade="all, delete-orphan", order_by="CourseLesson.sequence_order")
    assignments = relationship("StudentLearningAssignment", back_populates="course_plan", cascade="all, delete-orphan")


class CourseLesson(Base):
    __tablename__ = "course_lessons"
    __table_args__ = (
        Index("ix_course_lessons_plan_seq", "course_plan_id", "sequence_order"),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_plan_id = Column(Integer, ForeignKey("course_plans.id"), nullable=False, index=True)
    sequence_order = Column(Integer, default=1)
    title_en = Column(String(200), nullable=False)
    title_te = Column(String(200), nullable=False)
    chapter_name = Column(String(150), nullable=True)
    topic_name = Column(String(150), nullable=True)
    summary_en = Column(Text, nullable=True)
    summary_te = Column(Text, nullable=True)
    estimated_minutes = Column(Integer, default=15)
    prerequisites_json = Column(Text, nullable=True)  # JSON list
    objectives_json = Column(Text, nullable=True)  # JSON list of goals
    checkpoints_json = Column(Text, nullable=True)  # JSON list of checkpoints
    practice_activities_json = Column(Text, nullable=True)  # JSON list of exercises
    assessments_json = Column(Text, nullable=True)  # JSON list of assessment questions
    source_reference = Column(String(255), nullable=True)  # e.g. Page 12-14
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    course_plan = relationship("CoursePlan", back_populates="lessons")
    assignments = relationship("StudentLearningAssignment", back_populates="lesson", cascade="all, delete-orphan")


class CourseKnowledgeChunk(Base):
    __tablename__ = "course_knowledge_chunks"
    __table_args__ = (
        Index("ix_knowledge_material_class", "material_id", "class_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    material_id = Column(Integer, ForeignKey("uploaded_course_materials.id"), nullable=False, index=True)
    course_plan_id = Column(Integer, ForeignKey("course_plans.id"), nullable=True, index=True)
    lesson_id = Column(Integer, ForeignKey("course_lessons.id"), nullable=True, index=True)
    class_name = Column(String(50), nullable=False)
    subject = Column(String(100), default="Mathematics")
    chapter = Column(String(150), nullable=True)
    concept_tag = Column(String(100), nullable=True)
    page_number = Column(Integer, default=1)
    chunk_index = Column(Integer, default=0)
    content_text = Column(Text, nullable=False)
    embedding_json = Column(Text, nullable=True)  # JSON float array for vector similarity
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    material = relationship("UploadedCourseMaterial")


class StudentLearningAssignment(Base):
    __tablename__ = "student_learning_assignments"
    __table_args__ = (
        Index("ix_assignments_student_status", "student_id", "status"),
        Index("ix_assignments_plan_student", "course_plan_id", "student_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_plan_id = Column(Integer, ForeignKey("course_plans.id"), nullable=False, index=True)
    lesson_id = Column(Integer, ForeignKey("course_lessons.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    status = Column(String(25), default="assigned")  # assigned, in_progress, completed, overdue, skipped
    progress_pct = Column(Integer, default=0)
    time_spent_minutes = Column(Integer, default=0)
    assigned_at = Column(DateTime, default=datetime.datetime.utcnow)
    due_date = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, nullable=True)

    course_plan = relationship("CoursePlan", back_populates="assignments")
    lesson = relationship("CourseLesson", back_populates="assignments")
    student = relationship("User", foreign_keys=[student_id])


class StudentActivityEvent(Base):
    __tablename__ = "student_activity_events"
    __table_args__ = (
        Index("ix_events_student_created", "student_id", "created_at"),
        Index("ix_events_type", "event_type"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    course_plan_id = Column(Integer, ForeignKey("course_plans.id"), nullable=True)
    lesson_id = Column(Integer, ForeignKey("course_lessons.id"), nullable=True)
    event_type = Column(String(40), nullable=False)  # lesson_opened, practice_submitted, assessment_completed, session_heartbeat, question_attempt
    metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("User", foreign_keys=[student_id])


class EngagementAlert(Base):
    __tablename__ = "engagement_alerts"
    __table_args__ = (
        Index("ix_engagement_alerts_student", "student_id", "is_resolved"),
        Index("ix_engagement_alerts_class", "class_name", "is_resolved"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    class_name = Column(String(50), nullable=False)
    alert_type = Column(String(40), nullable=False)  # inactive_days, incomplete_lesson, repeated_misconception, declining_performance, milestone_missed
    severity = Column(String(15), default="medium")  # low, medium, high
    details_json = Column(Text, nullable=True)
    is_resolved = Column(Boolean, default=False)
    resolved_at = Column(DateTime, nullable=True)
    resolution_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("User", foreign_keys=[student_id])
    teacher = relationship("User", foreign_keys=[teacher_id])


class LearningIntervention(Base):
    __tablename__ = "learning_interventions"
    __table_args__ = (
        Index("ix_interventions_teacher_status", "teacher_id", "status"),
        Index("ix_interventions_class", "class_name", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    class_name = Column(String(50), nullable=False)
    intervention_type = Column(String(30), default="classroom_campaign")  # individual, classroom_campaign
    target_misconception = Column(String(100), nullable=False)
    concept_id = Column(String(50), ForeignKey("concepts.id"), nullable=True)
    title_en = Column(String(200), nullable=False)
    title_te = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    remedial_plan_json = Column(Text, nullable=True)  # JSON: lesson steps, worked examples, practice questions
    recommended_action = Column(Text, nullable=True)
    status = Column(String(25), default="proposed")  # proposed, approved, active, completed, dismissed
    affected_students_count = Column(Integer, default=0)
    class_size = Column(Integer, default=0)
    affected_ratio = Column(Float, default=0.0)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    teacher = relationship("User", foreign_keys=[teacher_id])
    concept = relationship("Concept", foreign_keys=[concept_id])
    participants = relationship("InterventionParticipant", back_populates="intervention", cascade="all, delete-orphan")


class InterventionParticipant(Base):
    __tablename__ = "intervention_participants"
    __table_args__ = (
        Index("ix_intervention_participants_student", "student_id", "status"),
    )

    id = Column(Integer, primary_key=True, index=True)
    intervention_id = Column(Integer, ForeignKey("learning_interventions.id"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    pre_mastery_score = Column(Float, default=0.3)
    post_mastery_score = Column(Float, nullable=True)
    status = Column(String(25), default="assigned")  # assigned, in_progress, completed, evaluated
    assigned_activity_json = Column(Text, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    intervention = relationship("LearningIntervention", back_populates="participants")
    student = relationship("User", foreign_keys=[student_id])


class StudentNotification(Base):
    __tablename__ = "student_notifications"
    __table_args__ = (
        Index("ix_student_notifications_student_read", "student_id", "is_read"),
        Index("ix_student_notifications_category", "category"),
    )

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title_en = Column(String(200), nullable=False)
    title_te = Column(String(200), nullable=False)
    body_en = Column(Text, nullable=False)
    body_te = Column(Text, nullable=False)
    category = Column(String(40), nullable=False)  # course_published, reminder_inactive, reminder_incomplete, intervention_assigned, revision_ready, achievement
    action_url = Column(String(255), nullable=True)
    action_payload_json = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime, nullable=True)
    is_snoozed = Column(Boolean, default=False)
    snoozed_until = Column(DateTime, nullable=True)
    priority = Column(String(15), default="normal")  # normal, high
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    student = relationship("User", foreign_keys=[student_id])


class AgentTask(Base):
    __tablename__ = "agent_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_name = Column(String(100), unique=True, nullable=False)
    task_type = Column(String(50), nullable=False)
    status = Column(String(25), default="idle")  # idle, running, completed, failed
    last_run_at = Column(DateTime, nullable=True)
    next_run_at = Column(DateTime, nullable=True)
    config_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AgentExecutionLog(Base):
    __tablename__ = "agent_execution_logs"
    __table_args__ = (
        Index("ix_agent_logs_agent_name", "agent_name", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("agent_tasks.id"), nullable=True)
    agent_name = Column(String(80), nullable=False)
    action_taken = Column(String(200), nullable=False)
    entities_affected_count = Column(Integer, default=0)
    details_json = Column(Text, nullable=True)
    status = Column(String(20), default="success")  # success, partial, failure
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
