"""Sentence restoration and splitting (spec section 8).

Textbook OCR arrives as ragged lines: numbered exercise items, hyphenated line
breaks, headers. This turns that into clean sentences that are safe to show a
child as an original example.
"""
from __future__ import annotations

import re

_ITEM_NUMBER = re.compile(r"^\s*(?:\d{1,2}[.)、]|[a-hA-H][.)]|[•·▪-])\s+")
_HEADER = re.compile(r"^\s*(unit|lesson|part|page|chapter)\s*\d*\s*:?\s*$", re.I)
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[\"'“‘(]?[A-Z0-9])")
_WS = re.compile(r"\s+")
_HAS_LETTER = re.compile(r"[A-Za-z]")


def _dehyphenate(lines: list[str]) -> list[str]:
    """Rejoin ``for-\\nest`` split across an OCR line break."""
    out: list[str] = []
    buffer = ""
    for line in lines:
        line = line.rstrip()
        if buffer:
            line = buffer + line.lstrip()
            buffer = ""
        if line.endswith("-") and not line.endswith("--"):
            buffer = line[:-1]
            continue
        out.append(line)
    if buffer:
        out.append(buffer)
    return out


def _strip_chinese_gloss(line: str) -> str:
    """Textbook word lists print ``look for  寻找`` on one line.

    Keep only the English half; the meaning is handled separately.
    """
    idx = None
    for i, ch in enumerate(line):
        if "一" <= ch <= "鿿":
            idx = i
            break
    return line[:idx].rstrip() if idx is not None else line


def clean_lines(raw_text: str) -> list[str]:
    lines = _dehyphenate(raw_text.splitlines())
    cleaned: list[str] = []
    for line in lines:
        line = _ITEM_NUMBER.sub("", line).strip()
        line = _strip_chinese_gloss(line)
        line = _WS.sub(" ", line).strip()
        if not line or _HEADER.match(line):
            continue
        if not _HAS_LETTER.search(line):
            continue
        cleaned.append(line)
    return cleaned


def split_sentences(raw_text: str) -> list[str]:
    """Return display-ready sentences, in reading order, de-duplicated."""
    sentences: list[str] = []
    seen: set[str] = set()
    for line in clean_lines(raw_text):
        for part in _SENTENCE_END.split(line):
            part = part.strip()
            if not part or not _HAS_LETTER.search(part):
                continue
            key = part.lower()
            if key in seen:
                continue
            seen.add(key)
            sentences.append(part)
    return sentences


def is_usable_example(sentence: str) -> bool:
    """A sentence only earns a place in the UI if it reads like a sentence.

    Bare word-list entries ("look for") are useful for extraction but must not
    be shown to a child as an original example (section 10.1).
    """
    words = [w for w in re.findall(r"[A-Za-z']+", sentence)]
    if len(words) < 4:
        return False
    if len(sentence) > 160:
        return False
    return True
