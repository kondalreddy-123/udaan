import datetime
import logging

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

logger = logging.getLogger("udaan.database")

connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(settings.DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def enforce_single_active_parent() -> None:
    """Reconcile legacy data, then enforce one pending/verified parent per student.

    The partial unique index is the database-level guarantee. Existing
    databases created before this invariant may contain several verified rows
    for one student, so those are reconciled first (the oldest verified link is
    kept; every other active link is revoked with an audit record). The
    operation is idempotent and runs on every startup.
    """
    from app import models as m

    now = datetime.datetime.utcnow()
    session = SessionLocal()
    try:
        # 1. Expire reservations whose window elapsed.
        stale = session.query(m.ParentStudentLink).filter(
            m.ParentStudentLink.status == "pending",
            m.ParentStudentLink.expires_at.isnot(None),
            m.ParentStudentLink.expires_at < now,
        ).all()
        for link in stale:
            previous = link.status
            link.status = "expired"
            link.notes = "Pending parent request expired automatically"
            session.add(m.RelationshipAuditLog(
                link_id=link.id,
                performed_by_id=None,
                action="expired",
                previous_status=previous,
                new_status="expired",
                notes="Startup reconciliation: pending request window elapsed.",
            ))

        # 2. Resolve any legacy student that has more than one active link.
        duplicate_rows = session.query(
            m.ParentStudentLink.student_id,
            func.count(m.ParentStudentLink.id),
        ).filter(
            m.ParentStudentLink.status.in_(("pending", "verified"))
        ).group_by(
            m.ParentStudentLink.student_id
        ).having(func.count(m.ParentStudentLink.id) > 1).all()

        reconciled = 0
        for student_id, _count in duplicate_rows:
            links = session.query(m.ParentStudentLink).filter(
                m.ParentStudentLink.student_id == student_id,
                m.ParentStudentLink.status.in_(("pending", "verified")),
            ).all()

            def _rank(link):
                timestamp = link.verified_at or link.created_at or datetime.datetime.min
                return (0 if link.status == "verified" else 1, timestamp, link.id)

            links.sort(key=_rank)
            keeper = links[0]
            for extra in links[1:]:
                previous = extra.status
                extra.status = "revoked"
                extra.revoked_at = now
                extra.expires_at = None
                extra.notes = (
                    f"Reconciled at startup: student already had an active parent link "
                    f"(link {keeper.id})."
                )
                session.add(m.RelationshipAuditLog(
                    link_id=extra.id,
                    performed_by_id=None,
                    action="reconciled_single_parent",
                    previous_status=previous,
                    new_status="revoked",
                    notes=(
                        "Startup reconciliation revoked a duplicate active parent link. "
                        f"Kept link {keeper.id} for student {student_id}."
                    ),
                ))
                reconciled += 1

        session.commit()
        if stale or reconciled:
            logger.info(
                "Parent relationship reconciliation: %s expired, %s duplicate links revoked",
                len(stale),
                reconciled,
            )
    except Exception:
        session.rollback()
        logger.exception("Parent relationship reconciliation failed")
        raise
    finally:
        session.close()

    # 3. Database-level invariant. SQLite and PostgreSQL support partial
    #    indexes; this project ships with SQLite, while PostgreSQL is the
    #    documented production option.
    dialect = engine.dialect.name
    if dialect in ("sqlite", "postgresql"):
        with engine.begin() as conn:
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_active_parent_per_student "
                "ON parent_student_links (student_id) "
                "WHERE status IN ('pending', 'verified')"
            ))
    else:
        logger.warning(
            "Database dialect %s does not support partial indexes; "
            "one-parent-per-student is enforced in the application layer only.",
            dialect,
        )


