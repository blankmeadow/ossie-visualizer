"""End-to-end walks of the two paths the MVP lives or dies on (spec section 4).

    parent: 词库 -> ＋ -> 拍照 -> 确认 -> 加入
    child:  今天 -> 开始 -> 连续答题 -> 完成
"""
from __future__ import annotations

import io

from app.enums import QuestionType

PAGE = """Unit 3
1. look for      寻找
2. take care of  照顾

The little fox walks into the forest.
He is looking for his mother.
"Do not be afraid," says the bird. "I will take care of you."
"""

SECOND_PAGE = """Little Bear looked for his friend in the forest all morning.
He was not afraid of the snow.
"""


def upload(client, headers, text=PAGE, source_type="PHOTO"):
    source = client.post("/sources", json={"source_type": source_type}, headers=headers)
    assert source.status_code == 201, source.text
    source_id = source.json()["id"]
    client.post(
        f"/sources/{source_id}/images",
        files=[("files", ("page1.txt", io.BytesIO(text.encode()), "text/plain"))],
        headers=headers,
    )
    return source_id


def anon(client):
    child_id = client.post("/auth/anonymous").json()["child_id"]
    return {"X-Child-Id": child_id}


# --------------------------------------------------------------------------
# Parent path
# --------------------------------------------------------------------------
def test_first_use_has_no_content(client):
    headers = anon(client)
    today = client.get("/today", headers=headers).json()
    assert today["has_content"] is False
    assert today["total"] == 0


def test_import_extracts_phrases_with_original_sentences(client):
    headers = anon(client)
    source_id = upload(client, headers)

    analysis = client.post(f"/sources/{source_id}/analyze", headers=headers).json()
    assert analysis["status"] == "READY"
    assert analysis["found_count"] > 0

    by_lemma = {c["lemma"]: c for c in analysis["candidates"]}

    # Section 9.3 -- the phrase, never its parts.
    assert "look for" in by_lemma
    assert "take care of" in by_lemma
    assert "look" not in by_lemma

    # Section 12 -- recommended items arrive pre-ticked.
    assert all(c["selected"] for c in analysis["candidates"] if c["recommended"])

    # Section 10 -- the example is the child's own sentence.
    sentences = [o["sentence"] for o in by_lemma["look for"]["occurrences"]]
    assert "He is looking for his mother." in sentences
    for occurrence in by_lemma["look for"]["occurrences"]:
        start, end = occurrence["start_offset"], occurrence["end_offset"]
        assert occurrence["sentence"][start:end] == occurrence["surface_form"]


def test_function_words_are_not_recommended(client):
    headers = anon(client)
    source_id = upload(client, headers)
    analysis = client.post(f"/sources/{source_id}/analyze", headers=headers).json()
    lemmas = {c["lemma"] for c in analysis["candidates"]}
    assert not lemmas & {"the", "a", "is", "into", "his"}


def test_confirm_adds_to_the_library_and_fills_today(client):
    headers = anon(client)
    source_id = upload(client, headers)
    client.post(f"/sources/{source_id}/analyze", headers=headers)

    confirmed = client.post(f"/sources/{source_id}/confirm", json={}, headers=headers).json()
    assert confirmed["added_count"] > 0
    assert confirmed["today_total"] == confirmed["vocabulary_count"]

    today = client.get("/today", headers=headers).json()
    assert today["has_content"] is True
    assert today["total"] > 0
    assert today["estimated_minutes"] >= 1


