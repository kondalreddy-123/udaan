import pytest
import uuid
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import User, Concept, ConceptMastery, Attempt
from app.auth import hash_password, verify_password, create_access_token, decode_token
from app.schemas import AttemptItem, AttemptSyncBatch
from app.routers.attempts import sync_attempts

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed user and concepts
    u = User(id=1, email="student@udaan.edu", hashed_password=hash_password("udaan123"), full_name="Student", role="student")
    session.add(u)

    c0 = Concept(id="c0", grade=8, subject="Math", chapter="Rationals", title_en="Integers", title_te="పూర్ణాంకాలు", sequence_order=0)
    c5 = Concept(id="c5", grade=8, subject="Math", chapter="Rationals", title_en="Adding", title_te="కూడిక", sequence_order=5)
    session.add_all([c0, c5])

    cm0 = ConceptMastery(user_id=1, concept_id="c0", mastery_score=0.8, bkt_p=0.8, rule_level=2)
    cm5 = ConceptMastery(user_id=1, concept_id="c5", mastery_score=0.25, bkt_p=0.25, rule_level=1)
    session.add_all([cm0, cm5])

    session.commit()
    yield session
    session.close()

def test_auth_hashing_and_jwt():
    raw_pwd = "safePassword2026"
    hashed = hash_password(raw_pwd)
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("wrongPassword", hashed) is False

    token = create_access_token({"sub": "student@udaan.edu", "role": "student"})
    payload = decode_token(token)
    assert payload is not None
    assert payload["sub"] == "student@udaan.edu"
    assert payload["role"] == "student"

def test_sync_queue_idempotency_and_concept_isolation(db_session):
    u = db_session.query(User).filter(User.id == 1).first()
    attempt_uuid = str(uuid.uuid4())

    item = AttemptItem(
        id=attempt_uuid,
        question_id="Q1",
        concept_id="c5",
        selected_index=0,
        is_correct=True,
        hints_used=0,
        time_spent_sec=12.5,
        attempt_source="practice"
    )

    batch1 = AttemptSyncBatch(attempts=[item])
    res1 = sync_attempts(batch1, db=db_session, user=u)
    assert res1["synced_count"] == 1
    assert res1["duplicates_skipped"] == 0

    # c5 mastery must have increased
    cm5 = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c5").first()
    assert cm5.bkt_p > 0.25
    assert cm5.streak_correct == 1

    # c0 mastery MUST be unaffected!
    cm0 = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c0").first()
    assert cm0.bkt_p == 0.8
    assert cm0.streak_correct == 0

    # Repeat exact same sync batch (testing offline sync re-try / duplicate protection)
    batch2 = AttemptSyncBatch(attempts=[item])
    res2 = sync_attempts(batch2, db=db_session, user=u)
    assert res2["synced_count"] == 0
    assert res2["duplicates_skipped"] == 1

    # Mastery must NOT be double-counted!
    cm5_after = db_session.query(ConceptMastery).filter(ConceptMastery.concept_id == "c5").first()
    assert cm5_after.bkt_p == cm5.bkt_p
    assert cm5_after.streak_correct == 1
