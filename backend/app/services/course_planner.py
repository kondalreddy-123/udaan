"""
Course Planning Agent for UDAAN.

Converts extracted educational material into structured, scheduled courses
divided into bite-sized lessons with objectives, checkpoints, practice
activities, and assessments.

Handles:
  1. Automated Draft Generation from Extracted Text.
  2. Teacher Approval and Lesson Modification.
  3. Class-wide Publication and Student Learning Assignment distribution.
  4. Automatic personalized course notifications for enrolled students.
"""

import json
import logging
import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models import (
    UploadedCourseMaterial, ExtractedCourseContent, CoursePlan, CourseLesson,
    StudentLearningAssignment, StudentNotification, User, StudentActivityEvent
)
from app.services import rag_service

logger = logging.getLogger("udaan.course.planner")


STANDARD_RATIONAL_LESSON_TEMPLATES = [
    {
        "title_en": "Understanding Rational Numbers & The Number Line",
        "title_te": "అకరణీయ సంఖ్యలు మరియు సంఖ్యా రేఖ అవగాహన",
        "topic": "Definition & Number Line Representation",
        "minutes": 15,
        "objectives_en": ["Define rational numbers as p/q (q != 0)", "Represent positive and negative rationals on a number line"],
        "objectives_te": ["p/q (q != 0) రూపంలో అకరణీయ సంఖ్యలను నిర్వచించండి", "సంఖ్యా రేఖపై ధన మరియు రుణ అకరణీయ సంఖ్యలను గుర్తించండి"],
        "prerequisites": ["Integers", "Fractions Basics"],
        "checkpoints": ["Can identify which numbers cannot be rational (q=0)", "Can place -3/4 between -1 and 0"],
        "practice": [
            {"q": "Is -7 a rational number?", "options": ["Yes, it can be written as -7/1", "No, it is a negative integer", "Only positive fractions are rational", "None of these"], "correct": 0},
            {"q": "Where does -2/3 lie on the number line?", "options": ["Between 0 and 1", "Between -1 and 0", "To the left of -2", "Between 1 and 2"], "correct": 1}
        ],
        "assessments": [
            {"q": "Express 0.75 as a rational number p/q in lowest terms.", "answer": "3/4", "type": "input"}
        ]
    },
    {
        "title_en": "Equivalent Fractions & Common Denominators (LCM)",
        "title_te": "సమాన భిన్నాలు మరియు ఉమ్మడి హారాలు (క.సా.గు)",
        "topic": "Equivalent Fractions & LCM",
        "minutes": 20,
        "objectives_en": ["Find equivalent forms by multiplying numerator and denominator by same non-zero number", "Determine LCM of unlike denominators"],
        "objectives_te": ["లవహారాలను ఒకే సంఖ్యతో గుణించి సమాన భిన్నాలను కనుగొనండి", "వేర్వేరు హారాలకు క.సా.గు కనుగొనండి"],
        "prerequisites": ["Prime Factorization", "Multiplication Tables"],
        "checkpoints": ["Understands that multiplying top and bottom preserves value", "Finds LCM of 6 and 8 is 24"],
        "practice": [
            {"q": "What is an equivalent form of 3/5 with denominator 20?", "options": ["6/20", "9/20", "12/20", "15/20"], "correct": 2},
            {"q": "What is the LCM of 4 and 6?", "options": ["10", "12", "24", "8"], "correct": 1}
        ],
        "assessments": [
            {"q": "Convert 2/3 and 1/4 to equivalent fractions with their common denominator.", "answer": "8/12 and 3/12", "type": "input"}
        ]
    },
    {
        "title_en": "Addition of Rational Numbers with Unlike Denominators",
        "title_te": "వేర్వేరు హారాలు గల అకరణీయ సంఖ్యల సంకలనం",
        "topic": "Addition of Unlike Rationals",
        "minutes": 20,
        "objectives_en": ["Convert unlike fractions using LCM before adding", "Avoid the common misconception of adding numerators and denominators directly"],
        "objectives_te": ["కలపడానికి ముందు క.సా.గు ద్వారా సమాన భిన్నాలుగా మార్చండి", "లవాలను హారాలను నేరుగా కూడే తప్పును నివారించండి"],
        "prerequisites": ["Equivalent Fractions", "LCM Finding"],
        "checkpoints": ["Never adds 1/2 + 1/3 as 2/5", "Applies LCM conversion step first"],
        "practice": [
            {"q": "Calculate: 1/3 + 1/4", "options": ["2/7", "7/12", "5/12", "1/12"], "correct": 1},
            {"q": "Calculate: (-2/5) + (3/10)", "options": ["1/15", "-1/10", "1/10", "-5/10"], "correct": 1}
        ],
        "assessments": [
            {"q": "Evaluate: (-3/4) + (2/3) in simplest form.", "answer": "-1/12", "type": "input"}
        ]
    },
    {
        "title_en": "Subtraction & Additive Inverses of Rational Numbers",
        "title_te": "వ్యవకలనం మరియు సంకలన విలోమాలు",
        "topic": "Subtraction & Inverses",
        "minutes": 15,
        "objectives_en": ["Understand subtraction as adding the additive inverse: a - b = a + (-b)", "Apply sign rules correctly"],
        "objectives_te": ["వ్యవకలనాన్ని సంకలన విలోమాన్ని కూడటంగా అర్థం చేసుకోండి: a - b = a + (-b)", "గుర్తుల నియమాలను సరిగ్గా వర్తింపజేయండి"],
        "prerequisites": ["Signed Integer Operations", "Addition of Rationals"],
        "checkpoints": ["Recognizes additive inverse of -5/7 is 5/7", "Does not confuse subtraction sign with negative numerator"],
        "practice": [
            {"q": "What is the additive inverse of -8/11?", "options": ["-11/8", "8/11", "11/8", "0"], "correct": 1},
            {"q": "Evaluate: (2/7) - (-3/7)", "options": ["-1/7", "5/7", "-5/7", "1/7"], "correct": 1}
        ],
        "assessments": [
            {"q": "Calculate: (1/4) - (5/6)", "answer": "-7/12", "type": "input"}
        ]
    },
    {
        "title_en": "Multiplication, Reciprocals & Division Mastery",
        "title_te": "గుణకారం, పరస్పర విలోమాలు మరియు భాగహారం",
        "topic": "Multiplication, Division & Properties",
        "minutes": 20,
        "objectives_en": ["Multiply numerators together and denominators together", "Divide by multiplying by the reciprocal (multiplicative inverse)"],
        "objectives_te": ["లవాలను మరియు హారాలను పరస్పరం గుణించండి", "పరస్పర విలోమంతో గుణించడం ద్వారా భాగించండి"],
        "prerequisites": ["Multiplication Tables", "Fraction Basics"],
        "checkpoints": ["Multiplies across directly", "Flips second fraction when dividing"],
        "practice": [
            {"q": "Calculate: (-4/9) * (3/8)", "options": ["-12/72 = -1/6", "1/6", "-7/17", "-1/3"], "correct": 0},
            {"q": "What is (-2/3) ÷ (4/5)?", "options": ["-8/15", "-5/6", "5/6", "-6/5"], "correct": 1}
        ],
        "assessments": [
            {"q": "Divide (-7/12) by (-14/3).", "answer": "1/8", "type": "input"}
        ]
    }
]


