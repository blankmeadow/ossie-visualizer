from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..billing import entitlements
from ..db import get_db
from ..deps import create_anonymous_child, get_current_child
from ..learning import scheduler
from ..models import Child
from ..schemas import AnonymousSession, ProfileOut, ProfileUpdate
from ..services import vocabulary as vocab_service

router = APIRouter(tags=["profile"])


@router.post("/auth/anonymous", response_model=AnonymousSession, status_code=201)
def start_anonymous(db: Session = Depends(get_db)) -> AnonymousSession:
    child = create_anonymous_child(db)
    return AnonymousSession(child_id=child.id)


def _profile(db: Session, child: Child) -> ProfileOut:
    return ProfileOut(
        child_id=child.id,
        nickname=child.nickname,
        grade=child.grade,
        daily_goal=child.daily_goal,
        sound_enabled=child.sound_enabled,
        streak_days=scheduler.current_streak(db, child.id),
        days_completed_this_week=scheduler.days_completed_this_week(db, child.id),
        vocabulary_count=vocab_service.library_size(db, child.id),
        entitlements=[s.as_dict() for s in entitlements.get_all(db, child.id)],
    )


@router.get("/profile", response_model=ProfileOut)
def read_profile(
    child: Child = Depends(get_current_child), db: Session = Depends(get_db)
) -> ProfileOut:
    return _profile(db, child)


@router.put("/profile", response_model=ProfileOut)
def update_profile(
    body: ProfileUpdate,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> ProfileOut:
    if body.nickname is not None:
        child.nickname = body.nickname.strip() or None
    if body.grade is not None:
        child.grade = body.grade
    if body.daily_goal is not None:
        child.daily_goal = body.daily_goal
    if body.sound_enabled is not None:
        child.sound_enabled = body.sound_enabled
    db.flush()
    return _profile(db, child)


@router.get("/entitlements")
def read_entitlements(
    child: Child = Depends(get_current_child), db: Session = Depends(get_db)
) -> dict:
    return {"items": [s.as_dict() for s in entitlements.get_all(db, child.id)]}
