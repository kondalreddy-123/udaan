#!/usr/bin/env python3
"""UDAAN - Production Weekly Progress Report Sender.

Can be run via cron / task scheduler independently of any browser or running IDE:
    python backend/scripts/send_weekly_reports.py
    python backend/scripts/send_weekly_reports.py --force
    python backend/scripts/send_weekly_reports.py --parent-id 5 --student-id 1

Features:
- Enforces Asia/Kolkata timezone (UTC+05:30)
- Database-backed distributed lock (prevents duplicate runs across servers)
- Delivers only to verified parents with active consent
- Delivers via Resend API to the parent's registered email
- Logs every attempt, provider message ID, and delivery error
"""
import argparse
import logging
import sys
from pathlib import Path

# Ensure backend root is in python path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.config import settings
from app.database import SessionLocal, init_db_schema
from app.models import User, WeeklyProgressReport
from app.services import parent_connect as pc
from app.services import parent_connect_delivery as delivery
from app.services import parent_connect_scheduler as scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("udaan.scripts.send_weekly_reports")


def main() -> int:
    parser = argparse.ArgumentParser(description="Send UDAAN ParentConnect weekly progress reports.")
    parser.add_argument("--force", action="store_true", help="Force immediate generation even if not Sunday/due.")
    parser.add_argument("--parent-id", type=int, help="Optional parent user ID to deliver to.")
    parser.add_argument("--student-id", type=int, help="Optional student user ID.")
    parser.add_argument("--dry-run", action="store_true", help="Calculate report data without delivering emails.")
    args = parser.parse_args()

    init_db_schema()
    db = SessionLocal()

    try:
        logger.info(
            "Starting weekly report job (Provider: %s, From: %s, Force: %s)",
            delivery.email_provider_label(),
            settings.PARENT_CONNECT_EMAIL_FROM,
            args.force,
        )

        if args.parent_id and args.student_id:
            parent = db.query(User).filter(User.id == args.parent_id).first()
            student = db.query(User).filter(User.id == args.student_id).first()
            if not parent or not student:
                logger.error("Parent or student not found.")
                return 1

            contact = pc.get_or_create_contact(db, parent)
            if not contact.is_verified:
                logger.error("Parent %s (%s) is not verified.", parent.id, contact.email)
                return 1

            week_start, week_end = pc.latest_completed_week()
            logger.info("Generating report for %s -> %s (%s..%s)", student.full_name, parent.full_name, week_start, week_end)
            report, created = pc.generate_report_for_pair(db, parent, student, week_start, week_end, generated_by="cli_script")

            if args.dry_run:
                logger.info("DRY-RUN: Report generated (ID %s). Email not sent.", report.id)
                return 0

            res = pc.deliver_report(db, report, force=args.force)
            logger.info("Delivery result for parent %s: %s (Provider ID: %s, Error: %s)", parent.email, res.status, res.provider_message_id, res.error)
            return 0 if res.status == "sent" else 1

        # Run scheduled / batch job across all eligible pairs
        result = scheduler.run_weekly_job(db, force=args.force)
        logger.info("Batch job result: %s", result)
        return 0
    except Exception as exc:
        logger.exception("Error executing weekly report job: %s", exc)
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    sys.exit(main())