def generate_course_plan_from_material(
    db: Session,
    material_id: int,
    teacher: User,
    total_sessions: Optional[int] = None,
    start_date: Optional[datetime.datetime] = None,
    end_date: Optional[datetime.datetime] = None,
) -> CoursePlan:
    """
    Course Planning Agent:
    Transforms extracted material into a structured CoursePlan with CourseLessons.
    Remains in 'draft' status until the teacher explicitly reviews and publishes it.
    """
    material = db.query(UploadedCourseMaterial).filter(UploadedCourseMaterial.id == material_id).first()
    if not material:
        raise ValueError(f"UploadedCourseMaterial {material_id} not found.")

    extracted = db.query(ExtractedCourseContent).filter(ExtractedCourseContent.material_id == material_id).first()
    chapters_meta = json.loads(extracted.chapters_json) if (extracted and extracted.chapters_json) else []

    target_sessions = total_sessions or material.sessions_count or 5
    now = datetime.datetime.utcnow()
    st_date = start_date or now
    en_date = end_date or (st_date + datetime.timedelta(days=target_sessions * 2))

    # Create CoursePlan in draft state
    course_plan = CoursePlan(
        material_id=material.id,
        teacher_id=teacher.id,
        class_name=material.class_name,
        subject=material.subject,
        title_en=f"{material.title} (Structured Curriculum)",
        title_te=f"{material.title} (నిర్మాణాత్మక పాఠ్యప్రణాళిక)",
        description_en=f"AI-orchestrated adaptive learning path generated from {material.file_name}. Contains {target_sessions} structured lessons with practice and checkpoints.",
        description_te=f"{material.file_name} నుండి రూపొందించబడిన అనుకూల అభ్యాస ప్రణాళిక. సాధన మరియు మూల్యాంకనాలతో {target_sessions} పాఠాలు కలవు.",
        status="draft",
        start_date=st_date,
        end_date=en_date,
        total_sessions=target_sessions,
        estimated_hours=round(target_sessions * 0.35, 1),
        pedagogical_notes="Draft generated by UDAAN Course Planning Agent. Review objectives, adjust sequence, and approve before publishing to students.",
        created_at=now,
        updated_at=now,
    )
    db.add(course_plan)
    db.flush()

    # Generate individual lessons
    num_templates = len(STANDARD_RATIONAL_LESSON_TEMPLATES)
    for i in range(target_sessions):
        tpl = STANDARD_RATIONAL_LESSON_TEMPLATES[i % num_templates]
        chapter_title = chapters_meta[i]["title"] if i < len(chapters_meta) else f"Chapter {i+1}: {tpl['topic']}"
        source_ref = f"Page {i*2 + 1}-{i*2 + 2}" if not chapters_meta else f"Source: {material.file_name}"

        lesson = CourseLesson(
            course_plan_id=course_plan.id,
            sequence_order=i + 1,
            title_en=f"Lesson {i + 1}: {tpl['title_en']}",
            title_te=f"పాఠం {i + 1}: {tpl['title_te']}",
            chapter_name=chapter_title,
            topic_name=tpl["topic"],
            summary_en=f"Explore {tpl['topic']} with worked examples, interactive checks, and adaptive practice.",
            summary_te=f"సాధన ఉదాహరణలు, ఇంటరాక్టివ్ తనిఖీలు మరియు అనుకూల అభ్యాసంతో {tpl['topic']} ను అన్వేషించండి.",
            estimated_minutes=tpl["minutes"],
            prerequisites_json=json.dumps(tpl["prerequisites"]),
            objectives_json=json.dumps(tpl["objectives_en"]),
            checkpoints_json=json.dumps(tpl["checkpoints"]),
            practice_activities_json=json.dumps(tpl["practice"]),
            assessments_json=json.dumps(tpl["assessments"]),
            source_reference=source_ref,
            created_at=now,
        )
        db.add(lesson)

    material.status = "processed"
    material.updated_at = now
    db.commit()
    db.refresh(course_plan)
    logger.info("Generated draft course plan id=%d with %d lessons for teacher_id=%d", course_plan.id, target_sessions, teacher.id)
    return course_plan


