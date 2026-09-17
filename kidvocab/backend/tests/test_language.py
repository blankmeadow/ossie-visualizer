"""Lemmatisation, phrase detection and sentence restoration -- spec 9 / 11."""
from __future__ import annotations

import pytest

from app.ai.lemmatizer import lemmatize, lemmatize_phrase
from app.ai.phrases import find_phrases
from app.ai.segmenter import is_usable_example, split_sentences


@pytest.mark.parametrize(
    ("surface", "expected"),
    [
        ("dogs", "dog"),
        ("walked", "walk"),
        ("running", "run"),
        ("went", "go"),
        ("forests", "forest"),
        ("carried", "carry"),
        ("flies", "fly"),
        ("children", "child"),
        ("stories", "story"),
        ("teeth", "tooth"),
        ("making", "make"),
        # Words that must survive untouched.
        ("news", "news"),
        ("grass", "grass"),
        ("morning", "morning"),
    ],
)
def test_lemmatize(surface, expected):
    assert lemmatize(surface) == expected


@pytest.mark.parametrize(
    ("surface", "expected"),
    [
        ("look for", "look for"),
        ("looks for", "look for"),
        ("looking for", "look for"),
        ("looked for", "look for"),
        ("is looking for", "look for"),
        ("was afraid of", "be afraid of"),
        ("taking care of", "take care of"),
    ],
)
def test_lemmatize_phrase(surface, expected):
    """Spec section 11: every inflection collapses onto one lemma."""
    assert lemmatize_phrase(surface) == expected


def test_phrase_wins_over_its_parts():
    """Section 9.3 -- 'looking for' must never be recorded as 'look'."""
    matches = find_phrases("He is looking for his mother.")
    assert [m.lemma for m in matches] == ["look for"]
    match = matches[0]
    assert match.surface_form == "looking for"
    assert "He is looking for his mother."[match.start_offset : match.end_offset] == "looking for"


def test_longest_phrase_wins():
    matches = find_phrases("There are a lot of books in front of the door.")
    assert {m.lemma for m in matches} == {"a lot of", "in front of"}


def test_be_phrase_tolerates_inflection_and_adverb():
    matches = find_phrases("She is not afraid of the dark.")
    assert [m.lemma for m in matches] == ["be afraid of"]


def test_segmenter_repairs_ocr_damage():
    raw = "Unit 3\n1. look for   寻找\nThe little fox walks into the for-\nest.\n"
    sentences = split_sentences(raw)
    assert "The little fox walks into the forest." in sentences
    assert "look for" in sentences  # kept for extraction...
    assert not is_usable_example("look for")  # ...but never shown as an example
    assert "Unit 3" not in sentences


def test_offsets_are_exact():
    sentence = "The fox is looking for food."
    match = find_phrases(sentence)[0]
    assert sentence[match.start_offset : match.end_offset] == match.surface_form
