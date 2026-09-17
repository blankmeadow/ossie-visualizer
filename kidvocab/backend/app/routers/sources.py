"""The parent's path: 词库 -> ＋ -> 拍照 -> 确认 -> 加入 (spec sections 6-13).

Quota handling follows section 47 exactly: the check happens up front so the
paywall appears *before* the camera, but the charge happens only once an
analysis has actually produced something worth confirming. A failed OCR, an
unreadable photo or a page with no learnable content is free.
"""
from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..ai.pipeline import analyze_source
from ..billing import entitlements
from ..billing.entitlements import QuotaExhausted
from ..config import settings
from ..db import get_db
from ..deps import get_current_child, track
from ..enums import AnalysisStatus, EventName, FeatureCode, SourceType
from ..learning import scheduler
from ..models import AnalysisCandidate, Child, Source, SourceImage
from ..schemas import (
    AnalysisOut,
    AnalyzeRequest,
    CandidateOut,
    ConfirmOut,
    ConfirmRequest,
    ImageOut,
    OccurrenceOut,
    SourceCreate,
    SourceOut,
)
from ..services import vocabulary as vocab_service
from ..storage import UnsupportedMedia, save_upload

router = APIRouter(prefix="/sources", tags=["sources"])

#: Which import routes are metered. Manual entry never is (section 45.4).
METERED_TYPES = {SourceType.PHOTO, SourceType.ALBUM}


def paywall_payload(db: Session, child: Child, state) -> dict:
    """Section 45.4. The copy leads with what the parent already got, and the
    free escape hatch is stated, never hidden."""
    organized = vocab_service.library_size(db, child.id)
    return {
        "error": "quota_exhausted",
        "feature_code": state.feature_code.value,
        "title": "继续一拍就整理好",
        "body": (
            f"已经帮孩子从学习材料中整理了 {organized} 个单词和短语。\n"
            "升级后，可以继续拍教材、绘本和练习册，自动提取值得学习的内容和原文例句。"
        ),
        "primary_cta": "继续使用拍照整理",
        "secondary_cta": "仍然可以免费手动添加",
        "organized_count": organized,
        "remaining": state.remaining or 0,
    }


def _require_source(db: Session, child: Child, source_id: str) -> Source:
    source = db.get(Source, source_id)
    if source is None or source.child_id != child.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "source not found")
    return source


