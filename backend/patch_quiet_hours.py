# Patch engagement_service.py for quiet hours parameter

with open('backend/app/services/engagement_service.py', 'r', encoding='utf-8') as f:
    text = f.read()

# Replace can_send_notification signature
text = text.replace(
    'def can_send_notification(\n    db: Session,\n    student_id: int,\n    category: str,\n    now: Optional[datetime.datetime] = None\n) -> Tuple[bool, str]:',
    'def can_send_notification(\n    db: Session,\n    student_id: int,\n    category: str,\n    now: Optional[datetime.datetime] = None,\n    enforce_quiet_hours: bool = True\n) -> Tuple[bool, str]:'
)

# Replace quiet hours check inside can_send_notification
text = text.replace(
    '    if is_in_quiet_hours(ts):\n        return False, "quiet_hours"',
    '    if enforce_quiet_hours and is_in_quiet_hours(ts):\n        return False, "quiet_hours"'
)

# Replace scan_class_engagement signature
text = text.replace(
    'def scan_class_engagement(\n    db: Session,\n    teacher: User,\n    class_name: Optional[str] = None\n) -> Dict[str, Any]:',
    'def scan_class_engagement(\n    db: Session,\n    teacher: User,\n    class_name: Optional[str] = None,\n    enforce_quiet_hours: bool = True\n) -> Dict[str, Any]:'
)

# Replace can_send_notification calls inside scan_class_engagement
text = text.replace(
    'allowed, reason = can_send_notification(db, student.id, "reminder_inactive", now)',
    'allowed, reason = can_send_notification(db, student.id, "reminder_inactive", now, enforce_quiet_hours)'
)
text = text.replace(
    'allowed, _ = can_send_notification(db, student.id, "reminder_incomplete", now)',
    'allowed, _ = can_send_notification(db, student.id, "reminder_incomplete", now, enforce_quiet_hours)'
)

with open('backend/app/services/engagement_service.py', 'w', encoding='utf-8') as f:
    f.write(text)

# Also update agent_orchestrator.py
with open('backend/app/services/agent_orchestrator.py', 'r', encoding='utf-8') as f:
    ao_text = f.read()

ao_text = ao_text.replace(
    'def run_full_engagement_and_intervention_cycle(\n    db: Session,\n    teacher: User,\n    class_name: Optional[str] = None\n) -> Dict[str, Any]:',
    'def run_full_engagement_and_intervention_cycle(\n    db: Session,\n    teacher: User,\n    class_name: Optional[str] = None,\n    enforce_quiet_hours: bool = True\n) -> Dict[str, Any]:'
)
ao_text = ao_text.replace(
    'eng_result = engagement_service.scan_class_engagement(db, teacher, target_class)',
    'eng_result = engagement_service.scan_class_engagement(db, teacher, target_class, enforce_quiet_hours=enforce_quiet_hours)'
)

with open('backend/app/services/agent_orchestrator.py', 'w', encoding='utf-8') as f:
    f.write(ao_text)

# Also update router
with open('backend/app/routers/course_orchestrator.py', 'r', encoding='utf-8') as f:
    r_text = f.read()

r_text = r_text.replace(
    'def trigger_engagement_scan(\n    class_name: Optional[str] = None,',
    'def trigger_engagement_scan(\n    class_name: Optional[str] = None,\n    enforce_quiet_hours: bool = Query(True),'
)
r_text = r_text.replace(
    'res = agent_orchestrator.run_full_engagement_and_intervention_cycle(db, teacher, class_name)',
    'res = agent_orchestrator.run_full_engagement_and_intervention_cycle(db, teacher, class_name, enforce_quiet_hours=enforce_quiet_hours)'
)

with open('backend/app/routers/course_orchestrator.py', 'w', encoding='utf-8') as f:
    f.write(r_text)

print("Updated quiet hours parameter in services and routers")

