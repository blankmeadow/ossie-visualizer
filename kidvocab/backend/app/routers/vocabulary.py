"""词库 -- the content-management centre, deliberately not an admin console
(spec section 6).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_child
from ..enums import VocabType
from ..learning import scheduler
from ..models import Child, ChildVocabulary, VocabularyItem, VocabularyOccurrence
from ..schemas import (
    ManualAddIn,
    ManualAddOut,
    OccurrenceOut,
    VocabularyDetail,
    VocabularyPage,
    VocabularyRow,
)
from ..services import vocabulary as vocab_service

router = APIRouter(prefix="/vocabulary", tags=["vocabulary"])


@router.get("", response_model=VocabularyPage)
def list_vocabulary(
    type: str | None = Query(default=None, pattern="^(WORD|PHRASE)$"),
    q: str | None = Query(default=None, max_length=60),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> VocabularyPage:
    base = (
        select(ChildVocabulary, VocabularyItem)
        .join(VocabularyItem, VocabularyItem.id == ChildVocabulary.vocabulary_item_id)
        .where(ChildVocabulary.child_id == child.id)
    )
    if type:
        base = base.where(VocabularyItem.type == type)
    if q:
        needle = f"%{q.strip().lower()}%"
        base = base.where(
            or_(func.lower(VocabularyItem.lemma).like(needle), VocabularyItem.meaning.like(needle))
        )

    rows = db.execute(
        base.order_by(ChildVocabulary.last_seen_at.desc()).limit(limit).offset(offset)
    ).all()

    counts = dict(
        db.execute(
            select(VocabularyItem.type, func.count(ChildVocabulary.id))
            .join(VocabularyItem, VocabularyItem.id == ChildVocabulary.vocabulary_item_id)
            .where(ChildVocabulary.child_id == child.id)
            .group_by(VocabularyItem.type)
        ).all()
    )

    return VocabularyPage(
        total=sum(counts.values()),
        word_count=counts.get(VocabType.WORD.value, 0) or counts.get(VocabType.WORD, 0),
        phrase_count=counts.get(VocabType.PHRASE.value, 0) or counts.get(VocabType.PHRASE, 0),
        items=[
            VocabularyRow(
                id=cv.id,
                lemma=item.lemma,
                type=item.type,
                meaning=item.meaning,
                phonetic=item.phonetic,
                audio_url=item.audio_url,
                seen_count=cv.seen_count,
            )
            for cv, item in rows
        ],
    )


@router.post("/manual", response_model=ManualAddOut, status_code=201)
def manual_add(
    body: ManualAddIn,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> ManualAddOut:
    """Section 13 / 45.4 -- always free, and never behind the paywall."""
    try:
        result = vocab_service.manual_add(
            db, child, text=body.text, meaning=body.meaning, example=body.example
        )
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc

    return ManualAddOut(
        id=result.child_vocabulary.id,
        lemma=result.item.lemma,
        type=result.item.type,
        meaning=result.item.meaning,
        phonetic=result.item.phonetic,
        created=result.created,
        vocabulary_count=vocab_service.library_size(db, child.id),
    )


@router.get("/lookup")
def lookup(
    text: str = Query(min_length=1, max_length=120),
    child: Child = Depends(get_current_child),
) -> dict:
    """Powers the manual-add form filling itself in as the parent types."""
    lemma, vocab_type = vocab_service.classify_input(text)
    meaning, phonetic = vocab_service.lookup(lemma, vocab_type)
    return {"lemma": lemma, "type": vocab_type.value, "meaning": meaning, "phonetic": phonetic}


@router.get("/{child_vocabulary_id}", response_model=VocabularyDetail)
def read_detail(
    child_vocabulary_id: str,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> VocabularyDetail:
    cv = db.get(ChildVocabulary, child_vocabulary_id)
    if cv is None or cv.child_id != child.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "not found")

    item = cv.item
    # Section 30: at most three original sentences on screen...
    examples = scheduler.load_examples(db, child.id, item.id, limit=3)
    # ...while every sighting stays in the database.
    total = int(
        db.scalar(
            select(func.count(VocabularyOccurrence.id)).where(
                VocabularyOccurrence.child_id == child.id,
                VocabularyOccurrence.vocabulary_item_id == item.id,
            )
        )
        or 0
    )

    return VocabularyDetail(
        id=cv.id,
        lemma=item.lemma,
        type=item.type,
        meaning=item.meaning,
        phonetic=item.phonetic,
        audio_url=item.audio_url,
        seen_count=cv.seen_count,
        examples=[
            OccurrenceOut(
                sentence=e.sentence,
                surface_form=e.surface_form,
                start_offset=e.start_offset,
                end_offset=e.end_offset,
            )
            for e in examples
        ],
        total_occurrences=total,
        first_seen_at=cv.first_seen_at,
        last_seen_at=cv.last_seen_at,
    )
