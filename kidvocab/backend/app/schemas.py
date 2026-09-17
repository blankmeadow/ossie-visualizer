from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------
# Profile / auth
# --------------------------------------------------------------------------
class AnonymousSession(BaseModel):
    child_id: str


class ProfileOut(BaseModel):
    child_id: str
    nickname: str | None
    grade: int
    daily_goal: int
    sound_enabled: bool
    streak_days: int
    days_completed_this_week: int
    vocabulary_count: int
    entitlements: list[dict]


class ProfileUpdate(BaseModel):
    nickname: str | None = Field(default=None, max_length=64)
    grade: int | None = Field(default=None, ge=1, le=6)
    daily_goal: int | None = Field(default=None, ge=5, le=60)
    sound_enabled: bool | None = None


# --------------------------------------------------------------------------
# Import flow
# --------------------------------------------------------------------------
class SourceCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    source_type: Literal["PHOTO", "ALBUM", "MANUAL"] = "PHOTO"


class SourceOut(BaseModel):
    id: str
    title: str
    source_type: str
    status: str
    image_count: int
    created_at: datetime


class ImageOut(BaseModel):
    id: str
    image_url: str
    page_no: int


class AnalyzeRequest(BaseModel):
    #: Overrides the profile grade for this import only.
    grade: int | None = Field(default=None, ge=1, le=6)


class OccurrenceOut(BaseModel):
    sentence: str
    surface_form: str
    start_offset: int
    end_offset: int


class CandidateOut(BaseModel):
    id: str
    lemma: str
    type: str
    meaning: str
    phonetic: str | None
    recommended: bool
    already_in_library: bool
    selected: bool
    occurrences: list[OccurrenceOut]


class AnalysisOut(BaseModel):
    source_id: str
    status: str
    #: Headline for the confirm screen: "找到了 8 个值得学习的".
    found_count: int
    sentence_count: int
    candidates: list[CandidateOut]
    entitlement: dict | None = None
    error: str | None = None


class ConfirmRequest(BaseModel):
    #: ``None`` means "everything recommended", which is the default state of
    #: the confirm screen (section 12).
    candidate_ids: list[str] | None = None
    #: Free-text items the parent typed in to fill a gap the AI missed.
    extra_items: list[str] = Field(default_factory=list)


class ConfirmOut(BaseModel):
    added_count: int
    merged_count: int
    vocabulary_count: int
    today_total: int


# --------------------------------------------------------------------------
# Learning
# --------------------------------------------------------------------------
class TodayOut(BaseModel):
    """Section 5.1 -- deliberately one number. No new/review split, no mastery."""

    total: int
    estimated_minutes: int
    streak_days: int
    completed_today: bool
    answered_today: int
    has_content: bool


class QuestionOut(BaseModel):
    child_vocabulary_id: str
    question_type: str
    lemma: str | None
    type: str
    meaning: str | None
    phonetic: str | None
    audio_url: str | None
    prompt: dict
    options: list[str]
    hints: list[str]
    example: dict | None


class SessionOut(BaseModel):
    session_id: str
    total: int
    questions: list[QuestionOut]


class ReviewIn(BaseModel):
    child_vocabulary_id: str
    question_type: str
    answer: str = ""
    hint_count: int = Field(default=0, ge=0)
    response_time_ms: int = Field(default=0, ge=0)
    #: Echoed back into the ReviewLog so the exact question a child saw is
    #: reconstructable later (section 33.7).
    question_payload: dict[str, Any] = Field(default_factory=dict)


class ReviewOut(BaseModel):
    correct: bool
    correct_answer: str
    lemma: str
    meaning: str
    phonetic: str | None
    audio_url: str | None
    #: Shown only on a wrong answer (section 25 / 26).
    example: dict | None
    requeue: bool
    requeue_question: QuestionOut | None


class CompleteOut(BaseModel):
    #: The promise that was made this morning ("今天 20 个"), so the celebration
    #: matches it. Re-queued repeats are counted separately.
    completed_count: int
    answered_count: int
    correct_count: int
    accuracy: int
    duration_minutes: int
    streak_days: int


# --------------------------------------------------------------------------
# Library
# --------------------------------------------------------------------------
class VocabularyRow(BaseModel):
    id: str
    lemma: str
    type: str
    meaning: str
    phonetic: str | None
    audio_url: str | None
    seen_count: int


class VocabularyPage(BaseModel):
    total: int
    word_count: int
    phrase_count: int
    items: list[VocabularyRow]


class VocabularyDetail(BaseModel):
    id: str
    lemma: str
    type: str
    meaning: str
    phonetic: str | None
    audio_url: str | None
    seen_count: int
    examples: list[OccurrenceOut]
    total_occurrences: int
    first_seen_at: datetime
    last_seen_at: datetime


class ManualAddIn(BaseModel):
    text: str = Field(min_length=1, max_length=120)
    meaning: str | None = Field(default=None, max_length=200)
    example: str | None = Field(default=None, max_length=400)


class ManualAddOut(BaseModel):
    id: str
    lemma: str
    type: str
    meaning: str
    phonetic: str | None
    created: bool
    vocabulary_count: int


# --------------------------------------------------------------------------
# Misc
# --------------------------------------------------------------------------
class EventIn(BaseModel):
    name: str = Field(max_length=48)
    payload: dict[str, Any] = Field(default_factory=dict)


class PaywallOut(BaseModel):
    """Section 45.4 -- shown only when the parent reaches for a paid action."""

    feature_code: str
    title: str
    body: str
    primary_cta: str
    secondary_cta: str
    organized_count: int
    remaining: int
