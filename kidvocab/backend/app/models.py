"""Persistence layer -- a direct transcription of spec section 33.

Two deliberate separations, both from section 28:

* ``ChildVocabulary`` carries four independent skill scores (how to test next)
  AND the SRS fields (when to test next). They are never collapsed into a
  single "mastery = 72%" number.
* ``ReviewLog`` rows are append-only and never pruned: they are the raw
  material for a better memory model later.
"""
from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .enums import (
    AnalysisStatus,
    FeatureCode,
    LearnStatus,
    PeriodType,
    QuotaType,
    SourceType,
    VocabType,
)


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(UTC)


class Child(Base):
    __tablename__ = "children"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    nickname: Mapped[str | None] = mapped_column(String(64), nullable=True)
    grade: Mapped[int] = mapped_column(Integer, default=3)
    daily_goal: Mapped[int] = mapped_column(Integer, default=20)
    sound_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    sources: Mapped[list["Source"]] = relationship(back_populates="child")
    vocabulary: Mapped[list["ChildVocabulary"]] = relationship(back_populates="child")


class Source(Base):
    """One learning material the parent handed over -- a textbook spread, a
    picture book, a worksheet, or a single manual entry."""

    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    source_type: Mapped[SourceType] = mapped_column(String(16), default=SourceType.PHOTO)
    status: Mapped[AnalysisStatus] = mapped_column(String(16), default=AnalysisStatus.DRAFT)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    quota_consumed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    child: Mapped[Child] = relationship(back_populates="sources")
    images: Mapped[list["SourceImage"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="SourceImage.page_no"
    )
    sentences: Mapped[list["Sentence"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="Sentence.order_no"
    )
    candidates: Mapped[list["AnalysisCandidate"]] = relationship(
        back_populates="source", cascade="all, delete-orphan", order_by="AnalysisCandidate.rank"
    )


class SourceImage(Base):
    __tablename__ = "source_images"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    image_url: Mapped[str] = mapped_column(String(500))
    page_no: Mapped[int] = mapped_column(Integer, default=1)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    source: Mapped[Source] = relationship(back_populates="images")


class Sentence(Base):
    """A restored line of the original material. This is what makes the
    original-sentence example (section 10) possible at all."""

    __tablename__ = "sentences"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    source_image_id: Mapped[str | None] = mapped_column(
        ForeignKey("source_images.id"), nullable=True
    )
    text: Mapped[str] = mapped_column(Text)
    order_no: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    source: Mapped[Source] = relationship(back_populates="sentences")


class VocabularyItem(Base):
    """A word or a phrase in its canonical form. Shared across children; the
    per-child learning state lives in ChildVocabulary."""

    __tablename__ = "vocabulary_items"
    __table_args__ = (UniqueConstraint("lemma", "type", name="uq_vocab_lemma_type"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    lemma: Mapped[str] = mapped_column(String(120), index=True)
    type: Mapped[VocabType] = mapped_column(String(8), default=VocabType.WORD)
    meaning: Mapped[str] = mapped_column(String(200), default="")
    phonetic: Mapped[str | None] = mapped_column(String(120), nullable=True)
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class VocabularyOccurrence(Base):
    """Every sighting of an item in the child's own material. Saved in full
    (section 10.1) even though the UI shows at most three."""

    __tablename__ = "vocabulary_occurrences"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"), index=True)
    vocabulary_item_id: Mapped[str] = mapped_column(ForeignKey("vocabulary_items.id"), index=True)
    sentence_id: Mapped[str] = mapped_column(ForeignKey("sentences.id"), index=True)
    surface_form: Mapped[str] = mapped_column(String(120))
    start_offset: Mapped[int] = mapped_column(Integer, default=0)
    end_offset: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    sentence: Mapped[Sentence] = relationship()
    item: Mapped[VocabularyItem] = relationship()


class ChildVocabulary(Base):
    __tablename__ = "child_vocabulary"
    __table_args__ = (
        UniqueConstraint("child_id", "vocabulary_item_id", name="uq_child_vocab"),
        Index("ix_child_vocab_due", "child_id", "next_review_at"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"), index=True)
    vocabulary_item_id: Mapped[str] = mapped_column(ForeignKey("vocabulary_items.id"), index=True)

    status: Mapped[LearnStatus] = mapped_column(String(16), default=LearnStatus.NEW)

    first_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    seen_count: Mapped[int] = mapped_column(Integer, default=1)

    # Mastery -- "how do we test this next?" (section 28)
    meaning_score: Mapped[float] = mapped_column(Float, default=0.0)
    reverse_score: Mapped[float] = mapped_column(Float, default=0.0)
    spelling_score: Mapped[float] = mapped_column(Float, default=0.0)
    context_score: Mapped[float] = mapped_column(Float, default=0.0)

    # SRS -- "when do we test this next?" (section 28)
    srs_level: Mapped[int] = mapped_column(Integer, default=0)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    last_review_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    review_count: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    wrong_count: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_wrong: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    child: Mapped[Child] = relationship(back_populates="vocabulary")
    item: Mapped[VocabularyItem] = relationship(lazy="joined")


class ReviewLog(Base):
    """Append-only. Section 33.7: never delete these."""

    __tablename__ = "review_logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_vocabulary_id: Mapped[str] = mapped_column(
        ForeignKey("child_vocabulary.id"), index=True
    )
    question_type: Mapped[str] = mapped_column(String(24))
    question_payload: Mapped[dict] = mapped_column(JSON, default=dict)
    answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    correct: Mapped[bool] = mapped_column(Boolean, default=False)
    hint_count: Mapped[int] = mapped_column(Integer, default=0)
    response_time_ms: Mapped[int] = mapped_column(Integer, default=0)
    reviewed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class StudyDay(Base):
    """Backs the streak and the weekly count on the profile page (section 31)."""

    __tablename__ = "study_days"
    __table_args__ = (UniqueConstraint("child_id", "day", name="uq_study_day"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_id: Mapped[str] = mapped_column(ForeignKey("children.id"), index=True)
    day: Mapped[datetime] = mapped_column(Date, index=True)
    answered_count: Mapped[int] = mapped_column(Integer, default=0)
    planned_count: Mapped[int] = mapped_column(Integer, default=0)
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AnalysisCandidate(Base):
    """What the AI proposes, before the parent taps "add to library".

    Kept as rows rather than a JSON blob so GET /analysis can be paged and so a
    partially confirmed import is recoverable.
    """

    __tablename__ = "analysis_candidates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    source_id: Mapped[str] = mapped_column(ForeignKey("sources.id"), index=True)
    lemma: Mapped[str] = mapped_column(String(120))
    type: Mapped[VocabType] = mapped_column(String(8), default=VocabType.WORD)
    meaning: Mapped[str] = mapped_column(String(200), default="")
    phonetic: Mapped[str | None] = mapped_column(String(120), nullable=True)
    recommended: Mapped[bool] = mapped_column(Boolean, default=True)
    already_in_library: Mapped[bool] = mapped_column(Boolean, default=False)
    reason: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rank: Mapped[int] = mapped_column(Integer, default=0)
    #: [{"sentence_id", "sentence", "surface_form", "start_offset", "end_offset"}]
    occurrences: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    source: Mapped[Source] = relationship(back_populates="candidates")


class UserEntitlement(Base):
    """Section 46. The only place a commercial number is allowed to live."""

    __tablename__ = "user_entitlements"
    __table_args__ = (UniqueConstraint("user_id", "feature_code", name="uq_user_feature"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    feature_code: Mapped[FeatureCode] = mapped_column(String(40))

    quota_type: Mapped[QuotaType] = mapped_column(String(16), default=QuotaType.TOTAL)
    quota_total: Mapped[int] = mapped_column(Integer, default=0)
    quota_used: Mapped[int] = mapped_column(Integer, default=0)

    period_type: Mapped[PeriodType] = mapped_column(String(16), default=PeriodType.NONE)
    period_start: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    period_end: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)


class AnalyticsEvent(Base):
    """Section 24A.8 / 49 -- the funnel the first test cohort is measured on."""

    __tablename__ = "analytics_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    child_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    name: Mapped[str] = mapped_column(String(48), index=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
