"""
Intervention Planning & Classroom Learning Campaign Agent for UDAAN.

Handles:
  1. Classroom-Wide Misconception Detection from real student attempts.
  2. Automatic generation of grounded Remedial Activities via RAG.
  3. Teacher Review, Approval, Customization, and Dismissal.
  4. Differentiated student practice assignments and reassessment tracking.
  5. Pre- vs Post-mastery verification and outcome reporting.
"""

import json
import logging
import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_

from app.models import (
    User, Concept, Attempt, DiagnosticRecord, ConceptMastery,
    LearningIntervention, InterventionParticipant, StudentNotification,
    TeacherNotification
)
from app.services import rag_service

logger = logging.getLogger("udaan.course.intervention")

MIN_STUDENTS_FOR_CLASSROOM_CAMPAIGN = 2
MIN_AFFECTED_RATIO_FOR_CAMPAIGN = 0.25  # 25% of class assessed


REMEDIAL_TEMPLATES: Dict[str, Dict[str, Any]] = {
    "num_den_separate": {
        "title_en": "Targeted Workshop: Common Denominators & Visual Fraction Strips",
        "title_te": "లక్ష్య వర్క్‌షాప్: ఉమ్మడి హారాలు మరియు భిన్నాల దృశ్య సాధన",
        "misconception_name": "Direct Addition of Numerators and Denominators",
        "root_gap": "Prerequisite Concept: LCM & Finding Equivalent Denominators",
        "tactile_remedy": "15-minute tactile paper-strip folding exercise showing why 1/2 and 1/3 have different piece sizes and cannot be added as 2/5.",
        "practice_steps": [
            "Step 1: Write down both fractions and highlight denominators.",
            "Step 2: List multiples of both numbers to find the Least Common Multiple (LCM).",
            "Step 3: Convert each fraction into an equivalent fraction with that LCM denominator.",
            "Step 4: Add the numerators while keeping the common denominator unchanged.",
            "Step 5: Simplify if possible."
        ],
        "drill_problems": [
            {"problem": "1/4 + 1/2", "hint": "Convert 1/2 to 2/4. Then 1/4 + 2/4 = 3/4", "answer": "3/4"},
            {"problem": "2/3 + 1/6", "hint": "Convert 2/3 to 4/6. Then 4/6 + 1/6 = 5/6", "answer": "5/6"},
            {"problem": "3/5 + 1/10", "hint": "Convert 3/5 to 6/10. Then 6/10 + 1/10 = 7/10", "answer": "7/10"}
        ]
    },
    "sign_slip": {
        "title_en": "Targeted Workshop: Signed Directed Number Lines",
        "title_te": "లక్ష్య వర్క్‌షాప్: గుర్తులు గల సంఖ్యా రేఖ సాధన",
        "misconception_name": "Sign Slips in Rational Addition/Subtraction",
        "root_gap": "Prerequisite Concept: Negative Integers on Number Line",
        "tactile_remedy": "Step-by-step signed number line movement: positive moves right, negative moves left.",
        "practice_steps": [
            "Step 1: Locate the first rational number on the number line.",
            "Step 2: If adding a positive, move to the right.",
            "Step 3: If adding a negative (or subtracting a positive), move to the left.",
            "Step 4: Note the final landing position.",
            "Step 5: Verify the sign of the answer."
        ],
        "drill_problems": [
            {"problem": "(-3/7) + (5/7)", "hint": "Start at -3/7, move right 5 units: (-3+5)/7 = 2/7", "answer": "2/7"},
            {"problem": "(1/4) - (3/4)", "hint": "Start at 1/4, move left 3 units: (1-3)/4 = -2/4 = -1/2", "answer": "-1/2"}
        ]
    },
    "ignored_negative": {
        "title_en": "Targeted Workshop: Preserving Signs in Complex Fractions",
        "title_te": "లక్ష్య వర్క్‌షాప్: సంకీర్ణ భిన్నాలలో రుణ గుర్తులను నిలుపుకోవడం",
        "misconception_name": "Ignoring Negative Sign in Numerator/Denominator",
        "root_gap": "Prerequisite Concept: Rational Sign Equivalence -a/b = a/(-b) = -(a/b)",
        "tactile_remedy": "Highlighting negative signs in red before calculating common denominator.",
        "practice_steps": [
            "Step 1: Circle any negative signs in the problem.",
            "Step 2: Transfer denominator negative signs to the numerator: a/(-b) -> -a/b.",
            "Step 3: Proceed with standard LCM addition.",
            "Step 4: Confirm sign consistency."
        ],
        "drill_problems": [
            {"problem": "(-1/3) + (-1/6)", "hint": "Both negative: -2/6 + -1/6 = -3/6 = -1/2", "answer": "-1/2"}
        ]
    }
}


