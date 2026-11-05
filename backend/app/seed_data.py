import json
import datetime
import uuid
from sqlalchemy.orm import Session
from app.models import (
    User, Concept, Question, QuestionVersion, ConceptMastery,
    TeacherActionCard, TeacherConfig, Attempt, DiagnosticRecord,
    ParentProfile, ParentStudentLink
)
from app.auth import hash_password

def seed_database(db: Session):
    # 1. Users (Authentic Class 8 - Section A Cohort)
    cohort_users = [
        (1, "student@udaan.edu", "Aarav Sharma (Student)", "student", "Class 8 - Section A"),
        (2, "teacher@udaan.edu", "Dr. Lakshmi Rao (Teacher)", "teacher", "Class 8 - Section A"),
        (3, "admin@udaan.edu", "UDAAN Admin", "admin", "Class 8 - Section A"),
        (4, "diya@udaan.edu", "Diya Patel", "student", "Class 8 - Section A"),
        (5, "rohan@udaan.edu", "Rohan Verma", "student", "Class 8 - Section A"),
        (6, "ananya@udaan.edu", "Ananya Reddy", "student", "Class 8 - Section A"),
        (7, "kavya@udaan.edu", "Kavya Nair", "student", "Class 8 - Section A"),
        (8, "vihaan@udaan.edu", "Vihaan Rao", "student", "Class 8 - Section A"),
        (9, "arjun@udaan.edu", "Arjun Kumar", "student", "Class 8 - Section A"),
        (10, "priya@udaan.edu", "Priya Singh", "student", "Class 8 - Section A"),
        (11, "charan@udaan.edu", "Sai Charan", "student", "Class 8 - Section A"),
        (12, "meera@udaan.edu", "Meera Joshi", "student", "Class 8 - Section A"),
        (13, "sneha@udaan.edu", "Sneha Gupta", "student", "Class 8 - Section A"),
        (14, "aditya@udaan.edu", "Aditya Varma", "student", "Class 8 - Section A"),
        (15, "ritu@udaan.edu", "Ritu Shah", "student", "Class 8 - Section A"),
        (16, "author@udaan.edu", "Prof. R. Ramanujan (Author)", "author", "Class 8 - Section A"),
        (17, "parent@udaan.edu", "Sunita Sharma (Parent)", "parent", "Class 8 - Section A"),
    ]

    for uid, email, name, role, cname in cohort_users:
        u = db.query(User).filter(User.email == email).first()
        if not u:
            u_by_id = db.query(User).filter(User.id == uid).first()
            if u_by_id and u_by_id.email != email:
                u = User(
                    email=email,
                    hashed_password=hash_password("udaan123"),
                    full_name=name,
                    role=role,
                    class_name=cname,
                    grade=8,
                    created_by="system_seed"
                )
            else:
                u = User(
                    id=uid,
                    email=email,
                    hashed_password=hash_password("udaan123"),
                    full_name=name,
                    role=role,
                    class_name=cname,
                    grade=8,
                    created_by="system_seed"
                )
            db.add(u)
        else:
            u.full_name = name
            u.role = role
            if not u.class_name:
                u.class_name = cname
            # Rehash to Argon2id if using old hash format
            if not u.hashed_password.startswith("$argon2"):
                u.hashed_password = hash_password("udaan123")
    db.commit()

    # Seed Demo Parent Profile & Verified Link (Sunita Sharma -> Aarav Sharma)
    parent_user = db.query(User).filter(User.email == "parent@udaan.edu").first()
    student_user = db.query(User).filter(User.email == "student@udaan.edu").first()
    teacher_user = db.query(User).filter(User.email == "teacher@udaan.edu").first()

    if parent_user:
        p_prof = db.query(ParentProfile).filter(ParentProfile.user_id == parent_user.id).first()
        if not p_prof:
            p_prof = ParentProfile(
                user_id=parent_user.id,
                phone_number="9876543210",
                preferred_language="te",
                contact_method="in_app",
                is_verified=True
            )
            db.add(p_prof)
        else:
            p_prof.is_verified = True

        if student_user:
            p_link = db.query(ParentStudentLink).filter(
                ParentStudentLink.student_id == student_user.id
            ).first()
            if not p_link:
                p_link = ParentStudentLink(
                    parent_id=parent_user.id,
                    student_id=student_user.id,
                    relationship_type="mother",
                    status="verified",
                    verification_method="teacher_assisted",
                    verified_by_teacher_id=teacher_user.id if teacher_user else 2,
                    verified_at=datetime.datetime.utcnow(),
                    notes="Assisted registration by Dr. Lakshmi Rao (School verification)"
                )
                db.add(p_link)
            else:
                p_link.parent_id = parent_user.id
                p_link.status = "verified"
                if not p_link.verified_at:
                    p_link.verified_at = datetime.datetime.utcnow()
    db.commit()

    # 2. Concepts (NCERT Class 8 Mathematics: Rational Numbers)
    concepts_data = [
        ("c0", "INT-01", "Integers & Directed Numbers", "పూర్ణాంకాలు & సంఖ్యా రేఖ", None, 0, "Basic integer addition/subtraction on number line"),
        ("c1", "FRAC-01", "Fractions & Equivalent Forms", "భిన్నాలు & సమాన రూపాలు", "c0", 1, "Understanding numerator/denominator and equivalent fractions"),
        ("c2", "LCM-01", "LCM & Common Denominators", "క.సా.గు & ఉమ్మడి హారాలు", "c1", 2, "Finding Least Common Multiple to equalize fraction denominators"),
        ("c3", "RAT-01", "Rational Number Meaning (p/q, q!=0)", "అకరణీయ సంఖ్యల అర్థం (p/q, q!=0)", "c1", 3, "Definition and representation of rational numbers"),
        ("c4", "RAT-02", "Comparing Rational Numbers", "అకరణీయ సంఖ్యల పోలిక", "c3", 4, "Comparing magnitudes of positive and negative rationals"),
        ("c5", "RAT-03", "Adding Rationals with Unlike Denominators", "వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల కూడిక", "c2", 5, "Multi-step addition involving LCM conversion and signed arithmetic"),
        ("c6", "RAT-04", "Multiplication & Division of Rationals", "అకరణీయ సంఖ్యల గుణకారం & భాగహారం", "c5", 6, "Multiplying numerators/denominators and reciprocal division")
    ]

    for cid, code, t_en, t_te, prereq, seq, desc in concepts_data:
        if not db.query(Concept).filter(Concept.id == cid).first():
            c = Concept(
                id=cid,
                code=code,
                grade=8,
                subject="Mathematics",
                chapter="Rational Numbers",
                title_en=t_en,
                title_te=t_te,
                prerequisite_id=prereq,
                sequence_order=seq,
                description=desc
            )
            db.add(c)
    db.commit()

    # 3. Questions
    questions_data = [
        {
            "id": "Q1",
            "concept_id": "c5",
            "prerequisite_id": "c2",
            "grade": 8,
            "difficulty": 2,
            "stem_en": "Evaluate: (-3/4) + (1/2) = ?",
            "stem_te": "గణించండి: (-3/4) + (1/2) = ?",
            "options": [
                {
                    "text_en": "-1/4",
                    "text_te": "-1/4",
                    "is_correct": True,
                    "misconception_tag": None,
                    "explanation_en": "Correct. Convert 1/2 to 2/4. (-3 + 2)/4 = -1/4.",
                    "explanation_te": "సరైనది. 1/2 ను 2/4 గా మార్చండి. (-3 + 2)/4 = -1/4."
                },
                {
                    "text_en": "-1/3",
                    "text_te": "-1/3",
                    "is_correct": False,
                    "misconception_tag": "num_den_separate",
                    "explanation_en": "Suspected: Added numerators and denominators separately: (-3+1)/(4+2) = -2/6 = -1/3.",
                    "explanation_te": "లవాలు మరియు హారాలను విడివిడిగా కూడారు: (-3+1)/(4+2) = -2/6 = -1/3."
                },
                {
                    "text_en": "5/4",
                    "text_te": "5/4",
                    "is_correct": False,
                    "misconception_tag": "ignored_negative",
                    "explanation_en": "Suspected: Ignored negative sign while converting: (3/4) + (2/4) = 5/4.",
                    "explanation_te": "రుణ గుర్తును విస్మరించారు: (3/4) + (2/4) = 5/4."
                },
                {
                    "text_en": "1/4",
                    "text_te": "1/4",
                    "is_correct": False,
                    "misconception_tag": "sign_slip",
                    "explanation_en": "Suspected: Sign calculation error in final answer (+1/4 instead of -1/4).",
                    "explanation_te": "గుర్తు గణనలో పొరపాటు (+1/4 కి బదులుగా -1/4 ఉండాలి)."
                }
            ],
            "correct_index": 0,
            "hint_en": "Convert fractions to a common denominator using the LCM of 4 and 2 before adding.",
            "hint_te": "కూడే ముందు 4 మరియు 2 ల క.సా.గు ఉపయోగించి భిన్నాలను ఉమ్మడి హారంలోకి మార్చండి.",
            "worked_example_en": "1. LCM(4, 2) = 4.\n2. 1/2 = (1×2)/(2×2) = 2/4.\n3. (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.",
            "worked_example_te": "1. క.సా.గు(4, 2) = 4.\n2. 1/2 = (1×2)/(2×2) = 2/4.\n3. (-3/4) + (2/4) = (-3 + 2)/4 = -1/4.",
            "status": "published",
            "is_translation_verified": True
        },
        {
            "id": "Q2",
            "concept_id": "c5",
            "prerequisite_id": "c2",
            "grade": 8,
            "difficulty": 2,
            "stem_en": "Evaluate: (-1/2) + (1/4) = ?",
            "stem_te": "గణించండి: (-1/2) + (1/4) = ?",
            "options": [
                {
                    "text_en": "-1/4",
                    "text_te": "-1/4",
                    "is_correct": True,
                    "misconception_tag": None,
                    "explanation_en": "Correct. -1/2 becomes -2/4. Then (-2 + 1)/4 = -1/4.",
                    "explanation_te": "సరైనది. -1/2 అనేది -2/4 అవుతుంది. (-2 + 1)/4 = -1/4."
                },
                {
                    "text_en": "-2/6",
                    "text_te": "-2/6",
                    "is_correct": False,
                    "misconception_tag": "num_den_separate",
                    "explanation_en": "Added tops and bottoms separately: (-1+1) / (2+4).",
                    "explanation_te": "లవాలు మరియు హారాలను విడివిడిగా కూడారు."
                },
                {
                    "text_en": "3/4",
                    "text_te": "3/4",
                    "is_correct": False,
                    "misconception_tag": "ignored_negative",
                    "explanation_en": "Ignored negative sign: calculated 2/4 + 1/4 = 3/4.",
                    "explanation_te": "రుణ గుర్తును విస్మరించారు: 2/4 + 1/4 = 3/4 గా లెక్కించారు."
                },
                {
                    "text_en": "1/4",
                    "text_te": "1/4",
                    "is_correct": False,
                    "misconception_tag": "sign_slip",
                    "explanation_en": "Sign slip: positive numerator instead of negative.",
                    "explanation_te": "గుర్తు గణనలో పొరపాటు."
                }
            ],
            "correct_index": 0,
            "hint_en": "Express both fractions with denominator 4.",
            "hint_te": "రెండు భిన్నాలను హారం 4 తో వ్యక్తపరచండి.",
            "worked_example_en": "(-1/2) = (-2/4). (-2/4) + (1/4) = (-2 + 1)/4 = -1/4.",
            "worked_example_te": "(-1/2) = (-2/4). (-2/4) + (1/4) = (-2 + 1)/4 = -1/4.",
            "status": "published",
            "is_translation_verified": True
        },
        {
            "id": "Q3",
            "concept_id": "c5",
            "prerequisite_id": "c2",
            "grade": 8,
            "difficulty": 3,
            "stem_en": "Evaluate: (-5/6) + (1/3) = ?",
            "stem_te": "గణించండి: (-5/6) + (1/3) = ?",
            "options": [
                {
                    "text_en": "-1/2",
                    "text_te": "-1/2",
                    "is_correct": True,
                    "misconception_tag": None,
                    "explanation_en": "Correct. Convert 1/3 to 2/6. (-5+2)/6 = -3/6 = -1/2.",
                    "explanation_te": "సరైనది. 1/3 ను 2/6 గా మార్చండి. (-5+2)/6 = -3/6 = -1/2."
                },
                {
                    "text_en": "-4/9",
                    "text_te": "-4/9",
                    "is_correct": False,
                    "misconception_tag": "num_den_separate",
                    "explanation_en": "Added tops and bottoms: (-5+1)/(6+3) = -4/9.",
                    "explanation_te": "లవాలు మరియు హారాలను విడివిడిగా కూడారు: (-5+1)/(6+3) = -4/9."
                },
                {
                    "text_en": "-7/6",
                    "text_te": "-7/6",
                    "is_correct": False,
                    "misconception_tag": "subtraction_error",
                    "explanation_en": "Subtracted 2 from -5 to get -7/6 instead of adding +2.",
                    "explanation_te": "+2 కూడడానికి బదులుగా తీసివేత చేశారు."
                }
            ],
            "correct_index": 0,
            "hint_en": "LCM of 6 and 3 is 6. Rewrite 1/3 as 2/6.",
            "hint_te": "6 మరియు 3 ల క.సా.గు 6. 1/3 ను 2/6 గా రాయండి.",
            "worked_example_en": "(-5/6) + (2/6) = (-5 + 2)/6 = -3/6 = -1/2.",
            "worked_example_te": "(-5/6) + (2/6) = (-5 + 2)/6 = -3/6 = -1/2.",
            "status": "published",
            "is_translation_verified": True
        },
        {
            "id": "Q4",
            "concept_id": "c1",
            "prerequisite_id": "c0",
            "grade": 8,
            "difficulty": 1,
            "stem_en": "What is 1/2 + 1/4?",
            "stem_te": "1/2 + 1/4 ఎంత?",
            "options": [
                {
                    "text_en": "3/4",
                    "text_te": "3/4",
                    "is_correct": True,
                    "misconception_tag": None,
                    "explanation_en": "Correct: 2/4 + 1/4 = 3/4.",
                    "explanation_te": "సరైనది: 2/4 + 1/4 = 3/4."
                },
                {
                    "text_en": "2/6",
                    "text_te": "2/6",
                    "is_correct": False,
                    "misconception_tag": "num_den_separate",
                    "explanation_en": "Added (1+1)/(2+4) = 2/6.",
                    "explanation_te": "లవాలు మరియు హారాలను విడివిడిగా కూడారు: (1+1)/(2+4) = 2/6."
                },
                {
                    "text_en": "1/8",
                    "text_te": "1/8",
                    "is_correct": False,
                    "misconception_tag": "multiplied_denominators",
                    "explanation_en": "Multiplied instead of adding.",
                    "explanation_te": "కూడడానికి బదులుగా గుణించారు."
                }
            ],
            "correct_index": 0,
            "hint_en": "1/2 is equal to how many fourths?",
            "hint_te": "1/2 ఎన్ని నాల్గవ వంతులకు సమానం?",
            "worked_example_en": "1/2 = 2/4. 2/4 + 1/4 = 3/4.",
            "worked_example_te": "1/2 = 2/4. 2/4 + 1/4 = 3/4.",
            "status": "published",
            "is_translation_verified": True
        }
    ]

    for qd in questions_data:
        if not db.query(Question).filter(Question.id == qd["id"]).first():
            q = Question(
                id=qd["id"],
                concept_id=qd["concept_id"],
                prerequisite_id=qd["prerequisite_id"],
                grade=qd["grade"],
                difficulty=qd["difficulty"],
                stem_en=qd["stem_en"],
                stem_te=qd["stem_te"],
                options_json=json.dumps(qd["options"]),
                correct_index=qd["correct_index"],
                hint_en=qd["hint_en"],
                hint_te=qd["hint_te"],
                worked_example_en=qd["worked_example_en"],
                worked_example_te=qd["worked_example_te"],
                status=qd["status"],
                is_translation_verified=qd["is_translation_verified"],
                created_by="NCERT Curriculum Reviewer"
            )
            db.add(q)
            # Add initial version snapshot
            qv = QuestionVersion(
                question_id=qd["id"],
                version_num=1,
                snapshot_json=json.dumps(qd),
                change_note="Initial reviewed baseline seed",
                created_by="system"
            )
            db.add(qv)
    db.commit()

    # 4. Cohort Concept Masteries & Real Attempt History
    student_profiles = [
        # (uid, [c0, c1, c2, c3, c4, c5, c6])
        (1, [0.80, 0.50, 0.40, 0.60, 0.30, 0.25, 0.10]),   # Aarav (active demo learner)
        (4, [0.70, 0.35, 0.30, 0.45, 0.25, 0.28, 0.10]),   # Diya (struggling c5/c1)
        (5, [0.65, 0.55, 0.45, 0.50, 0.35, 0.54, 0.20]),   # Rohan (directed signs)
        (6, [0.90, 0.85, 0.80, 0.85, 0.75, 0.76, 0.65]),   # Ananya (high mastery)
        (7, [0.80, 0.65, 0.50, 0.70, 0.55, 0.62, 0.30]),   # Kavya (guided practice)
        (8, [0.95, 0.92, 0.90, 0.95, 0.88, 0.92, 0.85]),   # Vihaan (advanced extension)
        (9, [0.75, 0.60, 0.55, 0.65, 0.40, 0.48, 0.20]),   # Arjun (building)
        (10, [0.60, 0.40, 0.35, 0.50, 0.30, 0.32, 0.15]),  # Priya (needs intervention)
        (11, [0.70, 0.50, 0.45, 0.55, 0.40, 0.42, 0.18]),  # Charan (building)
        (12, [0.88, 0.82, 0.78, 0.85, 0.70, 0.74, 0.60]),  # Meera (secure)
        (13, [0.65, 0.45, 0.35, 0.40, 0.25, 0.30, 0.10]),  # Sneha (struggling)
        (14, [0.72, 0.58, 0.50, 0.62, 0.45, 0.50, 0.25]),  # Aditya (guided)
        (15, [0.80, 0.60, 0.55, 0.70, 0.50, 0.58, 0.30]),  # Ritu (building)
    ]

    concept_ids = ["c0", "c1", "c2", "c3", "c4", "c5", "c6"]

    for uid, scores in student_profiles:
        for cid, score in zip(concept_ids, scores):
            cm = db.query(ConceptMastery).filter(ConceptMastery.user_id == uid, ConceptMastery.concept_id == cid).first()
            lvl = 3 if score >= 0.75 else (2 if score >= 0.45 else 1)
            path = "Harder questions" if score >= 0.75 else ("Guided practice" if score >= 0.45 else "Tactile scaffolding")
            reason = "Demonstrated topic fluency" if score >= 0.75 else ("Progressing steadily" if score >= 0.45 else "Foundational review needed")
            if not cm:
                cm = ConceptMastery(
                    user_id=uid,
                    concept_id=cid,
                    mastery_score=score,
                    bkt_p=score,
                    rule_level=lvl,
                    streak_correct=2 if score >= 0.70 else (1 if score >= 0.40 else 0),
                    streak_wrong=0 if score >= 0.70 else (1 if score >= 0.40 else 2),
                    attempts_count=4 if score >= 0.70 else 2,
                    last_path=path,
                    last_reason=reason
                )
                db.add(cm)
            else:
                cm.mastery_score = score
                cm.bkt_p = score
    db.commit()

    # 5. Seed Real Cohort Attempts
    if db.query(Attempt).count() < 10:
        now = datetime.datetime.now(datetime.UTC).replace(tzinfo=None)
        seed_attempts = [
            # (id, uid, qid, cid, idx, is_correct, tag, source, days_ago)
            ("att_demo_01", 1, "Q1", "c5", 1, False, "num_den_separate", "practice", 2),
            ("att_demo_02", 1, "Q4", "c1", 0, True, None, "practice", 2),
            ("att_demo_03", 1, "Q1", "c5", 0, True, None, "detective_main", 1),
            ("att_diya_01", 4, "Q1", "c5", 1, False, "num_den_separate", "practice", 3),
            ("att_diya_02", 4, "DET-Q1", "c5", 1, False, "num_den_separate", "detective_main", 3),
            ("att_diya_03", 4, "DET-FU", "c5", 1, False, "num_den_separate", "detective_followup", 3),
            ("att_rohan_01", 5, "Q1", "c5", 2, False, "ignored_negative", "practice", 4),
            ("att_rohan_02", 5, "Q2", "c5", 2, False, "ignored_negative", "practice", 4),
            ("att_ananya_01", 6, "Q1", "c5", 0, True, None, "practice", 1),
            ("att_ananya_02", 6, "Q3", "c5", 0, True, None, "practice", 1),
            ("att_vihaan_01", 8, "Q1", "c5", 0, True, None, "practice", 1),
            ("att_vihaan_02", 8, "Q3", "c5", 0, True, None, "practice", 1),
            ("att_priya_01", 10, "Q1", "c5", 1, False, "num_den_separate", "practice", 2),
            ("att_priya_02", 10, "Q2", "c5", 1, False, "num_den_separate", "practice", 2),
            ("att_charan_01", 11, "Q1", "c5", 3, False, "sign_slip", "practice", 3),
            ("att_sneha_01", 13, "Q1", "c5", 1, False, "num_den_separate", "practice", 5),
            ("att_aditya_01", 14, "Q1", "c5", 0, True, None, "practice", 2),
            ("att_ritu_01", 15, "Q1", "c5", 0, True, None, "practice", 2),
        ]
        for aid, uid, qid, cid, idx, is_cor, tag, src, days in seed_attempts:
            att = Attempt(
                id=aid,
                user_id=uid,
                question_id=qid,
                concept_id=cid,
                selected_index=idx,
                is_correct=is_cor,
                hints_used=1 if not is_cor else 0,
                time_spent_sec=35.0,
                misconception_tag=tag,
                attempt_source=src,
                created_at=now - datetime.timedelta(days=days)
            )
            db.add(att)
        db.commit()

    # 6. Seed Baseline Diagnostic Records
    if db.query(DiagnosticRecord).count() == 0:
        diag1 = DiagnosticRecord(
            id="diag_seed_diya_c5",
            user_id=4,
            concept_id="c5",
            case_id="case_rational_add",
            original_question="Evaluate: (-3/4) + (1/2) = ?",
            student_response="-1/3",
            suspected_misconception="num_den_separate: Added numerators & denominators separately",
            diagnostic_question="Diagnostic Check: 1/2 + 1/2 = ?",
            followup_response="2/4 (Added tops & bottoms)",
            confirmation_status="confirmed",
            confidence_level="High (Confirmed Pattern)",
            supporting_evidence="Student confirmed pattern by answering 2/4 on follow-up 1/2+1/2.",
            recommended_intervention="Provide 15-minute tactile fraction strip lesson on finding LCM before adding.",
            reassessment_question="(-2/3) + (1/6) = ?",
            reassessment_response="-1/9",
            reassessment_result="persistent"
        )
        db.add(diag1)
        db.commit()

    # 5. Teacher Action Cards (Sample Cohort Data clearly labelled)
    if db.query(TeacherActionCard).count() == 0:
        sample_card = TeacherActionCard(
            id=1,
            user_id=None,
            student_name="Sample Cohort Aggregate (n=40)",
            concept_id="c5",
            concept_title="Adding rationals with unlike denominators",
            observation="38% of 40 sample students chose 'Added numerators and denominators separately'; follow-ups confirmed the pattern.",
            triggering_rule="Misconception prevalence >= teacher threshold (30%)",
            suggested_action="Conduct 15-minute group manipulative lesson on equivalent fractions on a number line; assign focused LCM exercises.",
            reassessment_status="pending",
            status="pending",
            is_sample=True,
            notes="Identified in weekly cohort diagnostics"
        )
        db.add(sample_card)
        db.commit()

    # 6. Teacher Config
    if db.query(TeacherConfig).count() == 0:
        cfg = TeacherConfig(
            id=1,
            teacher_id=2,
            up_streak_threshold=2,
            down_streak_threshold=2,
            help_streak_threshold=3,
            misconception_percent_threshold=30,
            bkt_p0=0.30,
            bkt_transition=0.15,
            bkt_slip=0.10,
            bkt_guess=0.25
        )
        db.add(cfg)
        db.commit()

if __name__ == "__main__":
    from app.database import SessionLocal, init_db_schema
    init_db_schema()
    db = SessionLocal()
    seed_database(db)
    db.close()
    print("Database seeding completed successfully.")