def init_db_schema():
    from app import models  # Ensure all model tables are registered with Base.metadata
    Base.metadata.create_all(bind=engine)
    if settings.DATABASE_URL.startswith("sqlite"):
        with engine.connect() as conn:
            # Check users columns
            cols = [row[1] for row in conn.execute(text("PRAGMA table_info(users)")).fetchall()]
            if "class_name" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN class_name VARCHAR(100) DEFAULT 'Class 8 - Section A'"))
            if "grade" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN grade INTEGER DEFAULT 8"))
            if "created_by" not in cols:
                conn.execute(text("ALTER TABLE users ADD COLUMN created_by VARCHAR(255)"))
            
            # Check concept_masteries columns
            cm_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(concept_masteries)")).fetchall()]
            if "attempts_count" not in cm_cols:
                conn.execute(text("ALTER TABLE concept_masteries ADD COLUMN attempts_count INTEGER DEFAULT 0"))
            if "last_attempt_at" not in cm_cols:
                conn.execute(text("ALTER TABLE concept_masteries ADD COLUMN last_attempt_at DATETIME"))

            # Check parent_student_links columns
            psl_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_student_links)")).fetchall()]
            if psl_cols and "revoked_at" not in psl_cols:
                conn.execute(text("ALTER TABLE parent_student_links ADD COLUMN revoked_at DATETIME"))
            if psl_cols and "notes" not in psl_cols:
                conn.execute(text("ALTER TABLE parent_student_links ADD COLUMN notes TEXT"))
            if psl_cols and "expires_at" not in psl_cols:
                conn.execute(text("ALTER TABLE parent_student_links ADD COLUMN expires_at DATETIME"))
            if psl_cols and "school_name" not in psl_cols:
                conn.execute(text("ALTER TABLE parent_student_links ADD COLUMN school_name VARCHAR(255)"))
            if psl_cols and "teacher_name" not in psl_cols:
                conn.execute(text("ALTER TABLE parent_student_links ADD COLUMN teacher_name VARCHAR(255)"))

            # Check parent_profiles columns (Phase 3 notification preference placeholder)
            pp_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_profiles)")).fetchall()]
            if pp_cols and "notification_preference" not in pp_cols:
                conn.execute(text("ALTER TABLE parent_profiles ADD COLUMN notification_preference VARCHAR(30) DEFAULT 'not_configured'"))
            # Phase 4: consent-aware notification channels
            if pp_cols and "notifications_consent" not in pp_cols:
                conn.execute(text("ALTER TABLE parent_profiles ADD COLUMN notifications_consent BOOLEAN DEFAULT 1"))
            if pp_cols and "notify_in_app" not in pp_cols:
                conn.execute(text("ALTER TABLE parent_profiles ADD COLUMN notify_in_app BOOLEAN DEFAULT 1"))
            if pp_cols and "notify_email" not in pp_cols:
                conn.execute(text("ALTER TABLE parent_profiles ADD COLUMN notify_email BOOLEAN DEFAULT 0"))
            if pp_cols and "notify_voice" not in pp_cols:
                conn.execute(text("ALTER TABLE parent_profiles ADD COLUMN notify_voice BOOLEAN DEFAULT 0"))

            # Check parent_invitations columns (Phase 3 assisted account setup)
            pi_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_invitations)")).fetchall()]
            if pi_cols and "target_parent_id" not in pi_cols:
                conn.execute(text("ALTER TABLE parent_invitations ADD COLUMN target_parent_id INTEGER REFERENCES users(id)"))

            # Check parent_contacts columns
            pc_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_contacts)")).fetchall()]
            if pc_cols:
                if "pending_email" not in pc_cols:
                    conn.execute(text("ALTER TABLE parent_contacts ADD COLUMN pending_email VARCHAR(255)"))
                if "pending_email_otp_hash" not in pc_cols:
                    conn.execute(text("ALTER TABLE parent_contacts ADD COLUMN pending_email_otp_hash VARCHAR(128)"))
                if "pending_email_otp_expires_at" not in pc_cols:
                    conn.execute(text("ALTER TABLE parent_contacts ADD COLUMN pending_email_otp_expires_at DATETIME"))
                if "pending_email_otp_sent_at" not in pc_cols:
                    conn.execute(text("ALTER TABLE parent_contacts ADD COLUMN pending_email_otp_sent_at DATETIME"))
                if "pending_email_otp_attempts" not in pc_cols:
                    conn.execute(text("ALTER TABLE parent_contacts ADD COLUMN pending_email_otp_attempts INTEGER DEFAULT 0"))

            # Check parent_notification_preferences columns
            pnp_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_notification_preferences)")).fetchall()]
            if pnp_cols:
                if "delivery_day" not in pnp_cols:
                    conn.execute(text("ALTER TABLE parent_notification_preferences ADD COLUMN delivery_day VARCHAR(20) DEFAULT 'Sunday'"))
                if "delivery_time" not in pnp_cols:
                    conn.execute(text("ALTER TABLE parent_notification_preferences ADD COLUMN delivery_time VARCHAR(10) DEFAULT '18:00'"))

            # Parent-teacher threads can now be started by either side.
            ptm_cols = [row[1] for row in conn.execute(text("PRAGMA table_info(parent_teacher_messages)")).fetchall()]
            if ptm_cols and "initiated_by_role" not in ptm_cols:
                conn.execute(text("ALTER TABLE parent_teacher_messages ADD COLUMN initiated_by_role VARCHAR(20) NOT NULL DEFAULT 'parent'"))

            # System actions (automatic expiry/reconciliation) have no acting
            # user, so the audit column must allow NULL. SQLite cannot drop a
            # NOT NULL constraint in place, so rebuild the (small) table once.
            audit_cols = conn.execute(text("PRAGMA table_info(relationship_audit_logs)")).fetchall()
            performed_col = next((row for row in audit_cols if row[1] == "performed_by_id"), None)
            if performed_col and bool(performed_col[3]):
                conn.commit()
                conn.execute(text(
                    """
                    CREATE TABLE relationship_audit_logs_new (
                        id INTEGER NOT NULL,
                        link_id INTEGER NOT NULL,
                        performed_by_id INTEGER,
                        action VARCHAR(50) NOT NULL,
                        previous_status VARCHAR(50),
                        new_status VARCHAR(50) NOT NULL,
                        notes TEXT,
                        created_at DATETIME,
                        PRIMARY KEY (id),
                        FOREIGN KEY(link_id) REFERENCES parent_student_links (id),
                        FOREIGN KEY(performed_by_id) REFERENCES users (id)
                    )
                    """
                ))
                conn.execute(text(
                    """
                    INSERT INTO relationship_audit_logs_new
                        (id, link_id, performed_by_id, action, previous_status, new_status, notes, created_at)
                    SELECT
                        id, link_id, performed_by_id, action, previous_status, new_status, notes, created_at
                    FROM relationship_audit_logs
                    """
                ))
                conn.execute(text("DROP TABLE relationship_audit_logs"))
                conn.execute(text(
                    "ALTER TABLE relationship_audit_logs_new RENAME TO relationship_audit_logs"
                ))
            conn.commit()

    enforce_single_active_parent()

init_db_schema()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
