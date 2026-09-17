from __future__ import annotations

from enum import StrEnum


class VocabType(StrEnum):
    WORD = "WORD"
    PHRASE = "PHRASE"


class SourceType(StrEnum):
    PHOTO = "PHOTO"
    ALBUM = "ALBUM"
    MANUAL = "MANUAL"


class AnalysisStatus(StrEnum):
    DRAFT = "DRAFT"
    ANALYZING = "ANALYZING"
    READY = "READY"
    CONFIRMED = "CONFIRMED"
    FAILED = "FAILED"
    EMPTY = "EMPTY"


class LearnStatus(StrEnum):
    """Internal only. Never surfaced to a parent or a child (section 5.1)."""

    NEW = "NEW"
    LEARNING = "LEARNING"
    REVIEWING = "REVIEWING"
    MASTERED = "MASTERED"


class QuestionType(StrEnum):
    FIRST_LEARN = "FIRST_LEARN"  # section 15 -- a card, not a test
    T1_EN_TO_ZH = "T1_EN_TO_ZH"
    T2_ZH_TO_EN = "T2_ZH_TO_EN"
    T3_CLOZE = "T3_CLOZE"
    T4_SPELL = "T4_SPELL"
    T5_SENTENCE = "T5_SENTENCE"


#: The skill each question type scores. FIRST_LEARN trains nothing yet.
QUESTION_SKILL: dict[QuestionType, str | None] = {
    QuestionType.FIRST_LEARN: None,
    QuestionType.T1_EN_TO_ZH: "meaning_score",
    QuestionType.T2_ZH_TO_EN: "reverse_score",
    QuestionType.T3_CLOZE: "spelling_score",
    QuestionType.T4_SPELL: "spelling_score",
    QuestionType.T5_SENTENCE: "context_score",
}


class FeatureCode(StrEnum):
    AI_IMAGE_IMPORT = "AI_IMAGE_IMPORT"
    MANUAL_VOCABULARY_ADD = "MANUAL_VOCABULARY_ADD"
    PDF_IMPORT = "PDF_IMPORT"
    BOOK_IMPORT = "BOOK_IMPORT"
    AI_EXAMPLE_GENERATION = "AI_EXAMPLE_GENERATION"
    AI_ANIMATION = "AI_ANIMATION"


class QuotaType(StrEnum):
    TOTAL = "TOTAL"
    PERIODIC = "PERIODIC"
    UNLIMITED = "UNLIMITED"


class PeriodType(StrEnum):
    NONE = "NONE"
    MONTHLY = "MONTHLY"
    WEEKLY = "WEEKLY"


class EventName(StrEnum):
    """Section 24A.8 + section 49."""

    ANSWER_SUBMITTED = "ANSWER_SUBMITTED"
    ANSWER_CORRECT = "ANSWER_CORRECT"
    ANSWER_WRONG = "ANSWER_WRONG"
    AUTO_ADVANCE = "AUTO_ADVANCE"
    HINT_USED = "HINT_USED"
    SESSION_COMPLETED = "SESSION_COMPLETED"
    IMPORT_STARTED = "IMPORT_STARTED"
    IMPORT_ANALYZED = "IMPORT_ANALYZED"
    IMPORT_CONFIRMED = "IMPORT_CONFIRMED"
    PAYWALL_SHOWN = "PAYWALL_SHOWN"
    PAYWALL_UPGRADE_CLICKED = "PAYWALL_UPGRADE_CLICKED"
    PAYWALL_MANUAL_ADD_CLICKED = "PAYWALL_MANUAL_ADD_CLICKED"
