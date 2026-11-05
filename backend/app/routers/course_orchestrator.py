"""
Course & Engagement Orchestrator Router for UDAAN.

Provides secure APIs for:
  - Teacher document upload and automatic course planning (RAG indexed).
  - Draft preview, editing, approval, and publication.
  - Proactive student engagement monitoring and alert resolution.
  - Classroom learning campaigns and adaptive interventions.
  - Teacher Assistant Agent weekly reports and worksheets.
  - Student Learning Plan ("My Learning Plan") and UDAAN Learning Assistant notifications.
"""

import os
import json
import logging
import datetime
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.database import get_db
from app.auth import get_current_user, require_role
from app.models import (
    User, UploadedCourseMaterial, ExtractedCourseContent, CoursePlan, CourseLesson,
    CourseKnowledgeChunk, StudentLearningAssignment, StudentActivityEvent,
    EngagementAlert, LearningIntervention, InterventionParticipant,
    StudentNotification, AgentTask, AgentExecutionLog
)
from app.schemas import (
    CourseMaterialResponse, CoursePlanResponse, CourseLessonResponse,
    CoursePlanUpdate, CourseLessonUpdate, EngagementAlertResponse,
    LearningInterventionResponse, StudentAssignmentResponse,
    StudentNotificationResponse
)
from app.services import (
    document_processor, rag_service, course_planner,
    engagement_service, intervention_service, agent_orchestrator
)

logger = logging.getLogger("udaan.course.router")

router = APIRouter(prefix="/course", tags=["AI Course & Engagement Orchestrator"])
student_router = APIRouter(prefix="/student", tags=["Student Learning Plan & Notifications"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "uploads", "course_materials")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def _parse_optional_date(value: Optional[str]) -> Optional[datetime.datetime]:
    if not value:
        return None
    try:
        return datetime.datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="Dates must use ISO format (YYYY-MM-DD).")


def _scoped_class_name(teacher: User, requested_class: Optional[str]) -> str:
    """Resolve the classroom a teacher may operate on.

    Admins may target any classroom (defaulting to their own label). Teachers
    are hard-scoped to their assigned class and must never widen visibility by
    passing another class name in a query/form parameter.
    """
    if teacher.role == "admin":
        return requested_class or teacher.class_name or "Class 8 - Section A"

    if not teacher.class_name:
        raise HTTPException(status_code=403, detail="No class is assigned to this teacher.")

    if requested_class and requested_class not in ("All Classes", teacher.class_name):
        raise HTTPException(
            status_code=403,
            detail="You can only access course data for your assigned class.",
        )
    return teacher.class_name


def _assert_can_edit_plan(teacher: User, plan: CoursePlan) -> None:
    if teacher.role != "admin" and plan.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this course plan.")


# ============================================================================
# TEACHER: MATERIAL UPLOAD & COURSE PLANNING
# ============================================================================

