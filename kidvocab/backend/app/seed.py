"""Populate a demo child so the app has something to show on first launch.

Run with:  python -m app.seed
"""
from __future__ import annotations

import io
import os
import random
import sys
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from .ai.pipeline import analyze_source
from .ai.providers.mock import FIXTURE_PAGES
from .billing import entitlements
from .config import settings
from .db import SessionLocal, init_db
from .deps import create_anonymous_child
from .enums import FeatureCode, SourceType
from .learning import scheduler
from .models import Child, Source, SourceImage, StudyDay
from .services import vocabulary as vocab_service
from .storage import save_upload

EXTRA_ITEMS = [
    ("suddenly", None),
    ("be afraid of", None),
    ("give up", None),
    ("find out", None),
    ("wake up", None),
    ("a lot of", None),
    ("mountain", None),
    ("beautiful", None),
    ("remember", None),
    ("in front of", None),
]


def seed(reset: bool = False) -> str:
    init_db()
    db = SessionLocal()
    try:
        if reset:
            for child in db.scalars(select(Child)):
                db.delete(child)
            db.commit()

        child = db.scalars(select(Child).order_by(Child.created_at)).first()
        if child is None:
            child = create_anonymous_child(db, grade=3)
        child.nickname = child.nickname or "小宇"
        child.grade = 3
        child.daily_goal = settings.default_daily_goal
        db.flush()

        # Three photo imports -- exactly the free allowance (section 45.3).
        for index, page in enumerate(FIXTURE_PAGES, start=1):
            source = Source(
                child_id=child.id,
                title=f"学习材料 · 示例 {index}",
                source_type=SourceType.PHOTO,
            )
            db.add(source)
            db.flush()
            path, _url = save_upload(
                io.BytesIO(page.encode()), f"demo-{index}.txt", subdir=source.id
            )
            db.add(SourceImage(source_id=source.id, image_url=path, page_no=1))
            db.flush()

            outcome = analyze_source(db, source, child)
            source.status = outcome.status
            if outcome.should_consume_quota and not source.quota_consumed:
                try:
                    entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
                    source.quota_consumed = True
                except Exception:  # noqa: BLE001 - demo data, quota already spent
                    pass
            vocab_service.confirm_candidates(db, child, source, None)
            db.flush()

        for text, meaning in EXTRA_ITEMS:
            vocab_service.manual_add(db, child, text=text, meaning=meaning)

        _fake_history(db, child)
        db.commit()

        size = vocab_service.library_size(db, child.id)
        streak = scheduler.current_streak(db, child.id)
        state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
        print(f"demo child : {child.id}")
        print(f"library    : {size} 个单词和短语")
        print(f"streak     : 连续 {streak} 天")
        print(f"AI imports : 剩余 {state.remaining} 次")
        print(f"today      : {scheduler.plan_today(db, child).total} 个")
        return child.id
    finally:
        db.close()


def _fake_history(db, child: Child) -> None:
    """Six completed days before today, so the streak and weekly count on the
    profile page have something honest to render."""
    today = datetime.now(UTC).date()
    rng = random.Random(11)
    for offset in range(1, 7):
        day = today - timedelta(days=offset)
        existing = db.scalar(
            select(StudyDay).where(StudyDay.child_id == child.id, StudyDay.day == day)
        )
        if existing:
            continue
        answered = rng.randint(18, 22)
        db.add(
            StudyDay(
                child_id=child.id,
                day=day,
                planned_count=child.daily_goal,
                answered_count=answered,
                correct_count=int(answered * rng.uniform(0.8, 1.0)),
                duration_ms=rng.randint(6, 11) * 60_000,
                completed=True,
            )
        )
    db.flush()


if __name__ == "__main__":
    os.makedirs(settings.media_root, exist_ok=True)
    seed(reset="--reset" in sys.argv)
