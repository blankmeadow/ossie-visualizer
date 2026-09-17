"""Vision LLM provider (spec section 34).

One call per import does OCR, text restoration, sentence recovery, and a first
pass at word/phrase extraction with Chinese meanings. Everything it returns is
then re-normalised deterministically by the pipeline, so a hallucinated lemma
or a missed phrase cannot corrupt the library.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import re

from ...config import settings
from .base import ImageInput, PageText, ProviderError, ProviderItem, ProviderResult, VisionProvider

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are helping a Chinese primary-school child build a personal \
English vocabulary library from photos of their own learning material \
(textbooks, picture books, worksheets).

For EVERY image, in order:
1. Read all English text, including text inside exercise numbering and speech bubbles.
2. Restore it into clean, complete sentences. Repair OCR damage and words broken \
across line breaks. Keep the original wording -- never rewrite, translate or invent \
sentences that are not on the page.
3. Keep bare word-list entries (e.g. "look for") on their own line.

Then propose the words and phrases worth learning for a grade-{grade} child:
- Prefer multi-word items over their parts. If the page says "looking for", \
propose "look for", never "look".
- Include phrasal verbs, fixed collocations and be+adjective+preposition patterns.
- Give the dictionary form (lemma): "dogs" -> "dog", "went" -> "go", \
"looking for" -> "look for".
- Skip function words (the, a, is), proper nouns, and anything far beyond grade {grade}.
- meaning must be simplified Chinese, short, and the sense used ON THIS PAGE.

Reply with JSON only, no prose and no code fence:
{{"pages":[{{"page_no":1,"text":"..."}}],
  "items":[{{"lemma":"look for","type":"PHRASE","meaning":"寻找","phonetic":"/lʊk fɔː(r)/"}}]}}
"""

_MEDIA_TYPES = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


class AnthropicVisionProvider(VisionProvider):
    name = "anthropic"

    def __init__(self) -> None:
        api_key = settings.anthropic_api_key or os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ProviderError(
                "AI_PROVIDER=anthropic requires KIDVOCAB_ANTHROPIC_API_KEY or ANTHROPIC_API_KEY"
            )
        try:
            import anthropic
        except ImportError as exc:  # pragma: no cover - dependency guard
            raise ProviderError("pip install anthropic to use the vision provider") from exc
        self._client = anthropic.Anthropic(api_key=api_key)

    def extract(self, images: list[ImageInput], grade: int) -> ProviderResult:
        if not images:
            raise ProviderError("no images to analyse")

        content: list[dict] = []
        for image in images:
            ext = os.path.splitext(image.path)[1].lower()
            media_type = _MEDIA_TYPES.get(ext, image.media_type)
            with open(image.path, "rb") as fh:
                data = base64.standard_b64encode(fh.read()).decode()
            content.append({"type": "text", "text": f"Image {image.page_no}:"})
            content.append(
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": media_type, "data": data},
                }
            )

        try:
            message = self._client.messages.create(
                model=settings.anthropic_model,
                max_tokens=4096,
                system=SYSTEM_PROMPT.format(grade=grade),
                messages=[{"role": "user", "content": content}],
            )
        except Exception as exc:  # noqa: BLE001 - surfaced as a retryable import failure
            logger.warning("vision call failed: %s", exc)
            raise ProviderError(str(exc)) from exc

        raw = "".join(block.text for block in message.content if block.type == "text")
        payload = _parse_json(raw)
        if payload is None:
            raise ProviderError("model did not return usable JSON")

        pages = [
            PageText(page_no=int(p.get("page_no", i + 1)), text=str(p.get("text", "")))
            for i, p in enumerate(payload.get("pages", []))
        ]
        items = [
            ProviderItem(
                lemma=str(it.get("lemma", "")).strip(),
                type="PHRASE" if str(it.get("type", "")).upper() == "PHRASE" else "WORD",
                meaning=str(it.get("meaning", "")).strip(),
                phonetic=(str(it["phonetic"]).strip() if it.get("phonetic") else None),
            )
            for it in payload.get("items", [])
            if str(it.get("lemma", "")).strip()
        ]
        if not pages and not items:
            raise ProviderError("model returned an empty result")
        return ProviderResult(pages=pages, items=items)


def _parse_json(raw: str) -> dict | None:
    raw = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(.*?)```", raw, re.S)
    if fenced:
        raw = fenced.group(1).strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    # Model occasionally prefixes a sentence; take the outermost object.
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(raw[start : end + 1])
        except json.JSONDecodeError:
            return None
    return None
