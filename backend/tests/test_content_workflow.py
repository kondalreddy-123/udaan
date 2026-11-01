import pytest
import json
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models import Question, Concept, User
from app.routers.questions import validate_for_publication

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()

    # Seed test concept
    c = Concept(id="c5", grade=8, subject="Math", chapter="Rationals", title_en="Adding", title_te="కూడిక", sequence_order=5)
    session.add(c)
    session.commit()
    yield session
    session.close()

def test_validation_fails_on_incomplete_question(db_session):
    # Question with untagged distractor and no Telugu stem
    q = Question(
        id="TEST_Q",
        concept_id="c5",
        stem_en="What is 1/2 + 1/2?",
        stem_te="",  # Missing Telugu!
        options_json=json.dumps([
            {"text_en": "1", "text_te": "1", "is_correct": True},
            {"text_en": "2/4", "text_te": "2/4", "is_correct": False, "misconception_tag": None, "explanation_en": None, "explanation_te": None}
        ]),
        correct_index=0,
        hint_en="Think about pizza slices",
        hint_te="",  # Missing Telugu hint!
        worked_example_en="1/2 + 1/2 = 1",
        worked_example_te="1/2 + 1/2 = 1",
        status="draft"
    )
    db_session.add(q)
    db_session.commit()

    errors = validate_for_publication(q, db_session)
    assert len(errors) >= 3
    assert any("Telugu question stem" in e for e in errors)
    assert any("lacks a misconception tag" in e for e in errors)
    assert any("Bilingual hints" in e for e in errors)

def test_validation_passes_on_complete_reviewed_question(db_session):
    q = Question(
        id="VALID_Q",
        concept_id="c5",
        stem_en="What is 1/2 + 1/4?",
        stem_te="1/2 + 1/4 ఎంత?",
        options_json=json.dumps([
            {"text_en": "3/4", "text_te": "3/4", "is_correct": True, "explanation_en": "Correct", "explanation_te": "సరైనది"},
            {"text_en": "2/6", "text_te": "2/6", "is_correct": False, "misconception_tag": "num_den_separate", "explanation_en": "Added separate", "explanation_te": "విడివిడిగా కూడారు"}
        ]),
        correct_index=0,
        hint_en="Find LCM",
        hint_te="క.సా.గు కనుగొనండి",
        worked_example_en="2/4 + 1/4 = 3/4",
        worked_example_te="2/4 + 1/4 = 3/4",
        status="draft"
    )
    db_session.add(q)
    db_session.commit()

    errors = validate_for_publication(q, db_session)
    assert len(errors) == 0
