/**
 * 学习 (spec sections 24A, 25, 26).
 *
 * The whole flow is one-way: 出题 → 作答 → 反馈 → 自动下一题. There is no
 * next button, no previous button, no swipe, no skip and no way back to a
 * question already answered. The child is responsible for exactly one thing:
 * the question in front of them.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';

import { api } from '../../api/client';
import type { Question, ReviewResult } from '../../api/types';
import { speak } from '../../components/speech';
import { Body, EmptyState, Loading, ProgressBar, Button } from '../../components/ui';
import { useNav } from '../../nav/router';
import { colors, font, latin, radius, spacing } from '../../theme';
import {
  FirstLearnView,
  Highlighted,
  T1View,
  T2View,
  T3View,
  T4View,
  T5View,
  type AnswerHandlers,
} from './QuestionViews';

/** How long a feedback frame holds before the next question appears. */
const CORRECT_MS = 850;
/** Longer, so the right answer and its sentence can actually be read (24A.4). */
const WRONG_MS = 2600;

/** A wrong item reappears this many positions later in the round. */
const REQUEUE_GAP = 3;

type Phase = 'question' | 'correct' | 'wrong';

interface Round {
  items: Question[];
  index: number;
}

export function StudyScreen() {
  const { pop, replace } = useNav();
  /**
   * The queue and the cursor move together -- a re-queued item is spliced in
   * and the cursor steps forward in the same update -- so they are held as one
   * value, mirrored in a ref because the advance runs from a timeout.
   */
  const [round, setRound] = useState<Round | null>(null);
  const roundRef = useRef<Round | null>(null);
  const [phase, setPhase] = useState<Phase>('question');
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const finished = useRef(false);

  const askedAt = useRef(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = useCallback((next: Round) => {
    roundRef.current = next;
    setRound(next);
  }, []);

  useEffect(() => {
    (async () => {
      const session = await api.session();
      commit({ items: session.questions, index: 0 });
    })();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [commit]);

  // Section 24A.6: no navigation out of a question, including the hardware back.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, []);

  const current = round ? (round.items[round.index] ?? null) : null;
  const total = round?.items.length ?? 0;

  useEffect(() => {
    askedAt.current = Date.now();
    setHintCount(0);
  }, [round?.index]);

  const finish = useCallback(async () => {
    if (finished.current) return;
    finished.current = true;
    const summary = await api.complete();
    replace('complete', { summary });
  }, [replace]);

  const advance = useCallback(
    (requeueQuestion: Question | null) => {
      const currentRound = roundRef.current;
      if (!currentRound) return;

      let items = currentRound.items;
      if (requeueQuestion) {
        // Back into the round a few questions later, never immediately after.
        items = [...items];
        const target = Math.min(currentRound.index + 1 + REQUEUE_GAP, items.length);
        items.splice(target, 0, requeueQuestion);
      }

      const nextIndex = currentRound.index + 1;
      void api.track('AUTO_ADVANCE', {});

      // Section 24A.5 -- the last answer leads straight into 今日完成.
      if (nextIndex >= items.length) {
        void finish();
        return;
      }

      setPhase('question');
      setResult(null);
      commit({ items, index: nextIndex });
    },
    [commit, finish],
  );

  const submit = useCallback(
    async (answer: string) => {
      if (!current || submitting) return;
      setSubmitting(true);
      try {
        const review = await api.review({
          child_vocabulary_id: current.child_vocabulary_id,
          question_type: current.question_type,
          answer,
          hint_count: hintCount,
          response_time_ms: Date.now() - askedAt.current,
          question_payload: current.prompt,
        });

        setResult(review);
        setSubmitting(false);

        if (current.question_type === 'FIRST_LEARN') {
          // No feedback frame for an introduction -- straight on.
          advance(review.requeue_question);
          return;
        }

        if (review.correct) {
          setStreak((s) => s + 1);
          setPhase('correct');
          timer.current = setTimeout(() => advance(null), CORRECT_MS);
        } else {
          setStreak(0);
          setPhase('wrong');
          speak(review.lemma);
          timer.current = setTimeout(() => advance(review.requeue_question), WRONG_MS);
        }
      } catch {
        setSubmitting(false);
      }
    },
    [current, hintCount, submitting, advance],
  );

  if (!round) return <Loading label="正在安排今天的内容…" />;

  if (round.items.length === 0) {
    return (
      <EmptyState
        emoji="🎉"
        title="今天已经完成啦"
        body="明天继续"
        cta={<Button label="回到首页" onPress={pop} />}
      />
    );
  }

  if (!current) return <Loading />;

  const handlers: AnswerHandlers = {
    submit,
    hintCount,
    onHint: () => {
      setHintCount((c) => c + 1);
      void api.track('HINT_USED', { type: current.question_type });
    },
    locked: phase !== 'question' || submitting,
  };

  return (
    <View style={styles.container}>
      {/* Section 24A.6 -- progress and nothing else. */}
      <View style={styles.header}>
        <Pressable onPress={pop} hitSlop={12} accessibilityLabel="退出学习">
          <Text style={styles.exit}>✕</Text>
        </Pressable>
        <ProgressBar value={round.index} total={total} />
        <Text style={styles.counter}>
          {Math.min(round.index + 1, total)} / {total}
        </Text>
      </View>

      <View style={styles.body}>
        {current.question_type === 'FIRST_LEARN' ? (
          <FirstLearnView question={current} onNext={() => submit('')} />
        ) : current.question_type === 'T1_EN_TO_ZH' ? (
          <T1View question={current} handlers={handlers} />
        ) : current.question_type === 'T2_ZH_TO_EN' ? (
          <T2View question={current} handlers={handlers} />
        ) : current.question_type === 'T3_CLOZE' ? (
          <T3View question={current} handlers={handlers} />
        ) : current.question_type === 'T4_SPELL' ? (
          <T4View question={current} handlers={handlers} />
        ) : (
          <T5View question={current} handlers={handlers} />
        )}
      </View>

      {phase === 'correct' ? <CorrectOverlay streak={streak} /> : null}
      {phase === 'wrong' && result ? <WrongOverlay result={result} /> : null}
    </View>
  );
}

/** Section 24A.3 -- light, brief, no separate page. */
function CorrectOverlay({ streak }: { streak: number }) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.correctCard}>
        <Text style={{ fontSize: 46 }}>✅</Text>
        <Text style={styles.correctText}>很棒！</Text>
        {streak >= 3 ? <Text style={styles.streakText}>已连续答对 {streak} 个</Text> : null}
      </View>
    </View>
  );
}

