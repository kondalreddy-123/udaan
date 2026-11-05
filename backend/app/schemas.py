from pydantic import BaseModel, Field, field_validator
from typing import List, Optional, Any, Dict
import datetime

SUPPORTED_LANGUAGES = ("te", "en", "hi")
SUPPORTED_RELATIONSHIPS = ("mother", "father", "guardian", "parent")
SUPPORTED_CONTACT_METHODS = ("in_app", "sms", "whatsapp", "school_record", "phone_call")


def _validated_language(value: Optional[str], fallback: str = "te") -> str:
    if value is None:
        return fallback
    clean = str(value).strip().lower()
    if clean not in SUPPORTED_LANGUAGES:
        raise ValueError("preferred_language must be one of: te, en, hi")
    return clean


def _validated_relationship(value: Optional[str]) -> str:
    if value is None:
        return "parent"
    clean = str(value).strip().lower()
    if clean not in SUPPORTED_RELATIONSHIPS:
        raise ValueError("relationship_type must be one of: mother, father, guardian, parent")
    return clean

# --- Auth Schemas ---
class UserBase(BaseModel):
    email: str
    full_name: str
    role: str = "student"
    class_name: Optional[str] = "Class 8 - Section A"
    grade: Optional[int] = 8

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class StudentRegisterRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6, description="Password must be at least 6 characters")
    full_name: str = Field(..., min_length=2)
    class_name: Optional[str] = "Class 8 - Section A"
    grade: Optional[int] = 8

class ParentRegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=255)
    email: str = Field(..., max_length=255)
    password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)
    connection_code: Optional[str] = None
    student_connection_code: Optional[str] = None
    school_name: Optional[str] = None
    teacher_name: Optional[str] = None
    teacher_details: Optional[str] = None

class ParentVerifyOtpRequest(BaseModel):
    email: str = Field(..., max_length=255)
    otp: str = Field(..., min_length=4, max_length=12)

class ParentResendOtpRequest(BaseModel):
    email: str = Field(..., max_length=255)

class ParentForgotPasswordRequest(BaseModel):
    email: str = Field(..., max_length=255)

class ParentResetPasswordRequest(BaseModel):
    email: str = Field(..., max_length=255)
    otp: str = Field(..., min_length=4, max_length=12)
    new_password: str = Field(..., min_length=6, max_length=128)
    confirm_password: str = Field(..., min_length=6, max_length=128)

class ConnectStudentRequest(BaseModel):
    invitation_code: str = Field(..., min_length=4, max_length=64)
    relationship_type: Optional[str] = "parent"
    school_name: Optional[str] = None
    teacher_name: Optional[str] = None
    teacher_details: Optional[str] = None

class StudentParentConnectionResponse(BaseModel):
    id: int
    parent_id: int
    parent_name: str
    parent_email: Optional[str] = None
    relationship_type: str = "parent"
    status: str
    email_verified: bool = False
    school_name: Optional[str] = None
    teacher_name: Optional[str] = None
    display_status: Optional[str] = None
    created_at: datetime.datetime
    verified_at: Optional[datetime.datetime] = None

class ParentEmailChangeRequest(BaseModel):
    new_email: str = Field(..., max_length=255)

class ParentEmailChangeVerifyRequest(BaseModel):
    otp: str = Field(..., min_length=4, max_length=12)

class TeacherCreateRequest(BaseModel):
    email: str
    password: str = Field(..., min_length=6, description="Initial teacher password")
    full_name: str = Field(..., min_length=2)
    class_name: Optional[str] = "Class 8 - Section A"
    grade: Optional[int] = 8

class TeacherStatusUpdate(BaseModel):
    is_active: bool

class TeacherResponse(BaseModel):
    id: int
    email: str
    full_name: str
    role: str
    class_name: Optional[str] = None
    grade: Optional[int] = 8
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class AdminBootstrapRequest(BaseModel):
    email: str
    full_name: str
    password: str = Field(..., min_length=6)
    bootstrap_secret: Optional[str] = None

class DemoUserSwitch(BaseModel):
    role: str = "student"  # student, teacher, admin, author

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_by: Optional[str] = None
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class LogoutResponse(BaseModel):
    status: str = "success"
    message: str


