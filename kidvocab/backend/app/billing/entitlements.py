"""Feature / quota layer (spec section 46).

The rule that matters: ``free_ai_image_import_quota = 3`` is a *default used
once, at grant time*. Nothing downstream ever asks "is this user free?" -- it
asks "does this user have quota left on AI_IMAGE_IMPORT?". That is what lets
product try monthly quotas, referral bonuses, Pro tiers or AI credits without
touching the import pipeline.

Section 45.5: learning features are never metered. ``MANUAL_VOCABULARY_ADD``
is granted UNLIMITED and stays that way.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..enums import FeatureCode, PeriodType, QuotaType
from ..models import UserEntitlement


@dataclass(frozen=True)
class Grant:
    quota_type: QuotaType
    quota_total: int
    period_type: PeriodType = PeriodType.NONE


#: What a brand-new account gets. Product strategy lives here, not in code paths.
DEFAULT_GRANTS: dict[FeatureCode, Grant] = {
    FeatureCode.AI_IMAGE_IMPORT: Grant(QuotaType.TOTAL, settings.free_ai_image_import_quota),
    FeatureCode.MANUAL_VOCABULARY_ADD: Grant(QuotaType.UNLIMITED, 0),
    FeatureCode.PDF_IMPORT: Grant(QuotaType.TOTAL, 0),
    FeatureCode.BOOK_IMPORT: Grant(QuotaType.TOTAL, 0),
    FeatureCode.AI_EXAMPLE_GENERATION: Grant(QuotaType.TOTAL, 0),
    FeatureCode.AI_ANIMATION: Grant(QuotaType.TOTAL, 0),
}


class QuotaExhausted(Exception):
    def __init__(self, feature: FeatureCode, state: "EntitlementState") -> None:
        super().__init__(f"quota exhausted for {feature}")
        self.feature = feature
        self.state = state


@dataclass
class EntitlementState:
    feature_code: FeatureCode
    quota_type: QuotaType
    quota_total: int
    quota_used: int
    period_end: datetime | None = None

    @property
    def unlimited(self) -> bool:
        return self.quota_type is QuotaType.UNLIMITED

    @property
    def remaining(self) -> int | None:
        if self.unlimited:
            return None
        return max(0, self.quota_total - self.quota_used)

    @property
    def available(self) -> bool:
        return self.unlimited or (self.remaining or 0) > 0

    def as_dict(self) -> dict:
        return {
            "feature_code": self.feature_code.value,
            "quota_type": self.quota_type.value,
            "unlimited": self.unlimited,
            "quota_total": self.quota_total,
            "quota_used": self.quota_used,
            "remaining": self.remaining,
            "available": self.available,
            "period_end": self.period_end.isoformat() if self.period_end else None,
        }


def _period_bounds(period_type: PeriodType, now: datetime) -> tuple[datetime | None, datetime | None]:
    if period_type is PeriodType.MONTHLY:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = (start + timedelta(days=32)).replace(day=1)
        return start, end
    if period_type is PeriodType.WEEKLY:
        start = (now - timedelta(days=now.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        return start, start + timedelta(days=7)
    return None, None


def ensure_defaults(db: Session, user_id: str) -> None:
    existing = set(
        db.scalars(select(UserEntitlement.feature_code).where(UserEntitlement.user_id == user_id))
    )
    now = datetime.now(UTC)
    for feature, grant in DEFAULT_GRANTS.items():
        if feature.value in existing or feature in existing:
            continue
        start, end = _period_bounds(grant.period_type, now)
        db.add(
            UserEntitlement(
                user_id=user_id,
                feature_code=feature,
                quota_type=grant.quota_type,
                quota_total=grant.quota_total,
                quota_used=0,
                period_type=grant.period_type,
                period_start=start,
                period_end=end,
            )
        )
    db.flush()


def _row(db: Session, user_id: str, feature: FeatureCode) -> UserEntitlement:
    ensure_defaults(db, user_id)
    row = db.scalar(
        select(UserEntitlement).where(
            UserEntitlement.user_id == user_id, UserEntitlement.feature_code == feature
        )
    )
    if row is None:  # a feature added after this account was created
        grant = DEFAULT_GRANTS.get(feature, Grant(QuotaType.TOTAL, 0))
        start, end = _period_bounds(grant.period_type, datetime.now(UTC))
        row = UserEntitlement(
            user_id=user_id,
            feature_code=feature,
            quota_type=grant.quota_type,
            quota_total=grant.quota_total,
            period_type=grant.period_type,
            period_start=start,
            period_end=end,
        )
        db.add(row)
        db.flush()
    _roll_period(db, row)
    return row


def _roll_period(db: Session, row: UserEntitlement) -> None:
    if row.period_type is PeriodType.NONE or row.period_type == PeriodType.NONE.value:
        return
    now = datetime.now(UTC)
    end = row.period_end
    if end is not None and end.tzinfo is None:
        end = end.replace(tzinfo=UTC)
    if end is None or now < end:
        return
    start, new_end = _period_bounds(PeriodType(row.period_type), now)
    row.period_start, row.period_end, row.quota_used = start, new_end, 0
    db.flush()


def get_state(db: Session, user_id: str, feature: FeatureCode) -> EntitlementState:
    row = _row(db, user_id, feature)
    return EntitlementState(
        feature_code=FeatureCode(row.feature_code),
        quota_type=QuotaType(row.quota_type),
        quota_total=row.quota_total,
        quota_used=row.quota_used,
        period_end=row.period_end,
    )


def get_all(db: Session, user_id: str) -> list[EntitlementState]:
    ensure_defaults(db, user_id)
    return [get_state(db, user_id, feature) for feature in DEFAULT_GRANTS]


def check(db: Session, user_id: str, feature: FeatureCode) -> EntitlementState:
    """Raise if the feature is unavailable. Does **not** consume anything."""
    state = get_state(db, user_id, feature)
    if not state.available:
        raise QuotaExhausted(feature, state)
    return state


def consume(db: Session, user_id: str, feature: FeatureCode, amount: int = 1) -> EntitlementState:
    """Spend quota. Section 47: callers must only reach here once the service
    has actually been delivered."""
    row = _row(db, user_id, feature)
    if QuotaType(row.quota_type) is QuotaType.UNLIMITED:
        return get_state(db, user_id, feature)
    if row.quota_used + amount > row.quota_total:
        raise QuotaExhausted(feature, get_state(db, user_id, feature))
    row.quota_used += amount
    db.flush()
    return get_state(db, user_id, feature)


def grant(
    db: Session,
    user_id: str,
    feature: FeatureCode,
    *,
    quota_total: int,
    quota_type: QuotaType = QuotaType.TOTAL,
    period_type: PeriodType = PeriodType.NONE,
    reset_used: bool = False,
) -> EntitlementState:
    """Add or replace an entitlement -- purchase, referral bonus, campaign gift."""
    row = _row(db, user_id, feature)
    start, end = _period_bounds(period_type, datetime.now(UTC))
    row.quota_type = quota_type
    row.quota_total = quota_total
    row.period_type = period_type
    row.period_start = start
    row.period_end = end
    if reset_used:
        row.quota_used = 0
    db.flush()
    return get_state(db, user_id, feature)
