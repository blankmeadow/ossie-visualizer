from __future__ import annotations

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .billing import entitlements
from .config import settings
from .db import get_db
from .models import AnalyticsEvent, Child

CHILD_HEADER = "X-Child-Id"


def get_current_child(
    x_child_id: str | None = Header(default=None, alias=CHILD_HEADER),
    db: Session = Depends(get_db),
) -> Child:
    """Section 32: no sign-up wall. A device holds an anonymous child id from
    its first import; account linking happens later, once there is something
    worth saving."""
    if x_child_id:
        child = db.get(Child, x_child_id)
        if child is not None:
            return child
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "unknown child id")

    if settings.debug:
        child = db.scalars(select(Child).order_by(Child.created_at).limit(1)).first()
        if child is not None:
            return child

    raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"missing {CHILD_HEADER}")


def create_anonymous_child(db: Session, grade: int = 3) -> Child:
    child = Child(grade=grade, daily_goal=settings.default_daily_goal)
    db.add(child)
    db.flush()
    entitlements.ensure_defaults(db, child.id)
    return child


def track(db: Session, child_id: str | None, name: str, **payload) -> None:
    db.add(AnalyticsEvent(child_id=child_id, name=name, payload=payload))