# --- Parent Onboarding & Relationship Schemas ---
class ParentInvitationCreate(BaseModel):
    relationship_type: str = Field("parent", description="mother, father, guardian, parent")
    preferred_language: str = Field("te", description="te, en, hi")

    @field_validator("preferred_language")
    @classmethod
    def _v_lang(cls, v):
        return _validated_language(v)

    @field_validator("relationship_type")
    @classmethod
    def _v_rel(cls, v):
        return _validated_relationship(v)

class ParentInvitationResponse(BaseModel):
    id: int
    invitation_code: Optional[str] = None  # Revealed only once at creation time
    student_id: int
    student_name: str
    relationship_type: str
    preferred_language: str
    expires_at: datetime.datetime
    is_redeemed: bool
    is_revoked: bool = False
    is_expired: bool = False
    attempts_count: int = 0
    max_attempts: int = 5
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class ValidateInvitationRequest(BaseModel):
    code: str = Field(..., min_length=4, max_length=20)

class ValidateInvitationResponse(BaseModel):
    valid: bool
    student_first_name: str
    class_name: str
    preferred_language: str
    expires_at: datetime.datetime

class ParentOnboardingRequest(BaseModel):
    invitation_code: str
    parent_name: str = Field(..., min_length=2)
    email: str
    password: str = Field(..., min_length=6)
    phone_number: Optional[str] = None
    preferred_language: str = "te"  # te, en, hi
    relationship_type: str = "parent"
    contact_method: Optional[str] = "in_app"

    @field_validator("preferred_language")
    @classmethod
    def _v_lang(cls, v):
        return _validated_language(v)

    @field_validator("relationship_type")
    @classmethod
    def _v_rel(cls, v):
        return _validated_relationship(v)

class TeacherAssistedParentRequest(BaseModel):
    parent_name: str = Field(..., min_length=2)
    email: Optional[str] = None
    phone_number: Optional[str] = Field(None, min_length=5)
    password: Optional[str] = Field(None, min_length=6)
    preferred_language: str = "te"  # te, en, hi
    relationship_type: str = "parent"  # father, mother, guardian
    contact_method: str = "school_record"

    @field_validator("preferred_language")
    @classmethod
    def _v_lang(cls, v):
        return _validated_language(v)

    @field_validator("relationship_type")
    @classmethod
    def _v_rel(cls, v):
        return _validated_relationship(v)

class ParentStudentLinkResponse(BaseModel):
    id: int
    parent_id: int
    parent_name: str
    parent_email: str
    parent_phone: Optional[str] = None
    parent_preferred_language: Optional[str] = None
    student_id: int
    student_name: str
    student_class: str
    relationship_type: str
    status: str  # pending, verified, rejected, revoked
    verification_method: str  # teacher_assisted, invitation_code, voice_assisted
    verified_by_teacher_id: Optional[int] = None
    verified_at: Optional[datetime.datetime] = None
    revoked_at: Optional[datetime.datetime] = None
    notes: Optional[str] = None
    created_at: datetime.datetime
    # Returned ONCE when a teacher-assisted account is created without a
    # password. The parent redeems it to choose their own credentials.
    setup_code: Optional[str] = None

    model_config = {"from_attributes": True}

class LinkActionRequest(BaseModel):
    notes: Optional[str] = None

class ParentProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    phone_number: Optional[str] = None
    preferred_language: Optional[str] = None  # te, en, hi
    contact_method: Optional[str] = None  # in_app, sms, whatsapp
    notification_preference: Optional[str] = None  # placeholder preference
    notifications_consent: Optional[bool] = None
    notify_in_app: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_voice: Optional[bool] = None

    @field_validator("preferred_language")
    @classmethod
    def _v_lang(cls, v):
        return _validated_language(v, "te") if v is not None else None

class ParentLinkedChildSummary(BaseModel):
    link_id: int
    student_id: int
    student_name: str
    class_name: str
    grade: int
    relationship_type: str
    verification_status: str
    verification_method: str
    verified_at: Optional[datetime.datetime] = None

