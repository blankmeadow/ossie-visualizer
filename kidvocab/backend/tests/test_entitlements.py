"""Commercial boundary -- spec sections 45, 46, 47.

The product promise being defended here: learning is never metered, and a
failed AI import never costs the parent anything.
"""
from __future__ import annotations

import pytest

from app.billing import entitlements
from app.billing.entitlements import QuotaExhausted
from app.enums import FeatureCode, PeriodType, QuotaType


def test_new_account_gets_three_free_imports(db, child):
    state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    assert state.remaining == 3
    assert state.available


def test_manual_add_is_never_metered(db, child):
    """Section 45.5 -- the free escape hatch must stay open forever."""
    state = entitlements.get_state(db, child.id, FeatureCode.MANUAL_VOCABULARY_ADD)
    assert state.unlimited
    for _ in range(50):
        entitlements.consume(db, child.id, FeatureCode.MANUAL_VOCABULARY_ADD)
    assert entitlements.get_state(db, child.id, FeatureCode.MANUAL_VOCABULARY_ADD).available


def test_quota_runs_out_on_the_fourth_import(db, child):
    for _ in range(3):
        entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    assert state.remaining == 0
    with pytest.raises(QuotaExhausted):
        entitlements.check(db, child.id, FeatureCode.AI_IMAGE_IMPORT)


def test_the_free_number_is_not_hard_coded_anywhere(db, child):
    """Section 46 -- product can change the offer without a code change."""
    entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    entitlements.grant(
        db,
        child.id,
        FeatureCode.AI_IMAGE_IMPORT,
        quota_total=30,
        quota_type=QuotaType.PERIODIC,
        period_type=PeriodType.MONTHLY,
    )
    state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    assert state.remaining == 29  # the spent one is remembered
    assert state.period_end is not None


def test_consume_cannot_overdraw(db, child):
    entitlements.grant(db, child.id, FeatureCode.AI_IMAGE_IMPORT, quota_total=1)
    entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    with pytest.raises(QuotaExhausted):
        entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