def scan_for_classroom_campaigns(
    db: Session,
    teacher: User,
    class_name: Optional[str] = None
) -> List[LearningIntervention]:
    """
    Classroom Learning Campaign Agent:
    Scans diagnostic and attempt history for the teacher's class.
    If multiple students share the same misconception, generates a proposed
    LearningIntervention campaign with grounded RAG context and remedial plan.
    """
    target_class = class_name or teacher.class_name
    now = datetime.datetime.utcnow()

    # Get all students in the class
    students = db.query(User).filter(
        User.role == "student",
        User.class_name == target_class
    ).all()
    class_size = len(students)
    if class_size == 0:
        return []

    student_ids = [s.id for s in students]

    # Find recent wrong attempts or diagnostic records
    recent_diags = db.query(DiagnosticRecord).filter(
        DiagnosticRecord.user_id.in_(student_ids),
        DiagnosticRecord.created_at >= (now - datetime.timedelta(days=14))
    ).all()

    # Group students by misconception
    misconception_students: Dict[str, set] = {}
    for d in recent_diags:
        mtype = d.suspected_misconception
        if mtype:
            misconception_students.setdefault(mtype, set()).add(d.user_id)

    # Also check ConceptMastery streak_wrong
    struggling_mastery = db.query(ConceptMastery).filter(
        ConceptMastery.user_id.in_(student_ids),
        ConceptMastery.streak_wrong >= 2
    ).all()
    for sm in struggling_mastery:
        # Map concept to likely misconception
        mapped_misc = "num_den_separate" if sm.concept_id in ("c1", "c2", "c5") else "sign_slip"
        misconception_students.setdefault(mapped_misc, set()).add(sm.user_id)

    proposed_interventions = []

    for misc_type, student_set in misconception_students.items():
        affected_count = len(student_set)
        ratio = affected_count / max(1, class_size)

        # Trigger campaign if >= MIN_STUDENTS_FOR_CLASSROOM_CAMPAIGN or >= MIN_AFFECTED_RATIO_FOR_CAMPAIGN
        if affected_count >= MIN_STUDENTS_FOR_CLASSROOM_CAMPAIGN or ratio >= MIN_AFFECTED_RATIO_FOR_CAMPAIGN:
            # Check if active or proposed campaign already exists for this teacher and misconception
            existing = db.query(LearningIntervention).filter(
                LearningIntervention.teacher_id == teacher.id,
                LearningIntervention.target_misconception == misc_type,
                LearningIntervention.status.in_(("proposed", "approved", "active"))
            ).first()

            if not existing:
                tpl = REMEDIAL_TEMPLATES.get(misc_type, REMEDIAL_TEMPLATES["num_den_separate"])

                # RAG retrieval for grounded textbook context
                rag_snippets = rag_service.search_knowledge_base(
                    db,
                    query=f"{tpl['misconception_name']} {tpl['root_gap']}",
                    class_name=target_class,
                    top_k=2
                )
                grounded_notes = "\n".join(f"- {s['source_citation']}: {s['content_text'][:120]}..." for s in rag_snippets) if rag_snippets else "NCERT Class 8 Rational Numbers Section 1.2"

                remedial_plan = {
                    "misconception": tpl["misconception_name"],
                    "root_gap": tpl["root_gap"],
                    "tactile_remedy": tpl["tactile_remedy"],
                    "practice_steps": tpl["practice_steps"],
                    "drill_problems": tpl["drill_problems"],
                    "grounded_sources": grounded_notes,
                    "affected_student_ids": list(student_set),
                }

                intervention = LearningIntervention(
                    teacher_id=teacher.id,
                    class_name=target_class,
                    intervention_type="classroom_campaign",
                    target_misconception=misc_type,
                    concept_id="c5",  # Addition of Unlike Rationals
                    title_en=tpl["title_en"],
                    title_te=tpl["title_te"],
                    description=f"{affected_count} of {class_size} students ({int(ratio * 100)}%) are currently struggling with '{tpl['misconception_name']}'. Grounded in diagnostic evidence.",
                    remedial_plan_json=json.dumps(remedial_plan),
                    recommended_action=f"Run a {tpl['tactile_remedy']} and assign targeted differentiated practice.",
                    status="proposed",
                    affected_students_count=affected_count,
                    class_size=class_size,
                    affected_ratio=round(ratio, 2),
                    created_at=now,
                    updated_at=now,
                )
                db.add(intervention)
                db.flush()

                # Add participant records in pending/assigned state
                for sid in student_set:
                    # Look up current mastery
                    cm = db.query(ConceptMastery).filter(
                        ConceptMastery.user_id == sid,
                        ConceptMastery.concept_id == "c5"
                    ).first()
                    pre_score = cm.mastery_score if cm else 0.35

                    participant = InterventionParticipant(
                        intervention_id=intervention.id,
                        student_id=sid,
                        pre_mastery_score=pre_score,
                        status="assigned",
                        assigned_activity_json=json.dumps(tpl["drill_problems"]),
                        created_at=now,
                    )
                    db.add(participant)

                proposed_interventions.append(intervention)
            else:
                tpl = REMEDIAL_TEMPLATES.get(misc_type, REMEDIAL_TEMPLATES["num_den_separate"])
                for sid in student_set:
                    p_exists = db.query(InterventionParticipant).filter(
                        InterventionParticipant.intervention_id == existing.id,
                        InterventionParticipant.student_id == sid
                    ).first()
                    if not p_exists:
                        cm = db.query(ConceptMastery).filter(
                            ConceptMastery.user_id == sid,
                            ConceptMastery.concept_id == "c5"
                        ).first()
                        pre_score = cm.mastery_score if cm else 0.35
                        db.add(InterventionParticipant(
                            intervention_id=existing.id,
                            student_id=sid,
                            pre_mastery_score=pre_score,
                            status="assigned",
                            assigned_activity_json=json.dumps(tpl["drill_problems"]),
                            created_at=now,
                        ))
                proposed_interventions.append(existing)

    db.commit()
    return proposed_interventions