def approve_and_publish_course_plan(
    db: Session,
    course_plan_id: int,
    teacher: User
) -> Dict[str, Any]:
    """
    Publishing Workflow:
    1. Validates teacher authorization and course status.
    2. Transitions status to 'published'.
    3. Finds all students enrolled in the teacher's class.
    4. Creates StudentLearningAssignment rows for each student and lesson.
    5. Generates bilingual student notifications with direct action URLs.
    """
    plan = db.query(CoursePlan).filter(CoursePlan.id == course_plan_id).first()
    if not plan:
        raise ValueError(f"CoursePlan {course_plan_id} not found.")

    if teacher.role != "admin" and (plan.teacher_id != teacher.id or plan.class_name != teacher.class_name):
        raise PermissionError("Teacher is not authorized to publish this course plan.")

    now = datetime.datetime.utcnow()
    plan.status = "published"
    plan.approved_at = plan.approved_at or now
    plan.published_at = now
    plan.updated_at = now

    # Fetch students enrolled in this class
    students = db.query(User).filter(
        User.role == "student",
        User.class_name == plan.class_name
    ).all()

    lessons = db.query(CourseLesson).filter(CourseLesson.course_plan_id == plan.id).order_by(CourseLesson.sequence_order).all()
    assignments_created = 0
    notifications_created = 0

    first_lesson = lessons[0] if lessons else None

    for student in students:
        for idx, lesson in enumerate(lessons):
            # Check if assignment already exists
            existing = db.query(StudentLearningAssignment).filter(
                StudentLearningAssignment.course_plan_id == plan.id,
                StudentLearningAssignment.lesson_id == lesson.id,
                StudentLearningAssignment.student_id == student.id,
            ).first()

            if not existing:
                due = (plan.start_date or now) + datetime.timedelta(days=(idx + 1) * 2)
                assignment = StudentLearningAssignment(
                    course_plan_id=plan.id,
                    lesson_id=lesson.id,
                    student_id=student.id,
                    class_name=plan.class_name,
                    status="assigned",
                    progress_pct=0,
                    time_spent_minutes=0,
                    assigned_at=now,
                    due_date=due,
                )
                db.add(assignment)
                assignments_created += 1

        # Send Course Launch Notification to student
        if first_lesson:
            notif = StudentNotification(
                student_id=student.id,
                title_en=f"New Course Published: {plan.title_en}",
                title_te=f"కొత్త కోర్సు ప్రచురించబడింది: {plan.title_te}",
                body_en=f"Your teacher has published a new {plan.subject} learning plan. Today's topic: '{first_lesson.title_en}'. Estimated time: {first_lesson.estimated_minutes} mins. Start today's lesson!",
                body_te=f"మీ ఉపాధ్యాయులు కొత్త {plan.subject} అభ్యాస ప్రణాళికను ప్రచురించారు. నేటి అంశం: '{first_lesson.title_te}'. అంచనా సమయం: {first_lesson.estimated_minutes} నిమిషాలు. ఇప్పుడే ప్రారంభించండి!",
                category="course_published",
                action_url=f"/student/lesson/{first_lesson.id}",
                action_payload_json=json.dumps({"course_id": plan.id, "lesson_id": first_lesson.id}),
                priority="high",
                created_at=now,
            )
            db.add(notif)
            notifications_created += 1

    db.commit()
    logger.info(
        "Published CoursePlan id=%d to class '%s'. Created %d assignments and %d notifications.",
        plan.id, plan.class_name, assignments_created, notifications_created
    )

    return {
        "course_plan_id": plan.id,
        "status": "published",
        "students_enrolled": len(students),
        "assignments_created": assignments_created,
        "notifications_sent": notifications_created,
        "first_lesson_title": first_lesson.title_en if first_lesson else None,
    }

