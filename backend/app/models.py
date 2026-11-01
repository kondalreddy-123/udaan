import datetime
import json
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, UniqueConstraint
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
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    attempts = relationship("Attempt", back_populates="user", cascade="all, delete-orphan")
    masteries = relationship("ConceptMastery", back_populates="user", cascade="all, delete-orphan")
    action_cards = relationship("TeacherActionCard", back_populates="student", cascade="all, delete-orphan")
    diagnostic_records = relationship("DiagnosticRecord", back_populates="user", cascade="all, delete-orphan")


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

