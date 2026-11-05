"""Parent-student relationship invariants.

UDAAN allows **one** parent relationship per student at a time:

* ``pending`` reserves the student while the request waits for the student.
* ``verified`` is the single approved relationship.
* ``rejected``, ``revoked`` and ``expired`` release the student.

The application checks this before writing, and the database enforces it with
a partial unique index on ``parent_student_links.student_id`` for the
``pending``/``verified`` statuses (created by
``app.database.enforce_single_active_parent``). This module centralises the
application-level checks so every entry point behaves identically.
"""
from __future__ import annotations

import datetime
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import ParentStudentLink, RelationshipAuditLog

ACTIVE_STATUSES = ("pending", "verified")
GENERIC_ALREADY_CONNECTED = "This student is already connected to a parent account."


@dataclass
class ConnectionCheck:
    """Result of checking a student's current reservation."""

    same_parent_link: Optional[ParentStudentLink]
    active_link: Optional[ParentStudentLink]

    @property
    def held_by_another_parent(self) -> bool:
        if not self.active_link or not self.same_parent_link:
            return bool(self.active_link)
        return self.active_link.id != self.same_parent_link.id


def _now(now: Optional[datetime.datetime] = None) -> datetime.datetime:
    return now or datetime.datetime.utcnow()


def pending_expiry(now: Optional[datetime.datetime] = None) -> datetime.datetime:
    return _now(now) + datetime.timedelta(
        days=max(1, settings.PARENT_CONNECTION_REQUEST_EXPIRE_DAYS)
    )


def add_audit(
    db: Session,
    link: ParentStudentLink,
    *,
    performed_by_id: Optional[int],
    action: str,
    previous_status: Optional[str],
    new_status: str,
    notes: Optional[str] = None,
) -> RelationshipAuditLog:
    record = RelationshipAuditLog(
        link_id=link.id,
        performed_by_id=performed_by_id,
        action=action,
        previous_status=previous_status,
        new_status=new_status,
        notes=notes,
    )
    db.add(record)
    return record


def expire_stale_pending_links(
    db: Session,
    *,
    student_id: Optional[int] = None,
    now: Optional[datetime.datetime] = None,
) -> int:
    """Release pending requests whose reservation window has elapsed."""
    now = _now(now)
    query = db.query(ParentStudentLink).filter(
        ParentStudentLink.status == "pending",
        ParentStudentLink.expires_at.isnot(None),
        ParentStudentLink.expires_at < now,
    )
    if student_id is not None:
        query = query.filter(ParentStudentLink.student_id == student_id)
    expired = query.all()
    for link in expired:
        previous = link.status
        link.status = "expired"
        link.notes = "Pending parent request expired automatically"
        add_audit(
            db,
            link,
            performed_by_id=None,
            action="expired",
            previous_status=previous,
            new_status="expired",
            notes="Pending request expired; the student is free to connect another parent.",
        )
    if expired:
        db.flush()
    return len(expired)


def active_link_for_student(
    db: Session,
    student_id: int,
    *,
    now: Optional[datetime.datetime] = None,
) -> Optional[ParentStudentLink]:
    expire_stale_pending_links(db, student_id=student_id, now=now)
    return (
        db.query(ParentStudentLink)
        .filter(
            ParentStudentLink.student_id == student_id,
            ParentStudentLink.status.in_(ACTIVE_STATUSES),
        )
        .order_by(ParentStudentLink.id.asc())
        .first()
    )


def link_for_pair(
    db: Session, parent_id: int, student_id: int
) -> Optional[ParentStudentLink]:
    """Return this parent/student pair's current link.

    The normal model keeps one row per pair and reactivates it on reconnection,
    so its status carries the current relationship. Should legacy data contain
    extra rows, the active row must always win; otherwise a stale revoked row
    could mask a live relationship and wrongly reject the parent.
    """
    links = (
        db.query(ParentStudentLink)
        .filter(
            ParentStudentLink.parent_id == parent_id,
            ParentStudentLink.student_id == student_id,
        )
        .order_by(ParentStudentLink.id.desc())
        .all()
    )
    for link in links:
        if link.status in ACTIVE_STATUSES:
            return link
    return links[0] if links else None


def check_connection(
    db: Session,
    parent_id: int,
    student_id: int,
    *,
    now: Optional[datetime.datetime] = None,
) -> ConnectionCheck:
    """Return the same-parent link (if any) and the student's active link."""
    active = active_link_for_student(db, student_id, now=now)
    same = link_for_pair(db, parent_id, student_id)
    return ConnectionCheck(same_parent_link=same, active_link=active)


def reserve_as_pending(
    db: Session,
    link: ParentStudentLink,
    *,
    relationship_type: Optional[str],
    verification_method: str,
    notes: str,
    now: Optional[datetime.datetime] = None,
) -> None:
    now = _now(now)
    link.status = "pending"
    link.relationship_type = relationship_type or link.relationship_type or "parent"
    link.verification_method = verification_method
    link.verified_by_teacher_id = None
    link.verified_at = None
    link.revoked_at = None
    link.expires_at = pending_expiry(now)
    link.notes = notes
    link.created_at = now


def release_link(
    db: Session,
    link: ParentStudentLink,
    *,
    status: str,
    performed_by_id: Optional[int],
    action: str,
    notes: str,
    now: Optional[datetime.datetime] = None,
) -> str:
    """Move a link to a terminal (releasing) status and audit it."""
    now = _now(now)
    previous = link.status
    link.status = status
    link.expires_at = None
    if status == "revoked":
        link.revoked_at = now
    if status in ("rejected", "revoked", "expired"):
        link.verified_at = None
    link.notes = notes
    add_audit(
        db,
        link,
        performed_by_id=performed_by_id,
        action=action,
        previous_status=previous,
        new_status=status,
        notes=notes,
    )
    return previous