/** Section 24A.4 / 25 -- "再看一下", never a red cross and never a score penalty. */
function WrongOverlay({ result }: { result: ReviewResult }) {
  return (
    <View style={styles.overlay} pointerEvents="none">
      <View style={styles.wrongCard}>
        <Text style={styles.wrongTitle}>再看一下 👀</Text>
        <Text style={styles.wrongLemma}>{result.correct_answer}</Text>
        <Text style={styles.wrongMeaning}>{result.meaning}</Text>
        {result.example ? (
          <View style={styles.wrongExample}>
            <Highlighted
              sentence={result.example.sentence}
              start={result.example.start_offset}
              end={result.example.end_offset}
            />
          </View>
        ) : null}
        <Body muted style={{ marginTop: spacing(4), fontSize: font.tiny }}>
          待会儿会再出现一次
        </Body>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing(12) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    paddingHorizontal: spacing(5),
  },
  exit: { fontSize: 20, color: colors.textFaint },
  counter: {
    fontSize: font.small,
    color: colors.textMuted,
    minWidth: 54,
    textAlign: 'right',
    ...latin('bold'),
  },
  body: { flex: 1, padding: spacing(5) },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(246,248,252,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(6),
  },
  correctCard: { alignItems: 'center' },
  correctText: { fontSize: font.title, fontWeight: '800', color: colors.success, marginTop: spacing(4) },
  streakText: { fontSize: font.small, color: colors.textMuted, marginTop: spacing(2) },

  wrongCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(7),
    alignSelf: 'stretch',
  },
  wrongTitle: { fontSize: font.heading, fontWeight: '700', color: colors.text },
  wrongLemma: { fontSize: 34, color: colors.primary, marginTop: spacing(5), ...latin('bold') },
  wrongMeaning: { fontSize: font.heading, color: colors.text, marginTop: spacing(2) },
  wrongExample: {
    marginTop: spacing(6),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignSelf: 'stretch',
  },
});