def test_seeing_a_word_again_merges_instead_of_duplicating(client):
    """Section 11.1 -- no duplicate, no 'overwrite?' prompt, one more sighting."""
    headers = anon(client)
    first = upload(client, headers)
    client.post(f"/sources/{first}/analyze", headers=headers)
    client.post(f"/sources/{first}/confirm", json={}, headers=headers)
    size_before = client.get("/vocabulary", headers=headers).json()["total"]

    second = upload(client, headers, text=SECOND_PAGE)
    analysis = client.post(f"/sources/{second}/analyze", headers=headers).json()
    repeat = next(c for c in analysis["candidates"] if c["lemma"] == "look for")
    assert repeat["already_in_library"] is True

    client.post(f"/sources/{second}/confirm", json={}, headers=headers)

    rows = client.get("/vocabulary", headers=headers).json()
    look_for = next(r for r in rows["items"] if r["lemma"] == "look for")
    assert look_for["seen_count"] == 2
    assert sum(1 for r in rows["items"] if r["lemma"] == "look for") == 1
    assert rows["total"] >= size_before

    # Section 10.1 -- the new sighting adds an example, up to three on screen.
    detail = client.get(f"/vocabulary/{look_for['id']}", headers=headers).json()
    assert detail["total_occurrences"] >= 2
    assert len(detail["examples"]) <= 3


def test_manual_add_normalises_and_fills_itself_in(client):
    """Section 13 -- the parent types one thing, the system does the rest."""
    headers = anon(client)
    created = client.post(
        "/vocabulary/manual", json={"text": "taking care of"}, headers=headers
    ).json()
    assert created["lemma"] == "take care of"
    assert created["type"] == "PHRASE"
    assert created["meaning"] == "照顾"

    word = client.post("/vocabulary/manual", json={"text": "Forests"}, headers=headers).json()
    assert word["lemma"] == "forest"
    assert word["type"] == "WORD"
    assert word["phonetic"]


def test_manual_add_keeps_a_supplied_example(client):
    headers = anon(client)
    created = client.post(
        "/vocabulary/manual",
        json={"text": "look for", "example": "I am looking for my pencil."},
        headers=headers,
    ).json()
    detail = client.get(f"/vocabulary/{created['id']}", headers=headers).json()
    assert detail["examples"][0]["sentence"] == "I am looking for my pencil."


# --------------------------------------------------------------------------
# Paywall (sections 45.4, 47, 48)
# --------------------------------------------------------------------------
def test_three_free_imports_then_a_paywall(client):
    headers = anon(client)
    for _ in range(3):
        source_id = upload(client, headers)
        result = client.post(f"/sources/{source_id}/analyze", headers=headers)
        assert result.status_code == 200

    remaining = client.get("/profile", headers=headers).json()["entitlements"]
    ai = next(e for e in remaining if e["feature_code"] == "AI_IMAGE_IMPORT")
    assert ai["remaining"] == 0

    blocked = client.post("/sources", json={"source_type": "PHOTO"}, headers=headers)
    assert blocked.status_code == 402
    body = blocked.json()["detail"]
    assert body["error"] == "quota_exhausted"
    # Section 45.4 -- the free route must be stated, not hidden.
    assert "手动添加" in body["secondary_cta"]


def test_learning_never_hits_the_paywall(client):
    """Section 45.5 -- an exhausted parent's child keeps studying."""
    headers = anon(client)
    source_id = upload(client, headers)
    client.post(f"/sources/{source_id}/analyze", headers=headers)
    client.post(f"/sources/{source_id}/confirm", json={}, headers=headers)
    for _ in range(2):
        other = upload(client, headers)
        client.post(f"/sources/{other}/analyze", headers=headers)

    assert client.post("/sources", json={"source_type": "PHOTO"}, headers=headers).status_code == 402

    assert client.get("/today", headers=headers).status_code == 200
    assert client.get("/today/session", headers=headers).status_code == 200
    assert client.get("/vocabulary", headers=headers).status_code == 200
    assert (
        client.post("/vocabulary/manual", json={"text": "suddenly"}, headers=headers).status_code
        == 201
    )


def test_a_failed_analysis_is_free(client):
    """Section 47 -- quota is spent on a delivered result, not an attempt."""
    headers = anon(client)
    source_id = upload(client, headers, text="12345 67890\n!!! ???\n")
    result = client.post(f"/sources/{source_id}/analyze", headers=headers).json()
    assert result["status"] in {"EMPTY", "FAILED"}
    assert result["entitlement"]["remaining"] == 3