class ParentMeResponse(BaseModel):
    id: int
    full_name: str
    email: str
    role: str = "parent"
    phone_number: Optional[str] = None
    preferred_language: str = "te"
    contact_method: str = "in_app"
    is_verified: bool = False
    notification_preference: str = "not_configured"
    notifications_consent: bool = True
    notify_in_app: bool = True
    notify_email: bool = False
    notify_voice: bool = False
    email_notifications_available: bool = False
    linked_children: List[ParentLinkedChildSummary] = []

    model_config = {"from_attributes": True}

class ParentLinkActionResponse(BaseModel):
    status: str
    message: str

class ReissuedInvitationResponse(BaseModel):
    invitation_code: str
    student_id: int
    expires_at: datetime.datetime
    message: str


# --- Phase 4: Parent notifications & messaging ---
MESSAGE_CATEGORIES = (
    "question",
    "learning_difficulty",
    "support_request",
    "meeting_request",
    "general",
)

MESSAGE_STATUSES = ("open", "replied", "resolved")


def _validated_message_category(v: str) -> str:
    value = (v or "").strip().lower()
    if value not in MESSAGE_CATEGORIES:
        raise ValueError(f"category must be one of: {', '.join(MESSAGE_CATEGORIES)}")
    return value


class ParentNotificationResponse(BaseModel):
    id: int
    category: str
    trigger_type: str
    severity: str
    title: str
    body: str
    language: str
    is_read: bool
    read_at: Optional[datetime.datetime] = None
    student_id: int
    student_name: str
    concept_id: Optional[str] = None
    message_id: Optional[int] = None
    email_status: str = "not_requested"
    created_at: datetime.datetime


class NotificationPreferencesResponse(BaseModel):
    notifications_consent: bool = True
    notify_in_app: bool = True
    notify_email: bool = False
    notify_voice: bool = False
    email_notifications_available: bool = False
    preferred_language: str = "te"


class ParentChildTeacherResponse(BaseModel):
    student_id: int
    student_name: str
    class_name: str
    teacher_id: Optional[int] = None
    teacher_name: Optional[str] = None
    teacher_email: Optional[str] = None


class TeacherUnreadCountResponse(BaseModel):
    unread_messages: int = 0
    unread_notifications: int = 0


class ParentMessageCreate(BaseModel):
    student_id: int
    category: str = Field("question", description="question, learning_difficulty, support_request, meeting_request, general")
    subject: str = Field(..., min_length=2, max_length=150)
    body: str = Field(..., min_length=2, max_length=4000)

    @field_validator("category")
    @classmethod
    def _v_category(cls, v):
        return _validated_message_category(v)


class TeacherMessageCreate(BaseModel):
    """Teacher-initiated conversation with a student's verified guardian."""
    student_id: int
    parent_id: Optional[int] = Field(
        None, description="Optional explicit guardian id; defaults to the single verified guardian."
    )
    category: str = Field("general", description="question, learning_difficulty, support_request, meeting_request, general")
    subject: str = Field(..., min_length=2, max_length=150)
    body: str = Field(..., min_length=2, max_length=4000)
    recommended_activity: Optional[str] = Field(None, max_length=500)
    meeting_requested: bool = False

    @field_validator("category")
    @classmethod
    def _v_category(cls, v):
        return _validated_message_category(v)


class MessageReplyCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    recommended_activity: Optional[str] = Field(None, max_length=500)
    meeting_requested: bool = False


class MessageResolveRequest(BaseModel):
    resolution_note: Optional[str] = Field(None, max_length=1000)


class MessageReplyResponse(BaseModel):
    id: int
    author_id: int
    author_name: str
    author_role: str
    body: str
    recommended_activity: Optional[str] = None
    meeting_requested: bool = False
    created_at: datetime.datetime


class ParentMessageResponse(BaseModel):
    id: int
    parent_id: int
    parent_name: str
    teacher_id: int
    teacher_name: str
    student_id: int
    student_name: str
    category: str
    subject: str
    body: str
    initiated_by_role: str = "parent"
    status: str
    is_unread: bool = False
    parent_read_at: Optional[datetime.datetime] = None
    teacher_read_at: Optional[datetime.datetime] = None
    resolved_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    last_activity_at: datetime.datetime
    replies: List[MessageReplyResponse] = []