@router.post("/materials/upload", response_model=CoursePlanResponse, status_code=201)
async def upload_course_material(
    file: UploadFile = File(...),
    class_name: str = Form("Class 8 - Section A"),
    subject: str = Form("Mathematics"),
    title: str = Form(...),
    sessions_count: int = Form(5),
    preferred_language: str = Form("en"),
    learning_objectives: Optional[str] = Form(None),
    start_date: Optional[str] = Form(None),
    end_date: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """
    Teacher uploads educational material (PDF, DOCX, PPTX, TXT, MD).
    Course Understanding Agent extracts chapters, concepts, and prerequisites.
    RAG service splits and indexes knowledge chunks.
    Course Planning Agent synthesizes a structured draft course plan.
    """
    class_name = _scoped_class_name(teacher, class_name)
    file_bytes = await file.read()
    try:
        ext = document_processor.validate_upload(file.filename, file_bytes)
    except document_processor.DocumentValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Persist file securely
    clean_filename = f"{int(datetime.datetime.utcnow().timestamp())}_{file.filename.replace(' ', '_')}"
    file_path = os.path.join(UPLOAD_DIR, clean_filename)
    with open(file_path, "wb") as f:
        f.write(file_bytes)

    # 1. Record Upload
    material = UploadedCourseMaterial(
        teacher_id=teacher.id,
        class_name=class_name,
        subject=subject,
        title=title,
        file_name=file.filename,
        file_type=ext.lstrip("."),
        file_size=len(file_bytes),
        file_path=file_path,
        preferred_language=preferred_language,
        sessions_count=max(1, min(sessions_count, 20)),
        learning_objectives_input=learning_objectives,
        status="parsing",
        created_at=datetime.datetime.utcnow(),
    )
    db.add(material)
    db.commit()
    db.refresh(material)

    try:
        # 2. Extract Document Pages
        pages = document_processor.extract_document_pages(file.filename, file_bytes)

        # 3. Course Understanding Agent
        structured = document_processor.structure_course_units(
            pages=pages,
            subject=subject,
            title_hint=title
        )

        extracted = ExtractedCourseContent(
            material_id=material.id,
            raw_text=structured["raw_text"],
            clean_text=structured["clean_text"],
            chapters_json=json.dumps(structured["chapters"]),
            concepts_detected_json=json.dumps(structured["concepts_detected"]),
            prerequisites_json=json.dumps(structured["prerequisites"]),
            source_metadata_json=json.dumps(structured["source_metadata"]),
            created_at=datetime.datetime.utcnow(),
        )
        db.add(extracted)
        db.commit()

        # 4. RAG Knowledge Indexing
        chunks = rag_service.split_into_educational_chunks(
            pages=pages,
            class_name=class_name,
            subject=subject
        )
        rag_service.index_material_chunks(db, material.id, chunks)

        # 5. Course Planning Agent: Draft Course Plan
        course_plan = course_planner.generate_course_plan_from_material(
            db=db,
            material_id=material.id,
            teacher=teacher,
            total_sessions=sessions_count,
            start_date=_parse_optional_date(start_date),
            end_date=_parse_optional_date(end_date),
        )

        agent_orchestrator.log_agent_execution(
            db,
            agent_name="CourseUnderstandingAgent",
            action_taken=f"Processed '{file.filename}', indexed {len(chunks)} RAG chunks, created draft course plan id={course_plan.id}",
            entities_count=len(chunks),
            details={"plan_id": course_plan.id, "lessons": len(course_plan.lessons)}
        )

        return course_plan

    except Exception as e:
        material.status = "failed"
        material.error_message = str(e)
        db.commit()
        logger.exception("Error processing course material id=%d", material.id)
        raise HTTPException(status_code=500, detail=f"Course generation failed: {str(e)}")


@router.get("/materials", response_model=List[CourseMaterialResponse])
def list_course_materials(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Lists all uploaded educational materials for the teacher's class."""
    target_class = _scoped_class_name(teacher, class_name)
    q = db.query(UploadedCourseMaterial)
    q = q.filter(UploadedCourseMaterial.class_name == target_class)
    return q.order_by(UploadedCourseMaterial.created_at.desc()).all()


@router.get("/plans", response_model=List[CoursePlanResponse])
def list_course_plans(
    status_filter: Optional[str] = None,
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Lists course plans (draft, approved, published) for the class."""
    target_class = _scoped_class_name(teacher, class_name)
    q = db.query(CoursePlan).filter(CoursePlan.class_name == target_class)
    if status_filter:
        q = q.filter(CoursePlan.status == status_filter)
    return q.order_by(CoursePlan.created_at.desc()).all()


@router.get("/plans/{plan_id}", response_model=CoursePlanResponse)
def get_course_plan_detail(
    plan_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Retrieves full course plan including all lessons and activities."""
    plan = db.query(CoursePlan).filter(CoursePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Course plan not found.")
    if teacher.role != "admin" and plan.class_name != teacher.class_name:
        raise HTTPException(status_code=403, detail="Not authorized to access this course plan.")
    return plan


@router.put("/plans/{plan_id}", response_model=CoursePlanResponse)
def update_course_plan(
    plan_id: int,
    payload: CoursePlanUpdate,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Allows teacher to edit title, description, dates, or notes of a course plan."""
    plan = db.query(CoursePlan).filter(CoursePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Course plan not found.")
    if teacher.role != "admin" and plan.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this course plan.")

    if payload.title_en is not None:
        plan.title_en = payload.title_en
    if payload.title_te is not None:
        plan.title_te = payload.title_te
    if payload.description_en is not None:
        plan.description_en = payload.description_en
    if payload.description_te is not None:
        plan.description_te = payload.description_te
    if payload.start_date is not None:
        plan.start_date = payload.start_date
    if payload.end_date is not None:
        plan.end_date = payload.end_date
    if payload.pedagogical_notes is not None:
        plan.pedagogical_notes = payload.pedagogical_notes

    plan.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/plans/{plan_id}/lessons/{lesson_id}", response_model=CourseLessonResponse)
def update_course_lesson(
    plan_id: int,
    lesson_id: int,
    payload: CourseLessonUpdate,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Allows teacher to edit details of an individual lesson in a course plan."""
    plan = db.query(CoursePlan).filter(CoursePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Course plan not found.")
    _assert_can_edit_plan(teacher, plan)

    lesson = db.query(CourseLesson).filter(
        CourseLesson.id == lesson_id,
        CourseLesson.course_plan_id == plan_id
    ).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found.")

    if payload.title_en is not None:
        lesson.title_en = payload.title_en
    if payload.title_te is not None:
        lesson.title_te = payload.title_te
    if payload.topic_name is not None:
        lesson.topic_name = payload.topic_name
    if payload.summary_en is not None:
        lesson.summary_en = payload.summary_en
    if payload.summary_te is not None:
        lesson.summary_te = payload.summary_te
    if payload.estimated_minutes is not None:
        lesson.estimated_minutes = payload.estimated_minutes
    if payload.source_reference is not None:
        lesson.source_reference = payload.source_reference

    db.commit()
    db.refresh(lesson)
    return lesson


@router.post("/plans/{plan_id}/lessons/reorder")
def reorder_lessons(
    plan_id: int,
    body: Dict[str, List[int]],
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Reorders the sequence of lessons in a course plan: {"lesson_ids": [id1, id2, ...]}."""
    lesson_ids = body.get("lesson_ids", [])
    if not lesson_ids:
        raise HTTPException(status_code=400, detail="lesson_ids list is required.")

    plan = db.query(CoursePlan).filter(CoursePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Course plan not found.")
    _assert_can_edit_plan(teacher, plan)

    lessons = db.query(CourseLesson).filter(CourseLesson.course_plan_id == plan_id).all()
    lesson_map = {l.id: l for l in lessons}

    for order, lid in enumerate(lesson_ids, start=1):
        if lid in lesson_map:
            lesson_map[lid].sequence_order = order

    db.commit()
    return {"status": "success", "reordered_count": len(lesson_ids)}


@router.post("/plans/{plan_id}/approve")
def approve_course_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Marks a course plan approved by the teacher."""
    plan = db.query(CoursePlan).filter(CoursePlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Course plan not found.")
    if teacher.role != "admin" and plan.teacher_id != teacher.id:
        raise HTTPException(status_code=403, detail="Not authorized.")

    plan.status = "approved"
    plan.approved_at = datetime.datetime.utcnow()
    plan.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "approved", "plan_id": plan.id}


@router.post("/plans/{plan_id}/publish")
def publish_course_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """
    Teacher explicitly approves and publishes the course.
    Distributes assignments to enrolled students and delivers course notifications.
    """
    try:
        res = course_planner.approve_and_publish_course_plan(db, plan_id, teacher)
        return res
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/rag/search")
def rag_search_excerpts(
    query: str = Query(..., min_length=2),
    class_name: Optional[str] = None,
    material_id: Optional[int] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """RAG search across verified teacher educational material."""
    target_class = _scoped_class_name(teacher, class_name)
    results = rag_service.search_knowledge_base(
        db=db,
        query=query,
        class_name=target_class,
        material_id=material_id,
        top_k=4
    )
    return {"query": query, "class_name": target_class, "results": results}


# ============================================================================
# TEACHER: STUDENT ENGAGEMENT MONITORING
# ============================================================================

@router.get("/engagement/overview")
def get_engagement_overview(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Live engagement overview computed from real activity and assignment records."""
    target_class = _scoped_class_name(teacher, class_name)
    now = datetime.datetime.utcnow()

    students = db.query(User).filter(User.role == "student", User.class_name == target_class).all()
    total = len(students)

    active = 0
    inactive = 0
    for s in students:
        last = engagement_service.get_student_last_activity(db, s.id)
        if last and (now - last).days < 3:
            active += 1
        else:
            inactive += 1

    alerts = db.query(EngagementAlert).filter(
        EngagementAlert.class_name == target_class,
        EngagementAlert.is_resolved == False
    ).order_by(EngagementAlert.created_at.desc()).limit(20).all()

    # Decorate with student names
    alert_items = []
    for a in alerts:
        st = db.query(User).filter(User.id == a.student_id).first()
        alert_items.append({
            "id": a.id,
            "student_id": a.student_id,
            "student_name": st.full_name if st else "Student",
            "class_name": a.class_name,
            "alert_type": a.alert_type,
            "severity": a.severity,
            "details_json": a.details_json,
            "is_resolved": a.is_resolved,
            "created_at": a.created_at.isoformat() if a.created_at else None,
        })

    return {
        "class_name": target_class,
        "total_students": total,
        "active_students": active,
        "inactive_students": inactive,
        "open_alerts_count": len(alerts),
        "alerts": alert_items,
    }


@router.post("/engagement/scan")
def trigger_engagement_scan(
    class_name: Optional[str] = None,
    enforce_quiet_hours: bool = Query(True),
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Triggers autonomous student engagement scan and sends notifications."""
    target_class = _scoped_class_name(teacher, class_name)
    res = agent_orchestrator.run_full_engagement_and_intervention_cycle(db, teacher, target_class, enforce_quiet_hours=enforce_quiet_hours)
    return res


@router.post("/engagement/alerts/{alert_id}/resolve")
def resolve_engagement_alert(
    alert_id: int,
    body: Dict[str, str] = {},
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Marks an engagement alert resolved."""
    alert = db.query(EngagementAlert).filter(EngagementAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found.")
    if teacher.role != "admin" and alert.class_name != teacher.class_name:
        raise HTTPException(status_code=403, detail="Not authorized to resolve this alert.")

    alert.is_resolved = True
    alert.resolved_at = datetime.datetime.utcnow()
    alert.resolution_note = body.get("note", "Resolved by teacher")
    db.commit()
    return {"status": "resolved", "alert_id": alert.id}


# ============================================================================
# TEACHER: AI INTERVENTIONS & CLASSROOM CAMPAIGNS
# ============================================================================

@router.get("/interventions", response_model=List[LearningInterventionResponse])
def list_learning_interventions(
    status_filter: Optional[str] = None,
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Lists learning interventions and campaigns for the teacher's class."""
    target_class = _scoped_class_name(teacher, class_name)
    q = db.query(LearningIntervention).filter(LearningIntervention.class_name == target_class)
    if status_filter:
        q = q.filter(LearningIntervention.status == status_filter)
    return q.order_by(LearningIntervention.created_at.desc()).all()


@router.post("/interventions/scan")
def trigger_intervention_scan(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Runs classroom misconception detector across recent attempts."""
    target_class = _scoped_class_name(teacher, class_name)
    interventions = intervention_service.scan_for_classroom_campaigns(db, teacher, target_class)
    return {
        "status": "completed",
        "new_campaigns_proposed": len(interventions),
        "campaigns": [
            {"id": i.id, "title": i.title_en, "affected_students": i.affected_students_count}
            for i in interventions
        ]
    }


@router.post("/interventions/{intervention_id}/approve")
def approve_learning_intervention(
    intervention_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Teacher approves proposed intervention campaign and activates practice."""
    try:
        return intervention_service.approve_intervention(db, intervention_id, teacher)
    except PermissionError as pe:
        raise HTTPException(status_code=403, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.post("/interventions/{intervention_id}/dismiss")
def dismiss_learning_intervention(
    intervention_id: int,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Dismisses an intervention campaign."""
    i = db.query(LearningIntervention).filter(LearningIntervention.id == intervention_id).first()
    if not i:
        raise HTTPException(status_code=404, detail="Intervention not found.")
    if teacher.role != "admin" and i.teacher_id != teacher.id and i.class_name != teacher.class_name:
        raise HTTPException(status_code=403, detail="Not authorized.")

    i.status = "dismissed"
    i.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "dismissed", "intervention_id": i.id}


# ============================================================================
# TEACHER: REPORTS & WORKSHEETS
# ============================================================================

@router.get("/reports/weekly")
def get_weekly_report(
    class_name: Optional[str] = None,
    db: Session = Depends(get_db),
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Weekly digest generated by Teacher Assistant Agent."""
    return agent_orchestrator.generate_weekly_teacher_report(db, teacher, _scoped_class_name(teacher, class_name))


@router.get("/reports/worksheet")
def generate_remedial_worksheet(
    misconception: str = Query("num_den_separate"),
    class_name: Optional[str] = None,
    teacher: User = Depends(require_role(["teacher", "admin"])),
):
    """Generates printable/downloadable practice worksheet."""
    target_class = _scoped_class_name(teacher, class_name)
    tpl = intervention_service.REMEDIAL_TEMPLATES.get(
        misconception, intervention_service.REMEDIAL_TEMPLATES["num_den_separate"]
    )
    return {
        "topic": tpl["title_en"],
        "topic_te": tpl["title_te"],
        "target_misconception": tpl["misconception_name"],
        "class_name": target_class,
        "date": datetime.date.today().isoformat(),
        "tactile_remedy": tpl["tactile_remedy"],
        "practice_steps": tpl["practice_steps"],
        "drill_problems": tpl["drill_problems"],
    }


# ============================================================================
# STUDENT: MY LEARNING PLAN & NOTIFICATIONS
# ============================================================================

@student_router.get("/learning-plan")
def get_student_learning_plan(
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """
    Returns student's published courses, assignments, progress,
    and today's recommended lesson.
    """
    now = datetime.datetime.utcnow()

    # Published course plans for student's class
    plans = db.query(CoursePlan).filter(
        CoursePlan.class_name == student.class_name,
        CoursePlan.status == "published"
    ).all()

    # Student assignments
    assignments = db.query(StudentLearningAssignment).filter(
        StudentLearningAssignment.student_id == student.id
    ).all()

    # Map lesson details to assignments
    assignment_items = []
    completed_count = 0
    today_recommendation = None

    for a in assignments:
        lesson = db.query(CourseLesson).filter(CourseLesson.id == a.lesson_id).first()
        item = {
            "assignment_id": a.id,
            "course_plan_id": a.course_plan_id,
            "lesson_id": a.lesson_id,
            "lesson_title_en": lesson.title_en if lesson else "Lesson",
            "lesson_title_te": lesson.title_te if lesson else "పాఠం",
            "topic_name": lesson.topic_name if lesson else "",
            "estimated_minutes": lesson.estimated_minutes if lesson else 15,
            "status": a.status,
            "progress_pct": a.progress_pct,
            "due_date": a.due_date.isoformat() if a.due_date else None,
            "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        }
        assignment_items.append(item)
        if a.status == "completed":
            completed_count += 1
        elif today_recommendation is None:
            today_recommendation = item

    # If no incompleted assignment, pick the first
    if today_recommendation is None and assignment_items:
        today_recommendation = assignment_items[0]

    # Active interventions
    active_interventions = db.query(InterventionParticipant).filter(
        InterventionParticipant.student_id == student.id,
        InterventionParticipant.status != "completed"
    ).all()
    intervention_items = []
    for ap in active_interventions:
        li = db.query(LearningIntervention).filter(LearningIntervention.id == ap.intervention_id).first()
        if li:
            intervention_items.append({
                "intervention_id": li.id,
                "title_en": li.title_en,
                "title_te": li.title_te,
                "recommended_action": li.recommended_action,
                "status": ap.status,
            })

    return {
        "student_id": student.id,
        "class_name": student.class_name,
        "total_courses": len(plans),
        "total_assignments": len(assignments),
        "completed_assignments": completed_count,
        "overall_progress_pct": int(round((completed_count / max(1, len(assignments))) * 100)),
        "today_recommendation": today_recommendation,
        "assignments": assignment_items,
        "active_interventions": intervention_items,
    }


@student_router.post("/learning-plan/assignments/{assignment_id}/event")
def record_learning_event(
    assignment_id: int,
    body: Dict[str, Any],
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """
    Records student activity events (lesson_opened, progress, heartbeat, completed).
    Updates assignment progress and last_activity_at.
    """
    assignment = db.query(StudentLearningAssignment).filter(
        StudentLearningAssignment.id == assignment_id,
        StudentLearningAssignment.student_id == student.id,
    ).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    now = datetime.datetime.utcnow()
    event_type = body.get("event_type", "session_heartbeat")
    progress_delta = body.get("progress_pct")

    # Record real activity event
    event = StudentActivityEvent(
        student_id=student.id,
        course_plan_id=assignment.course_plan_id,
        lesson_id=assignment.lesson_id,
        event_type=event_type,
        metadata_json=json.dumps(body.get("metadata", {})),
        created_at=now,
    )
    db.add(event)

    assignment.last_activity_at = now
    if assignment.started_at is None:
        assignment.started_at = now
        assignment.status = "in_progress"

    if progress_delta is not None:
        assignment.progress_pct = max(assignment.progress_pct, min(100, int(progress_delta)))
        if assignment.progress_pct >= 100:
            assignment.status = "completed"
            assignment.completed_at = now

    if event_type == "completed":
        assignment.status = "completed"
        assignment.progress_pct = 100
        assignment.completed_at = now

    db.commit()
    return {
        "assignment_id": assignment.id,
        "status": assignment.status,
        "progress_pct": assignment.progress_pct,
        "event_recorded": event_type
    }


@student_router.get("/notifications", response_model=List[StudentNotificationResponse])
def get_student_notifications(
    limit: int = 20,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """Retrieves notifications for the UDAAN Learning Assistant panel."""
    now = datetime.datetime.utcnow()
    notifs = db.query(StudentNotification).filter(
        StudentNotification.student_id == student.id,
        or_(
            StudentNotification.is_snoozed == False,
            StudentNotification.snoozed_until.is_(None),
            StudentNotification.snoozed_until <= now,
        )
    ).order_by(StudentNotification.created_at.desc()).limit(limit).all()
    return notifs


@student_router.post("/notifications/{notification_id}/read")
def mark_student_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """Marks a notification as read."""
    notif = db.query(StudentNotification).filter(
        StudentNotification.id == notification_id,
        StudentNotification.student_id == student.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    notif.is_read = True
    notif.read_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "success", "id": notif.id}


@student_router.post("/notifications/{notification_id}/snooze")
def snooze_student_notification(
    notification_id: int,
    body: Dict[str, int] = {},
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """Snoozes a reminder for hours (default 24h)."""
    notif = db.query(StudentNotification).filter(
        StudentNotification.id == notification_id,
        StudentNotification.student_id == student.id,
    ).first()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found.")

    hours = max(1, min(body.get("hours", 24), 72))
    notif.is_snoozed = True
    notif.snoozed_until = datetime.datetime.utcnow() + datetime.timedelta(hours=hours)
    db.commit()
    return {"status": "snoozed", "id": notif.id, "snoozed_until": notif.snoozed_until.isoformat()}


@student_router.post("/interventions/{intervention_id}/complete")
def complete_student_intervention(
    intervention_id: int,
    body: Dict[str, float],
    db: Session = Depends(get_db),
    student: User = Depends(require_role(["student"])),
):
    """Submits completed intervention exercise with assessment score."""
    score = body.get("score", 0.85)
    try:
        return intervention_service.complete_participant_intervention(
            db=db,
            intervention_id=intervention_id,
            student_id=student.id,
            post_score=score
        )
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))