def approve_intervention(
    db: Session,
    intervention_id: int,
    teacher: User
) -> Dict[str, Any]:
    """
    Teacher Approval Workflow:
    1. Approves proposed intervention.
    2. Activates participant assignments.
    3. Sends targeted, encouraging notifications to affected students.
    """
    intervention = db.query(LearningIntervention).filter(LearningIntervention.id == intervention_id).first()
    if not intervention:
        raise ValueError(f"LearningIntervention {intervention_id} not found.")

    if teacher.role != "admin" and intervention.teacher_id != teacher.id and intervention.class_name != teacher.class_name:
        raise PermissionError("Not authorized to approve this intervention.")

    now = datetime.datetime.utcnow()
    intervention.status = "active"
    intervention.approved_at = now
    intervention.updated_at = now

    participants = db.query(InterventionParticipant).filter(
        InterventionParticipant.intervention_id == intervention.id
    ).all()

    notifs_sent = 0
    for p in participants:
        p.status = "assigned"
        # Notify student with supportive action
        db.add(StudentNotification(
            student_id=p.student_id,
            title_en=f"Special Focus Activity: {intervention.title_en}",
            title_te=f"ప్రత్యేక సాధన కార్యాచరణ: {intervention.title_te}",
            body_en="We prepared a special quick activity with visual hints to make fractions super easy and clear! Take 10 minutes to try it.",
            body_te="భిన్నాలను సులభంగా అర్థం చేసుకోవడానికి మేము దృశ్య సూచనలతో కూడిన చిన్న కార్యాచరణను సిద్ధం చేశాము! ప్రయత్నించండి.",
            category="intervention_assigned",
            action_url=f"/student/intervention/{intervention.id}",
            action_payload_json=json.dumps({"intervention_id": intervention.id}),
            priority="high",
            created_at=now,
        ))
        notifs_sent += 1

    db.commit()
    logger.info("Approved intervention id=%d. Notified %d participants.", intervention.id, notifs_sent)
    return {
        "intervention_id": intervention.id,
        "status": "active",
        "participants_count": len(participants),
        "notifications_sent": notifs_sent
    }


def complete_participant_intervention(
    db: Session,
    intervention_id: int,
    student_id: int,
    post_score: float
) -> Dict[str, Any]:
    """
    Follow-up & Progress Monitoring Agent:
    Records completed recovery activity, logs post-intervention assessment score,
    and updates mastery if independent evidence shows recovery.
    """
    participant = db.query(InterventionParticipant).filter(
        InterventionParticipant.intervention_id == intervention_id,
        InterventionParticipant.student_id == student_id
    ).first()

    if not participant:
        raise ValueError("Participant not found in this intervention.")

    now = datetime.datetime.utcnow()
    participant.status = "completed"
    participant.post_mastery_score = round(post_score, 3)
    participant.completed_at = now

    # Update student ConceptMastery if improved
    cm = db.query(ConceptMastery).filter(
        ConceptMastery.user_id == student_id,
        ConceptMastery.concept_id == "c5"
    ).first()

    if cm and post_score > cm.mastery_score:
        cm.mastery_score = min(0.95, round((cm.mastery_score * 0.4) + (post_score * 0.6), 3))
        cm.streak_correct += 1
        cm.streak_wrong = 0
        cm.last_reason = "Improved after targeted intervention recovery"

    # Check if all participants completed
    uncompleted = db.query(InterventionParticipant).filter(
        InterventionParticipant.intervention_id == intervention_id,
        InterventionParticipant.status != "completed"
    ).count()

    if uncompleted == 0:
        intervention = db.query(LearningIntervention).filter(LearningIntervention.id == intervention_id).first()
        if intervention:
            intervention.status = "completed"
            intervention.updated_at = now

    db.commit()
    return {
        "participant_id": participant.id,
        "pre_score": participant.pre_mastery_score,
        "post_score": participant.post_mastery_score,
        "status": "completed"
    }