# ---------------------------------------------------------------------------
# Phase 5: ParentConnect verified contacts and weekly reports
# ---------------------------------------------------------------------------
class ParentContactRegisterRequest(BaseModel):
    contact_type: str = Field("email", description="email or sms")
    email: Optional[str] = Field(None, max_length=255)
    phone: Optional[str] = Field(None, max_length=30)
    guardian_name: Optional[str] = Field(None, max_length=255)
    relationship_type: Optional[str] = Field(None, max_length=50)
    notification_consent: bool = True
    weekly_reports_enabled: bool = True
    report_language: Optional[str] = Field(None, description="te, en, hi")

    @field_validator("contact_type")
    @classmethod
    def _v_contact_type(cls, v):
        value = (v or "").strip().lower()
        if value not in ("email", "sms"):
            raise ValueError("contact_type must be either 'email' or 'sms'")
        return value

    @field_validator("report_language")
    @classmethod
    def _v_report_language(cls, v):
        if v is None:
            return v
        value = str(v).strip().lower()
        if value not in SUPPORTED_LANGUAGES:
            raise ValueError("report_language must be one of: te, en, hi")
        return value


class ParentContactOtpRequest(BaseModel):
    otp: str = Field(..., min_length=4, max_length=12)


class ParentContactResponse(BaseModel):
    registered: bool
    guardian_name: Optional[str] = None
    relationship_type: Optional[str] = None
    contact_type: Optional[str] = None
    destination: Optional[str] = None
    is_verified: bool = False
    verification_method: Optional[str] = None
    verified_at: Optional[datetime.datetime] = None
    notification_consent: bool = False
    weekly_reports_enabled: bool = False
    preferred_channel: Optional[str] = None
    report_language: Optional[str] = None
    otp_pending: bool = False
    otp_sent_at: Optional[datetime.datetime] = None
    otp_delivery_status: Optional[str] = None
    provider_configured: Optional[bool] = None
    message: Optional[str] = None


class ParentConnectPreferencesUpdate(BaseModel):
    enabled: Optional[bool] = None
    preferred_channel: Optional[str] = Field(None, description="email or sms")
    report_language: Optional[str] = Field(None, description="te, en, hi")
    notification_consent: Optional[bool] = None
    weekly_reports_enabled: Optional[bool] = None
    delivery_day: Optional[str] = Field(None, description="Day of week, e.g. Sunday")
    delivery_time: Optional[str] = Field(None, description="Time of day, e.g. 18:00")

    @field_validator("preferred_channel")
    @classmethod
    def _v_preferred_channel(cls, v):
        if v is None:
            return v
        value = str(v).strip().lower()
        if value not in ("email", "sms"):
            raise ValueError("preferred_channel must be either 'email' or 'sms'")
        return value

    @field_validator("report_language")
    @classmethod
    def _v_pref_language(cls, v):
        if v is None:
            return v
        value = str(v).strip().lower()
        if value not in SUPPORTED_LANGUAGES:
            raise ValueError("report_language must be one of: te, en, hi")
        return value


class ParentConnectPreferencesResponse(BaseModel):
    enabled: bool = True
    frequency: str = "weekly"
    preferred_channel: str = "email"
    report_language: str = "en"
    delivery_day: str = "Sunday"
    delivery_time: str = "18:00"
    notification_consent: bool = True
    weekly_reports_enabled: bool = True
    contact: ParentContactResponse
    email_provider: str = "not_configured"
    sms_provider: str = "not_configured"
    next_run_at_ist: Optional[str] = None
    last_report_sent_at: Optional[str] = None
    last_delivery_status: Optional[str] = None


