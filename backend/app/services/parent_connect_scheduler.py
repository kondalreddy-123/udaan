"""ParentConnect weekly scheduler (Phase 5).

The scheduler uses database-backed idempotency instead of an external queue:

* ``SchedulerJobRun(job_name, run_key)`` is unique, so only one process can run a
  given reporting week.
* A stale heartbeat lease allows safe takeover after a crash.
* ``WeeklyProgressReport`` uniqueness on (student, parent, week) prevents
  duplicate reports even if two runs overlap.
"""
from __future__ import annotations

import datetime
import json
import logging
import os
import socket
import threading
import uuid
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models import SchedulerJobRun
from app.services import parent_connect

logger = logging.getLogger("udaan.parent_connect.scheduler")

JOB_NAME = "parent_connect_weekly"

_INSTANCE_ID = f"{socket.gethostname()}-{os.getpid()}-{uuid.uuid4().hex[:8]}"
_THREAD: Optional[threading.Thread] = None
_STOP_EVENT = threading.Event()
_THREAD_LOCK = threading.Lock()


def current_instance_id() -> str:
    return _INSTANCE_ID


def run_key_for_week(week_start: datetime.date, week_end: datetime.date) -> str:
    return f"{week_start.isoformat()}_{week_end.isoformat()}"


def _lease_minutes() -> int:
    return max(1, settings.PARENT_CONNECT_JOB_LEASE_MINUTES)


def _is_lease_stale(row: SchedulerJobRun, now: Optional[datetime.datetime] = None) -> bool:
    reference = now or parent_connect.utc_now()
    heartbeat = row.heartbeat_at or row.started_at
    if not heartbeat:
        return True
    return reference - heartbeat > datetime.timedelta(minutes=_lease_minutes())