# --------------------------------------------------------------------------
# Child path
# --------------------------------------------------------------------------
def stocked(client):
    headers = anon(client)
    source_id = upload(client, headers)
    client.post(f"/sources/{source_id}/analyze", headers=headers)
    client.post(f"/sources/{source_id}/confirm", json={}, headers=headers)
    return headers


def test_new_items_are_introduced_before_they_are_tested(client):
    """Section 15 -- the first encounter is a card, not an exam."""
    headers = stocked(client)
    session = client.get("/today/session", headers=headers).json()
    assert session["total"] > 0
    assert all(q["question_type"] == QuestionType.FIRST_LEARN.value for q in session["questions"])
    assert all(q["lemma"] and q["meaning"] for q in session["questions"])


def test_the_session_is_capped_at_the_daily_goal(client):
    """Section 14 -- one number, and never more than the goal."""
    headers = stocked(client)
    client.put("/profile", json={"daily_goal": 5}, headers=headers)
    session = client.get("/today/session", headers=headers).json()
    assert session["total"] <= 5


def first_real_question(client, headers):
    """Flip the introduction card and take the follow-up it hands back."""
    session = client.get("/today/session", headers=headers).json()
    card = session["questions"][0]
    result = client.post(
        "/reviews",
        json={
            "child_vocabulary_id": card["child_vocabulary_id"],
            "question_type": QuestionType.FIRST_LEARN.value,
        },
        headers=headers,
    ).json()
    # Section 15 -- introduced, not tested on the spot, but tested this round.
    assert result["requeue"] is True
    return result["requeue_question"]


def test_the_introduction_card_is_followed_by_a_real_question(client):
    headers = stocked(client)
    question = first_real_question(client, headers)
    assert question["question_type"] == QuestionType.T1_EN_TO_ZH.value


def test_a_wrong_answer_comes_back_later_in_the_round(client):
    """Section 25 -- no red cross, no error notebook, just another go."""
    headers = stocked(client)
    question = first_real_question(client, headers)

    answer = client.post(
        "/reviews",
        json={
            "child_vocabulary_id": question["child_vocabulary_id"],
            "question_type": question["question_type"],
            "answer": "___definitely wrong___",
            "response_time_ms": 4200,
        },
        headers=headers,
    ).json()

    assert answer["correct"] is False
    assert answer["requeue"] is True
    assert answer["requeue_question"]["child_vocabulary_id"] == question["child_vocabulary_id"]
    # Section 25 -- the feedback shows the right answer and the real sentence.
    assert answer["correct_answer"]
    assert answer["meaning"]


def test_a_right_answer_is_not_requeued(client):
    headers = stocked(client)
    question = first_real_question(client, headers)
    detail = client.get(f"/vocabulary/{question['child_vocabulary_id']}", headers=headers).json()

    answer = client.post(
        "/reviews",
        json={
            "child_vocabulary_id": question["child_vocabulary_id"],
            "question_type": question["question_type"],
            "answer": detail["meaning"],
            "response_time_ms": 1800,
        },
        headers=headers,
    ).json()
    assert answer["correct"] is True
    assert answer["requeue"] is False
    assert answer["example"] is None  # clean界面 on a correct answer (section 26)


def test_client_cannot_self_report_correctness(client):
    """Grading is server-side; a forged payload changes nothing."""
    headers = stocked(client)
    question = first_real_question(client, headers)
    answer = client.post(
        "/reviews",
        json={
            "child_vocabulary_id": question["child_vocabulary_id"],
            "question_type": QuestionType.T1_EN_TO_ZH.value,
            "answer": "wrong",
            "question_payload": {"correct": True},
        },
        headers=headers,
    ).json()
    assert answer["correct"] is False