class WeeklyReportSummaryResponse(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    week_start: datetime.date
    week_end: datetime.date
    week_label: Optional[str] = None
    inactive: bool = False
    activity: Dict[str, Any] = {}
    delivery_channel: Optional[str] = None
    delivery_status: str = "pending"
    sent_at: Optional[datetime.datetime] = None
    created_at: datetime.datetime
    generated_by: str = "scheduler"
    recommendation_source: Optional[str] = None


class WeeklyReportDetailResponse(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    class_name: Optional[str] = None
    week_start: str
    week_end: str
    week_label: Optional[str] = None
    language: str = "en"
    inactive: bool = False
    activity: Dict[str, Any] = {}
    topics: List[Dict[str, Any]] = []
    strengths: List[str] = []
    improvements: List[str] = []
    needs_practice: List[str] = []
    recommendations: List[str] = []
    recommendation_source: Optional[str] = None
    previous_week: Optional[Dict[str, Any]] = None
    comparison: Optional[Dict[str, Any]] = None
    diagnostic_sessions: int = 0
    generated_at: Optional[str] = None
    delivery_channel: Optional[str] = None
    delivery_status: str = "pending"
    sent_at: Optional[datetime.datetime] = None
    generated_by: str = "scheduler"
    public_link_active: bool = False
    token_expires_at: Optional[datetime.datetime] = None


class WeeklyReportGenerateRequest(BaseModel):
    student_id: Optional[int] = None
    week_start: Optional[datetime.date] = None
    week_end: Optional[datetime.date] = None
    deliver: bool = True


class ParentConnectPublicReportResponse(BaseModel):
    id: int
    student_name: Optional[str] = None
    class_name: Optional[str] = None
    week_start: str
    week_end: str
    week_label: Optional[str] = None
    language: str = "en"
    inactive: bool = False
    activity: Dict[str, Any] = {}
    topics: List[Dict[str, Any]] = []
    strengths: List[str] = []
    improvements: List[str] = []
    needs_practice: List[str] = []
    recommendations: List[str] = []
    recommendation_source: Optional[str] = None
    previous_week: Optional[Dict[str, Any]] = None
    comparison: Optional[Dict[str, Any]] = None
    generated_at: Optional[str] = None
    token_expires_at: Optional[datetime.datetime] = None


class ParentConnectStatusResponse(BaseModel):
    email_provider: str
    email_configured: bool
    sms_provider: str
    sms_configured: bool
    scheduler_enabled: bool
    scheduler_running: bool = False
    schedule: str
    timezone_offset_minutes: int
    report_link_days: int
    next_run_at_ist: Optional[str] = None
    next_reporting_week_start: Optional[str] = None
    next_reporting_week_end: Optional[str] = None


# --- Phase 5 student bridge: a student sets up ParentConnect for a verified parent ---
class StudentParentRefRequest(BaseModel):
    parent_id: int = Field(..., gt=0, description="A parent account already verified for this student")


class StudentParentContactRequest(ParentContactRegisterRequest):
    """Same contact rules as the parent flow, scoped to one verified parent."""

    parent_id: int = Field(..., gt=0, description="A parent account already verified for this student")


class StudentParentContactOtpRequest(ParentContactOtpRequest):
    parent_id: int = Field(..., gt=0, description="A parent account already verified for this student")


class StudentParentConnectPreferencesUpdate(ParentConnectPreferencesUpdate):
    parent_id: int = Field(..., gt=0, description="A parent account already verified for this student")


class StudentParentLinkStatus(BaseModel):
    parent_id: int
    parent_name: str
    parent_email: Optional[str] = None
    relationship_type: Optional[str] = None
    status: str
    verified_at: Optional[datetime.datetime] = None
    can_manage: bool = False
    contact: ParentContactResponse
    delivery_eligible: bool = False
    delivery_reason: Optional[str] = None
    delivery_channel: Optional[str] = None
    latest_report: Optional[WeeklyReportSummaryResponse] = None


class StudentParentConnectOverviewResponse(BaseModel):
    student_id: int
    student_name: str
    links: List[StudentParentLinkStatus] = []
    verified_link_count: int = 0
    has_verified_link: bool = False
    provider_ready: bool = False
    email_provider: str = "not_configured"
    email_configured: bool = False
    sms_provider: str = "not_configured"
    sms_configured: bool = False
    scheduler_enabled: bool = False
    schedule: str = ""
    next_run_at_ist: Optional[str] = None
    next_reporting_week_start: Optional[str] = None
    next_reporting_week_end: Optional[str] = None


# --- Concept Schemas ---
class ConceptResponse(BaseModel):
    id: str
    code: Optional[str] = None
    grade: int
    subject: str
    chapter: str
    title_en: str
    title_te: str
    prerequisite_id: Optional[str] = None
    sequence_order: int
    description: Optional[str] = None

    model_config = {"from_attributes": True}


# --- Question & Content Schemas ---
class OptionSchema(BaseModel):
    text_en: str
    text_te: str
    is_correct: bool = False
    misconception_tag: Optional[str] = None
    explanation_en: Optional[str] = None
    explanation_te: Optional[str] = None

class QuestionBase(BaseModel):
    concept_id: str
    prerequisite_id: Optional[str] = None
    grade: int = 8
    difficulty: int = 2
    stem_en: str
    stem_te: str
    options: List[OptionSchema]
    correct_index: int
    hint_en: Optional[str] = None
    hint_te: Optional[str] = None
    worked_example_en: Optional[str] = None
    worked_example_te: Optional[str] = None
    is_translation_verified: bool = False

class QuestionCreate(QuestionBase):
    id: str

class QuestionUpdate(BaseModel):
    concept_id: Optional[str] = None
    prerequisite_id: Optional[str] = None
    grade: Optional[int] = None
    difficulty: Optional[int] = None
    stem_en: Optional[str] = None
    stem_te: Optional[str] = None
    options: Optional[List[OptionSchema]] = None
    correct_index: Optional[int] = None
    hint_en: Optional[str] = None
    hint_te: Optional[str] = None
    worked_example_en: Optional[str] = None
    worked_example_te: Optional[str] = None
    status: Optional[str] = None
    change_note: Optional[str] = "Question updated"
    is_translation_verified: Optional[bool] = None

class QuestionVersionResponse(BaseModel):
    id: int
    question_id: str
    version_num: int
    change_note: Optional[str] = None
    created_by: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class QuestionResponse(BaseModel):
    id: str
    concept_id: str
    prerequisite_id: Optional[str] = None
    grade: int
    difficulty: int
    stem_en: str
    stem_te: str
    options: List[OptionSchema]
    correct_index: int
    hint_en: Optional[str] = None
    hint_te: Optional[str] = None
    worked_example_en: Optional[str] = None
    worked_example_te: Optional[str] = None
    status: str
    current_version: int
    is_translation_verified: bool
    created_by: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    versions: List[QuestionVersionResponse] = []

    model_config = {"from_attributes": True}

class CorrectionReportCreate(BaseModel):
    question_id: str
    issue_type: str = Field(..., description="typo, ambiguity, wrong_key, bad_translation, other")
    description: str

class CorrectionReportResponse(BaseModel):
    id: int
    question_id: str
    reporter_id: Optional[int]
    reporter_name: str
    issue_type: str
    description: str
    status: str
    resolution_notes: Optional[str]
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


# --- Attempt & Sync Schemas ---
class AttemptItem(BaseModel):
    id: str = Field(..., description="Client-generated UUID for idempotency")
    question_id: str
    concept_id: str
    selected_index: int
    is_correct: bool
    hints_used: int = 0
    time_spent_sec: float = 0.0
    misconception_tag: Optional[str] = None
    attempt_source: str = "practice"
    created_at: Optional[datetime.datetime] = None

class AttemptSyncBatch(BaseModel):
    attempts: List[AttemptItem]

class AttemptSyncResponse(BaseModel):
    synced_count: int
    duplicates_skipped: int
    current_masteries: Dict[str, Dict[str, Any]]
    status: str = "success"


# --- Concept Mastery Schemas ---
class ConceptMasteryResponse(BaseModel):
    concept_id: str
    concept_title_en: str
    concept_title_te: str
    mastery_score: float
    bkt_p: float
    bkt_band: str
    rule_level: int
    streak_correct: int
    streak_wrong: int
    last_path: str
    last_reason: str

    model_config = {"from_attributes": True}


# --- Teacher Dashboard Schemas ---
class TeacherActionCardResponse(BaseModel):
    id: int
    user_id: Optional[int]
    student_name: str
    concept_id: str
    concept_title: str
    observation: str
    triggering_rule: str
    suggested_action: str
    reassessment_status: str
    status: str
    notes: Optional[str]
    is_sample: bool
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class TeacherActionCardUpdate(BaseModel):
    status: Optional[str] = None  # accepted, edited, dismissed, completed
    suggested_action: Optional[str] = None
    notes: Optional[str] = None

class TeacherConfigSchema(BaseModel):
    up_streak_threshold: int = 2
    down_streak_threshold: int = 2
    help_streak_threshold: int = 3
    misconception_percent_threshold: int = 30
    bkt_p0: float = 0.30
    bkt_transition: float = 0.15
    bkt_slip: float = 0.10
    bkt_guess: float = 0.25


# --- Detective Request/Response Schemas ---
class DetectivePrimarySubmit(BaseModel):
    option_index: int
    attempt_id: Optional[str] = None
    time_spent_sec: float = 0.0

class DetectiveFollowupSubmit(BaseModel):
    is_correct: bool
    attempt_id: Optional[str] = None
    time_spent_sec: float = 0.0

class DetectiveReassessmentSubmit(BaseModel):
    option_index: int
    attempt_id: Optional[str] = None
    time_spent_sec: float = 0.0

class DiagnosticRecordResponse(BaseModel):
    id: str
    user_id: int
    concept_id: str
    case_id: str
    original_question: str
    student_response: str
    suspected_misconception: str
    diagnostic_question: Optional[str] = None
    followup_response: Optional[str] = None
    confirmation_status: str
    confidence_level: str
    supporting_evidence: Optional[str] = None
    recommended_intervention: Optional[str] = None
    reassessment_question: Optional[str] = None
    reassessment_response: Optional[str] = None
    reassessment_result: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

# --- Student Profile & Teacher Reports ---
class StudentReportSummary(BaseModel):
    id: int
    full_name: str
    email: str
    class_name: str
    overall_mastery: float
    bkt_band: str
    active_tier: str
    attempts_count: int
    recent_misconceptions: List[str]
    needs_attention: bool
    recommended_action: str

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# OTP-based parent access revocation (Part 3)
# ---------------------------------------------------------------------------
class RevocationRequestResponse(BaseModel):
    """Returned when a student successfully initiates OTP-based revocation."""
    revocation_id: int
    link_id: int
    parent_email_masked: str   # e.g. "pa***@example.com" – never the full address
    otp_sent: bool
    expires_at: datetime.datetime
    message: str


class RevocationOtpVerifyRequest(BaseModel):
    """Parent submits the OTP they received to confirm access removal."""
    link_id: int = Field(..., description="ID of the parent-student link to revoke")
    otp: str = Field(..., min_length=4, max_length=12)


class RevocationStatusResponse(BaseModel):
    revocation_id: Optional[int] = None
    link_id: int
    status: str            # pending | confirmed | expired | cancelled | none
    attempts: int = 0
    max_attempts: int = 5
    expires_at: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None


# ---------------------------------------------------------------------------
# Teacher student search (Part 4)
# ---------------------------------------------------------------------------
class StudentSearchResult(BaseModel):
    id: int
    full_name: str
    email: Optional[str] = None      # Only shown when teacher is authorised
    class_name: Optional[str] = None
    grade: Optional[int] = None
    overall_mastery: float = 0.0
    overall_mastery_pct: int = 0
    accuracy_pct: int = 0
    total_attempts: int = 0
    last_active: Optional[datetime.datetime] = None
    days_since_active: Optional[int] = None
    needs_attention: bool = False
    attention_reasons: List[str] = []
    bkt_band: str = "Foundational"
    is_active_recent: bool = False   # active in last 14 days

    model_config = {"from_attributes": True}


class StudentSearchResponse(BaseModel):
    results: List[StudentSearchResult]
    total: int
    page: int
    page_size: int
    total_pages: int
    query: Optional[str] = None
    filters_applied: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Student teacher search (Part 6)
# ---------------------------------------------------------------------------
class TeacherSearchResult(BaseModel):
    id: int
    full_name: str
    class_name: Optional[str] = None
    grade: Optional[int] = None
    email: Optional[str] = None      # Only exposed to students in that class

    model_config = {"from_attributes": True}


class TeacherSearchResponse(BaseModel):
    results: List[TeacherSearchResult]
    total: int


# ---------------------------------------------------------------------------
# Parent connected child lookup (Part 5)
# ---------------------------------------------------------------------------
class ParentConnectedChildDetail(BaseModel):
    student_id: int
    full_name: str
    class_name: Optional[str] = None
    grade: Optional[int] = None
    link_id: int
    link_status: str
    email_verified: bool          # Is parent email verified?
    connection_display_status: str  # Human-readable composite status
    school_name: Optional[str] = None
    teacher_name: Optional[str] = None
    has_pending_revocation: bool = False
    connected_at: Optional[datetime.datetime] = None
    verified_at: Optional[datetime.datetime] = None
    overall_mastery: Optional[float] = None
    overall_mastery_pct: Optional[int] = None
    accuracy_pct: Optional[int] = None
    last_active: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}



# ---------------------------------------------------------------------------
# AI Course & Engagement Orchestrator Schemas (Phase 8)
# ---------------------------------------------------------------------------

class CourseMaterialResponse(BaseModel):
    id: int
    teacher_id: int
    class_name: str
    subject: str
    title: str
    file_name: str
    file_type: str
    file_size: int
    preferred_language: str
    sessions_count: int
    status: str
    error_message: Optional[str] = None
    created_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class CourseLessonResponse(BaseModel):
    id: int
    course_plan_id: int
    sequence_order: int
    title_en: str
    title_te: str
    chapter_name: Optional[str] = None
    topic_name: Optional[str] = None
    summary_en: Optional[str] = None
    summary_te: Optional[str] = None
    estimated_minutes: int
    prerequisites_json: Optional[str] = None
    objectives_json: Optional[str] = None
    checkpoints_json: Optional[str] = None
    practice_activities_json: Optional[str] = None
    assessments_json: Optional[str] = None
    source_reference: Optional[str] = None
    created_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class CoursePlanResponse(BaseModel):
    id: int
    material_id: Optional[int] = None
    teacher_id: int
    class_name: str
    subject: str
    title_en: str
    title_te: str
    description_en: Optional[str] = None
    description_te: Optional[str] = None
    status: str
    start_date: Optional[datetime.datetime] = None
    end_date: Optional[datetime.datetime] = None
    total_sessions: int
    estimated_hours: float
    pedagogical_notes: Optional[str] = None
    approved_at: Optional[datetime.datetime] = None
    published_at: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None
    lessons: List[CourseLessonResponse] = []

    model_config = {"from_attributes": True}


class CoursePlanUpdate(BaseModel):
    title_en: Optional[str] = None
    title_te: Optional[str] = None
    description_en: Optional[str] = None
    description_te: Optional[str] = None
    start_date: Optional[datetime.datetime] = None
    end_date: Optional[datetime.datetime] = None
    pedagogical_notes: Optional[str] = None


class CourseLessonUpdate(BaseModel):
    title_en: Optional[str] = None
    title_te: Optional[str] = None
    topic_name: Optional[str] = None
    summary_en: Optional[str] = None
    summary_te: Optional[str] = None
    estimated_minutes: Optional[int] = None
    source_reference: Optional[str] = None


class EngagementAlertResponse(BaseModel):
    id: int
    student_id: int
    student_name: Optional[str] = None
    class_name: str
    alert_type: str
    severity: str
    details_json: Optional[str] = None
    is_resolved: bool
    resolved_at: Optional[datetime.datetime] = None
    resolution_note: Optional[str] = None
    created_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class LearningInterventionResponse(BaseModel):
    id: int
    teacher_id: int
    class_name: str
    intervention_type: str
    target_misconception: str
    concept_id: Optional[str] = None
    title_en: str
    title_te: str
    description: Optional[str] = None
    remedial_plan_json: Optional[str] = None
    recommended_action: Optional[str] = None
    status: str
    affected_students_count: int
    class_size: int
    affected_ratio: float
    approved_at: Optional[datetime.datetime] = None
    created_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class StudentAssignmentResponse(BaseModel):
    id: int
    course_plan_id: int
    lesson_id: int
    lesson_title_en: Optional[str] = None
    lesson_title_te: Optional[str] = None
    chapter_name: Optional[str] = None
    status: str
    progress_pct: int
    time_spent_minutes: int
    due_date: Optional[datetime.datetime] = None
    assigned_at: Optional[datetime.datetime] = None
    started_at: Optional[datetime.datetime] = None
    completed_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}


class StudentNotificationResponse(BaseModel):
    id: int
    student_id: int
    title_en: str
    title_te: str
    body_en: str
    body_te: str
    category: str
    action_url: Optional[str] = None
    action_payload_json: Optional[str] = None
    is_read: bool
    read_at: Optional[datetime.datetime] = None
    is_snoozed: bool
    snoozed_until: Optional[datetime.datetime] = None
    priority: str
    created_at: Optional[datetime.datetime] = None

    model_config = {"from_attributes": True}
