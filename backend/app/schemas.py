from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
import datetime

# --- Auth Schemas ---
class UserBase(BaseModel):
    email: str
    full_name: str
    role: str = "student"

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    email: str
    password: str

class DemoUserSwitch(BaseModel):
    role: str = "student"  # student, teacher, admin

class UserResponse(UserBase):
    id: int
    is_active: bool
    created_at: datetime.datetime

    model_config = {"from_attributes": True}

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


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