def acquire_job_lock(
    db: Session,
    run_key: str,
    *,
    force: bool = False,
) -> Optional[SchedulerJobRun]:
    """Try to acquire the cross-process job lock.

    Returns the lock row when this process should run the job, or ``None`` when
    another instance owns a fresh lease or the job already completed.
    """
    existing = db.query(SchedulerJobRun).filter(
        SchedulerJobRun.job_name == JOB_NAME,
        SchedulerJobRun.run_key == run_key,
    ).first()

    if existing:
        if existing.status == "completed":
            return None
        if existing.status == "running" and not _is_lease_stale(existing):
            return None
        if existing.status == "failed" and not force:
            # A failed manual run may be retried by the scheduler after the lease
            # window; immediate retries are explicit (force=True).
            if existing.heartbeat_at and parent_connect.utc_now() - existing.heartbeat_at < datetime.timedelta(minutes=_lease_minutes()):
                return None
        existing.status = "running"
        existing.instance_id = _INSTANCE_ID
        existing.attempts = (existing.attempts or 0) + 1
        existing.started_at = parent_connect.utc_now()
        existing.heartbeat_at = parent_connect.utc_now()
        existing.finished_at = None
        db.commit()
        db.refresh(existing)
        return existing

    row = SchedulerJobRun(
        job_name=JOB_NAME,
        run_key=run_key,
        status="running",
        instance_id=_INSTANCE_ID,
        attempts=1,
        started_at=parent_connect.utc_now(),
        heartbeat_at=parent_connect.utc_now(),
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return None
    db.refresh(row)
    return row


def heartbeat(db: Session, row: SchedulerJobRun, details: Optional[Dict[str, Any]] = None) -> None:
    row.heartbeat_at = parent_connect.utc_now()
    if details is not None:
        row.details = json.dumps(details, ensure_ascii=False)
    db.commit()


def finish_job(
    db: Session,
    row: SchedulerJobRun,
    *,
    status: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    row.status = status
    row.finished_at = parent_connect.utc_now()
    row.heartbeat_at = row.finished_at
    if details is not None:
        row.details = json.dumps(details, ensure_ascii=False)
    db.commit()


def run_weekly_job(
    db: Session,
    now: Optional[datetime.datetime] = None,
    *,
    force: bool = False,
    week_start: Optional[datetime.date] = None,
    week_end: Optional[datetime.date] = None,
) -> Dict[str, Any]:
    """Run the weekly report job once, safely deduplicated across instances."""
    if week_start is None or week_end is None:
        week_start, week_end = parent_connect.latest_completed_week(now)

    if not force and not parent_connect.is_week_due(week_end, now):
        return {
            "status": "not_due",
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
        }

    run_key = run_key_for_week(week_start, week_end)
    lock = acquire_job_lock(db, run_key, force=force)
    if not lock:
        return {
            "status": "already_running_or_completed",
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "run_key": run_key,
        }

    try:
        heartbeat(db, lock, {"phase": "generating", "instance": _INSTANCE_ID})
        summary = parent_connect.generate_weekly_reports(
            db, week_start, week_end, generated_by="manual" if force else "scheduler"
        )
        summary["status"] = "completed"
        summary["instance_id"] = _INSTANCE_ID
        finish_job(db, lock, status="completed", details=summary)
        logger.info(
            "ParentConnect weekly job completed for %s..%s: %s",
            week_start,
            week_end,
            summary,
        )
        return summary
    except Exception as exc:
        db.rollback()
        logger.exception("ParentConnect weekly job failed for %s..%s", week_start, week_end)
        try:
            finish_job(
                db,
                lock,
                status="failed",
                details={
                    "week_start": week_start.isoformat(),
                    "week_end": week_end.isoformat(),
                    "error": f"{type(exc).__name__}: {exc}"[:480],
                    "instance_id": _INSTANCE_ID,
                },
            )
        except Exception:  # pragma: no cover - defensive
            db.rollback()
        return {
            "status": "failed",
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "error": f"{type(exc).__name__}: {exc}"[:480],
        }


def next_run_info(now: Optional[datetime.datetime] = None) -> Dict[str, Any]:
    now_ist = now.astimezone(parent_connect.IST_TZ) if now and now.tzinfo else (now or parent_connect.ist_now())
    week_start, week_end = parent_connect.latest_completed_week(now_ist)
    scheduled = parent_connect.week_schedule_time_ist(week_end)
    if now_ist >= scheduled:
        upcoming_end = week_end + datetime.timedelta(days=7)
        scheduled = parent_connect.week_schedule_time_ist(upcoming_end)
        upcoming_start = upcoming_end - datetime.timedelta(days=6)
    else:
        upcoming_start = week_start
    upcoming_end = scheduled.date() - datetime.timedelta(days=1)
    return {
        "next_run_at_ist": scheduled.isoformat(),
        "next_reporting_week_start": upcoming_start.isoformat(),
        "next_reporting_week_end": upcoming_end.isoformat(),
        "timezone": "Asia/Kolkata (UTC+05:30)",
    }


def _loop(stop_event: threading.Event) -> None:
    logger.info(
        "ParentConnect scheduler started (instance=%s, poll=%ss)",
        _INSTANCE_ID,
        settings.PARENT_CONNECT_SCHEDULER_POLL_SECONDS,
    )
    while not stop_event.is_set():
        db = SessionLocal()
        try:
            result = run_weekly_job(db)
            if result.get("status") not in ("not_due", "already_running_or_completed"):
                logger.info("ParentConnect scheduler result: %s", result.get("status"))
        except Exception:  # pragma: no cover - defensive background isolation
            logger.exception("ParentConnect scheduler poll failed")
            try:
                db.rollback()
            except Exception:
                pass
        finally:
            db.close()
        stop_event.wait(max(5, settings.PARENT_CONNECT_SCHEDULER_POLL_SECONDS))
    logger.info("ParentConnect scheduler stopped (instance=%s)", _INSTANCE_ID)


def start_scheduler() -> bool:
    """Start the background scheduler once per process."""
    global _THREAD
    if not settings.PARENT_CONNECT_SCHEDULER_ENABLED:
        logger.info("ParentConnect scheduler disabled by configuration")
        return False
    if os.getenv("PYTEST_CURRENT_TEST"):
        logger.info("ParentConnect scheduler not started under pytest")
        return False
    with _THREAD_LOCK:
        if _THREAD and _THREAD.is_alive():
            return False
        _STOP_EVENT.clear()
        _THREAD = threading.Thread(target=_loop, args=(_STOP_EVENT,), name="parent-connect-scheduler", daemon=True)
        _THREAD.start()
        return True


def stop_scheduler(timeout: float = 2.0) -> bool:
    """Stop the background scheduler (used by tests and graceful shutdown)."""
    global _THREAD
    with _THREAD_LOCK:
        thread = _THREAD
        if not thread or not thread.is_alive():
            return False
        _STOP_EVENT.set()
        thread.join(timeout=timeout)
        _THREAD = None
        return True


def scheduler_running() -> bool:
    return bool(_THREAD and _THREAD.is_alive())