@router.post("", response_model=SourceOut, status_code=201)
def create_source(
    body: SourceCreate,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> SourceOut:
    source_type = SourceType(body.source_type)

    if source_type in METERED_TYPES:
        try:
            entitlements.check(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
        except QuotaExhausted as exc:
            track(db, child.id, EventName.PAYWALL_SHOWN, feature=exc.feature.value)
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED, paywall_payload(db, child, exc.state)
            ) from exc

    # Section 7: no textbook name, unit, page or difficulty is ever asked for.
    title = (body.title or "").strip() or f"学习材料 · {datetime.now(UTC).strftime('%Y-%m-%d')}"
    source = Source(child_id=child.id, title=title, source_type=source_type)
    db.add(source)
    db.flush()
    track(db, child.id, EventName.IMPORT_STARTED, source_id=source.id, source_type=source_type.value)
    return SourceOut(
        id=source.id,
        title=source.title,
        source_type=source.source_type,
        status=source.status,
        image_count=0,
        created_at=source.created_at,
    )


@router.post("/{source_id}/images", response_model=list[ImageOut], status_code=201)
def upload_images(
    source_id: str,
    files: list[UploadFile] = File(...),
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> list[ImageOut]:
    source = _require_source(db, child, source_id)
    existing = db.scalars(
        select(SourceImage).where(SourceImage.source_id == source.id)
    ).all()

    if len(existing) + len(files) > settings.ai_max_images_per_import:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"一次最多 {settings.ai_max_images_per_import} 张图片",
        )

    out: list[ImageOut] = []
    page_no = len(existing)
    for upload in files:
        page_no += 1
        try:
            path, url = save_upload(upload.file, upload.filename or "photo.jpg", subdir=source.id)
        except UnsupportedMedia as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        image = SourceImage(source_id=source.id, image_url=path, page_no=page_no)
        db.add(image)
        db.flush()
        out.append(ImageOut(id=image.id, image_url=url, page_no=image.page_no))
    return out


@router.delete("/{source_id}/images/{image_id}", status_code=204, response_class=Response)
def delete_image(
    source_id: str,
    image_id: str,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> Response:
    source = _require_source(db, child, source_id)
    image = db.get(SourceImage, image_id)
    if image is None or image.source_id != source.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "image not found")
    db.delete(image)
    db.flush()
    return Response(status_code=204)


@router.post("/{source_id}/analyze", response_model=AnalysisOut)
def analyze(
    source_id: str,
    body: AnalyzeRequest | None = None,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> AnalysisOut:
    source = _require_source(db, child, source_id)
    metered = SourceType(source.source_type) in METERED_TYPES

    if metered and not source.quota_consumed:
        try:
            entitlements.check(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
        except QuotaExhausted as exc:
            track(db, child.id, EventName.PAYWALL_SHOWN, feature=exc.feature.value)
            raise HTTPException(
                status.HTTP_402_PAYMENT_REQUIRED, paywall_payload(db, child, exc.state)
            ) from exc

    grade = body.grade if body and body.grade else child.grade
    original_grade = child.grade
    child.grade = grade
    try:
        outcome = analyze_source(db, source, child)
    finally:
        child.grade = original_grade

    source.status = outcome.status
    source.error_message = outcome.error

    # Section 47 -- charge only for a delivered result.
    if metered and outcome.should_consume_quota and not source.quota_consumed:
        entitlements.consume(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
        source.quota_consumed = True

    state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    track(
        db,
        child.id,
        EventName.IMPORT_ANALYZED,
        source_id=source.id,
        status=outcome.status.value,
        found=len(outcome.candidates),
        charged=source.quota_consumed,
    )
    db.flush()
    return _analysis_out(db, source, state.as_dict(), outcome.error)


@router.get("/{source_id}/analysis", response_model=AnalysisOut)
def read_analysis(
    source_id: str,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> AnalysisOut:
    source = _require_source(db, child, source_id)
    state = entitlements.get_state(db, child.id, FeatureCode.AI_IMAGE_IMPORT)
    return _analysis_out(db, source, state.as_dict(), source.error_message)


def _analysis_out(db: Session, source: Source, entitlement: dict, error: str | None) -> AnalysisOut:
    candidates = list(
        db.scalars(
            select(AnalysisCandidate)
            .where(AnalysisCandidate.source_id == source.id)
            .order_by(AnalysisCandidate.rank)
        )
    )
    sentence_count = len(source.sentences)
    return AnalysisOut(
        source_id=source.id,
        status=source.status,
        found_count=len(candidates),
        sentence_count=sentence_count,
        candidates=[_candidate_out(c) for c in candidates],
        entitlement=entitlement,
        error=error,
    )


def _candidate_out(candidate: AnalysisCandidate) -> CandidateOut:
    shown = [o for o in candidate.occurrences if o.get("usable_example")][:3]
    return CandidateOut(
        id=candidate.id,
        lemma=candidate.lemma,
        type=candidate.type,
        meaning=candidate.meaning,
        phonetic=candidate.phonetic,
        recommended=candidate.recommended,
        already_in_library=candidate.already_in_library,
        # Section 12: recommended items arrive pre-ticked.
        selected=candidate.recommended,
        occurrences=[
            OccurrenceOut(
                sentence=o.get("sentence", ""),
                surface_form=o.get("surface_form", ""),
                start_offset=int(o.get("start_offset", 0)),
                end_offset=int(o.get("end_offset", 0)),
            )
            for o in shown
        ],
    )


@router.post("/{source_id}/confirm", response_model=ConfirmOut)
def confirm(
    source_id: str,
    body: ConfirmRequest | None = None,
    child: Child = Depends(get_current_child),
    db: Session = Depends(get_db),
) -> ConfirmOut:
    source = _require_source(db, child, source_id)
    body = body or ConfirmRequest()

    results = vocab_service.confirm_candidates(db, child, source, body.candidate_ids)

    # Section 12: the parent may add anything the AI missed, inline.
    for text in body.extra_items:
        if text.strip():
            results.append(vocab_service.manual_add(db, child, text=text))

    source.status = AnalysisStatus.CONFIRMED
    db.flush()

    added = sum(1 for r in results if r.created)
    merged = len(results) - added
    plan = scheduler.plan_today(db, child)
    track(
        db,
        child.id,
        EventName.IMPORT_CONFIRMED,
        source_id=source.id,
        added=added,
        merged=merged,
    )
    return ConfirmOut(
        added_count=added,
        merged_count=merged,
        vocabulary_count=vocab_service.library_size(db, child.id),
        today_total=plan.total,
    )