def test_completing_the_round_starts_the_streak(client):
    headers = stocked(client)
    session = client.get("/today/session", headers=headers).json()
    for question in session["questions"]:
        client.post(
            "/reviews",
            json={
                "child_vocabulary_id": question["child_vocabulary_id"],
                "question_type": question["question_type"],
                "response_time_ms": 2000,
            },
            headers=headers,
        )
    done = client.post("/today/complete", headers=headers).json()
    assert done["completed_count"] == session["total"]
    assert done["streak_days"] == 1

    today = client.get("/today", headers=headers).json()
    assert today["completed_today"] is True

    profile = client.get("/profile", headers=headers).json()
    assert profile["streak_days"] == 1
    assert profile["days_completed_this_week"] == 1


def test_every_answer_is_logged(client, db):
    """Section 33.7 -- the raw log is the asset."""
    from app.models import ReviewLog

    headers = stocked(client)
    session = client.get("/today/session", headers=headers).json()
    question = session["questions"][0]
    client.post(
        "/reviews",
        json={
            "child_vocabulary_id": question["child_vocabulary_id"],
            "question_type": question["question_type"],
            "answer": "x",
            "hint_count": 2,
            "response_time_ms": 3300,
            "question_payload": {"shape": "whatever the child saw"},
        },
        headers=headers,
    )
    log = db.query(ReviewLog).order_by(ReviewLog.reviewed_at.desc()).first()
    assert log is not None
    assert log.hint_count == 2
    assert log.response_time_ms == 3300
    assert log.question_payload == {"shape": "whatever the child saw"}


def test_search_and_filter_the_library(client):
    headers = stocked(client)
    words = client.get("/vocabulary", params={"type": "WORD"}, headers=headers).json()
    phrases = client.get("/vocabulary", params={"type": "PHRASE"}, headers=headers).json()
    assert all(r["type"] == "WORD" for r in words["items"])
    assert all(r["type"] == "PHRASE" for r in phrases["items"])
    assert words["total"] == phrases["total"]  # totals are library-wide

    found = client.get("/vocabulary", params={"q": "look"}, headers=headers).json()
    assert any(r["lemma"] == "look for" for r in found["items"])


def test_profile_round_trip(client):
    headers = anon(client)
    updated = client.put(
        "/profile", json={"nickname": "小宇", "grade": 3, "daily_goal": 20}, headers=headers
    ).json()
    assert updated["nickname"] == "小宇"
    assert updated["grade"] == 3
    assert updated["daily_goal"] == 20


def test_a_stuck_item_stops_extending_the_round(client):
    """Section 25 asks for another go, not an unescapable loop."""
    headers = stocked(client)
    question = first_real_question(client, headers)

    requeues = 0
    for _ in range(8):
        result = client.post(
            "/reviews",
            json={
                "child_vocabulary_id": question["child_vocabulary_id"],
                "question_type": question["question_type"],
                "answer": "___always wrong___",
                "question_payload": question["prompt"],
            },
            headers=headers,
        ).json()
        assert result["correct"] is False
        if not result["requeue"]:
            break
        requeues += 1
        question = result["requeue_question"]
    else:
        raise AssertionError("the item never stopped coming back")

    assert requeues <= 2


def test_completion_celebrates_the_promise_not_the_repeats(client):
    """The child was told "今天 N 个" -- finishing shows that N, even though a
    wrong answer made them answer more than N times (section 14 / 29)."""
    headers = stocked(client)
    session = client.get("/today/session", headers=headers).json()

    answered = 0
    queue = list(session["questions"])
    while queue:
        question = queue.pop(0)
        result = client.post(
            "/reviews",
            json={
                "child_vocabulary_id": question["child_vocabulary_id"],
                "question_type": question["question_type"],
                "answer": "___wrong___",
                "question_payload": question["prompt"],
            },
            headers=headers,
        ).json()
        answered += 1
        if result["requeue"] and result["requeue_question"]:
            queue.append(result["requeue_question"])

    done = client.post("/today/complete", headers=headers).json()
    assert answered > session["total"]  # repeats really did happen
    assert done["completed_count"] == session["total"]
    assert done["answered_count"] == answered
