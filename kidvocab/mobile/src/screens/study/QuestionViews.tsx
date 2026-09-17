/**
 * The five training types plus the introduction card (spec sections 15, 18-23).
 *
 * Each view owns only how a question *looks* and how an answer is assembled.
 * Nothing here decides what comes next -- that is the engine's job.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { Question } from '../../api/types';
import { speak } from '../../components/speech';
import { Body, Button, Speaker } from '../../components/ui';
import { colors, font, latin, radius, spacing } from '../../theme';

export interface AnswerHandlers {
  /** Choice types submit the moment an option is tapped (section 24A.1). */
  submit: (answer: string) => void;
  hintCount: number;
  onHint: () => void;
  locked: boolean;
}

export function OptionList({
  options,
  onChoose,
  locked,
  large,
  english,
}: {
  options: string[];
  onChoose: (value: string) => void;
  locked: boolean;
  large?: boolean;
  /** T2 and T5 answer in English; T1 answers in Chinese and must stay on the
   *  system font. */
  english?: boolean;
}) {
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  return (
    <View style={{ gap: spacing(3) }}>
      {options.map((option, index) => (
        <Pressable
          key={`${option}-${index}`}
          accessibilityRole="button"
          disabled={locked}
          onPress={() => onChoose(option)}
          style={({ pressed }) => [
            styles.option,
            pressed && !locked && styles.optionPressed,
            locked && { opacity: 0.6 },
          ]}
        >
          <Text style={styles.optionLabel}>{labels[index]}</Text>
          <Text
            style={[
              styles.optionText,
              english && latin(),
              large && { fontSize: font.heading },
            ]}
          >
            {option}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Section 15 -- an introduction, not a test. */
export function FirstLearnView({ question, onNext }: { question: Question; onNext: () => void }) {
  const { lemma, meaning, phonetic } = question.prompt as {
    lemma: string;
    meaning: string;
    phonetic?: string | null;
  };

  useEffect(() => {
    speak(lemma);
  }, [lemma]);

  return (
    <View style={styles.center}>
      <Text style={styles.newBadge}>新内容</Text>
      <View style={styles.lemmaRow}>
        <Text style={styles.bigLemma}>{lemma}</Text>
        <Speaker onPress={() => speak(lemma)} size={26} />
      </View>
      {phonetic ? <Text style={styles.phonetic}>{phonetic}</Text> : null}
      <Text style={styles.bigMeaning}>{meaning}</Text>

      {question.example ? (
        <View style={styles.exampleBox}>
          <Highlighted
            sentence={question.example.sentence}
            start={question.example.start_offset}
            end={question.example.end_offset}
          />
          <Speaker onPress={() => speak(question.example!.sentence)} size={18} />
        </View>
      ) : null}

      <Button label="记住了" onPress={onNext} style={styles.cta} />
    </View>
  );
}

export function T1View({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const lemma = question.prompt.lemma as string;
  useEffect(() => {
    speak(lemma);
  }, [lemma]);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <View style={styles.lemmaRow}>
          <Text style={styles.promptLemma}>{lemma}</Text>
          <Speaker onPress={() => speak(lemma)} size={24} />
        </View>
      </View>
      <OptionList options={question.options} onChoose={handlers.submit} locked={handlers.locked} />
    </View>
  );
}

export function T2View({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <Text style={styles.promptMeaning}>{question.prompt.meaning as string}</Text>
      </View>
      <OptionList
        options={question.options}
        onChoose={handlers.submit}
        locked={handlers.locked}
        large
        english
      />
    </View>
  );
}

/** Section 20 -- letters for a word, the particle for a phrase. */
export function T3View({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const mode = question.prompt.mode as 'letters' | 'text';
  if (mode === 'text') return <ClozeTextView question={question} handlers={handlers} />;
  return <LetterTilesView question={question} handlers={handlers} />;
}

function LetterTilesView({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const masked = question.prompt.masked as (string | null)[];
  const bank = question.prompt.letter_bank as string[];
  const [filled, setFilled] = useState<(string | null)[]>(masked);

  useEffect(() => setFilled(masked), [question.child_vocabulary_id]);

  const nextEmpty = filled.findIndex((slot, index) => masked[index] === null && slot === null);
  const complete = filled.every((slot) => slot !== null);

  const place = (letter: string) => {
    if (handlers.locked || nextEmpty === -1) return;
    setFilled((current) => current.map((slot, index) => (index === nextEmpty ? letter : slot)));
  };

  const clear = (index: number) => {
    if (handlers.locked || masked[index] !== null) return;
    setFilled((current) => current.map((slot, i) => (i === index ? null : slot)));
  };

  // A hint fills one more correct letter for the child (section 22).
  const hint = () => {
    const target = question.hints[Math.min(handlers.hintCount, question.hints.length - 1)];
    if (!target) return;
    const letters = target.split(' ');
    const index = filled.findIndex(
      (slot, i) => masked[i] === null && slot === null && letters[i] !== '_',
    );
    if (index >= 0) {
      setFilled((current) => current.map((slot, i) => (i === index ? letters[i] : slot)));
    }
    handlers.onHint();
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <Text style={styles.promptMeaning}>{question.prompt.meaning as string}</Text>
      </View>

      <View style={styles.slots}>
        {filled.map((slot, index) => (
          <Pressable
            key={index}
            onPress={() => clear(index)}
            style={[
              styles.slot,
              masked[index] !== null && styles.slotGiven,
              slot !== null && masked[index] === null && styles.slotFilled,
            ]}
          >
            <Text style={styles.slotText}>{slot ?? ''}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.bank}>
        {bank.map((letter, index) => (
          <Pressable
            key={`${letter}-${index}`}
            onPress={() => place(letter)}
            disabled={handlers.locked || nextEmpty === -1}
            style={({ pressed }) => [styles.tile, pressed && styles.optionPressed]}
          >
            <Text style={styles.tileText}>{letter}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.inputFooter}>
        <HintButton onPress={hint} used={handlers.hintCount} total={question.hints.length} />
        <Button
          label="确认"
          variant="success"
          disabled={!complete || handlers.locked}
          onPress={() => handlers.submit(filled.join(''))}
        />
      </View>
    </View>
  );
}

function ClozeTextView({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [question.child_vocabulary_id]);

  const template = question.prompt.template as string;
  const hintText = handlers.hintCount > 0 ? question.hints[handlers.hintCount - 1] : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <Text style={styles.promptMeaning}>{question.prompt.meaning as string}</Text>
        <Text style={styles.template}>{template}</Text>
      </View>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="填上缺少的部分"
        placeholderTextColor={colors.textFaint}
        style={styles.answerInput}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!handlers.locked}
        onSubmitEditing={() => value.trim() && handlers.submit(value)}
        returnKeyType="done"
      />
      {hintText ? <Text style={styles.hintText}>{hintText}</Text> : null}

      <View style={styles.inputFooter}>
        <HintButton onPress={handlers.onHint} used={handlers.hintCount} total={question.hints.length} />
        <Button
          label="确认"
          variant="success"
          disabled={!value.trim() || handlers.locked}
          onPress={() => handlers.submit(value)}
        />
      </View>
    </View>
  );
}

export function T4View({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const [value, setValue] = useState('');
  useEffect(() => setValue(''), [question.child_vocabulary_id]);

  const hintText = handlers.hintCount > 0 ? question.hints[handlers.hintCount - 1] : null;
  const length = (question.prompt.length as number) ?? 0;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <Text style={styles.promptMeaning}>{question.prompt.meaning as string}</Text>
        <Text style={styles.template}>{'_'.repeat(Math.min(length, 16))}</Text>
      </View>

      <TextInput
        value={value}
        onChangeText={setValue}
        placeholder="写出这个单词或短语"
        placeholderTextColor={colors.textFaint}
        style={styles.answerInput}
        autoCapitalize="none"
        autoCorrect={false}
        editable={!handlers.locked}
        onSubmitEditing={() => value.trim() && handlers.submit(value)}
        returnKeyType="done"
      />
      {hintText ? <Text style={styles.hintText}>{hintText}</Text> : null}

      <View style={styles.inputFooter}>
        <HintButton onPress={handlers.onHint} used={handlers.hintCount} total={question.hints.length} />
        <Button
          label="确认"
          variant="success"
          disabled={!value.trim() || handlers.locked}
          onPress={() => handlers.submit(value)}
        />
      </View>
    </View>
  );
}

/** Section 23 -- the child's own sentence, with the item taken out. */
export function T5View({ question, handlers }: { question: Question; handlers: AnswerHandlers }) {
  const sentence = question.prompt.sentence as string;
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.promptBlock}>
        <Text style={styles.sentence}>{sentence}</Text>
        <Body muted style={{ marginTop: spacing(3) }}>
          {question.prompt.meaning as string}
        </Body>
      </View>
      <OptionList
        options={question.options}
        onChoose={handlers.submit}
        locked={handlers.locked}
        english
      />
    </View>
  );
}

function HintButton({
  onPress,
  used,
  total,
}: {
  onPress: () => void;
  used: number;
  total: number;
}) {
  const exhausted = used >= total;
  return (
    <Pressable
      onPress={onPress}
      disabled={exhausted}
      accessibilityRole="button"
      style={({ pressed }) => [styles.hint, pressed && styles.optionPressed, exhausted && { opacity: 0.4 }]}
    >
      <Text style={styles.hintLabel}>💡 提示</Text>
    </Pressable>
  );
}

/** Bolds the target item inside its original sentence. */
export function Highlighted({
  sentence,
  start,
  end,
  style,
}: {
  sentence: string;
  start: number;
  end: number;
  style?: object;
}) {
  const parts = useMemo(() => {
    if (start < 0 || end <= start || end > sentence.length) return [sentence, '', ''];
    return [sentence.slice(0, start), sentence.slice(start, end), sentence.slice(end)];
  }, [sentence, start, end]);

  return (
    <Text style={[styles.exampleText, style]}>
      {parts[0]}
      <Text style={styles.exampleStrong}>{parts[1]}</Text>
      {parts[2]}
    </Text>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  newBadge: {
    fontSize: font.tiny,
    color: colors.primary,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginBottom: spacing(5),
  },
  lemmaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  bigLemma: { fontSize: 38, color: colors.text, ...latin('bold') },
  phonetic: { fontSize: font.small, color: colors.textMuted, marginTop: spacing(2), ...latin() },
  bigMeaning: { fontSize: font.title, color: colors.text, marginTop: spacing(4) },
  exampleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginTop: spacing(8),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  exampleText: { flex: 1, fontSize: font.body, color: colors.text, lineHeight: 24, ...latin() },
  exampleStrong: { color: colors.primary, ...latin('bold') },
  cta: { marginTop: spacing(10), alignSelf: 'stretch' },

  promptBlock: { alignItems: 'center', paddingVertical: spacing(8) },
  promptLemma: { fontSize: 36, color: colors.text, ...latin('bold') },
  promptMeaning: { fontSize: font.title + 2, fontWeight: '700', color: colors.text },
  sentence: { fontSize: font.heading, color: colors.text, lineHeight: 30, textAlign: 'center', ...latin() },
  template: {
    fontSize: font.title,
    color: colors.primary,
    marginTop: spacing(5),
    letterSpacing: 2,
    ...latin('bold'),
  },

  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    minHeight: 58,
    paddingHorizontal: spacing(5),
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionPressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
  optionLabel: { fontSize: font.small, fontWeight: '700', color: colors.textFaint, width: 16 },
  optionText: { flex: 1, fontSize: font.body + 1, color: colors.text },

  slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), justifyContent: 'center' },
  slot: {
    width: 42,
    height: 52,
    borderRadius: radius.sm,
    borderBottomWidth: 3,
    borderBottomColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slotGiven: { backgroundColor: 'transparent', borderBottomColor: 'transparent' },
  slotFilled: { backgroundColor: colors.primarySoft, borderBottomColor: colors.primary },
  slotText: { fontSize: font.title, color: colors.text, ...latin('bold') },

  bank: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(3),
    justifyContent: 'center',
    marginTop: spacing(9),
  },
  tile: {
    width: 52,
    height: 52,
    borderRadius: radius.sm,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileText: { fontSize: font.heading, color: colors.text, ...latin('bold') },

  answerInput: {
    height: 58,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(5),
    fontSize: font.heading,
    color: colors.text,
    textAlign: 'center',
    ...latin(),
  },
  hintText: {
    marginTop: spacing(4),
    fontSize: font.heading,
    letterSpacing: 4,
    textAlign: 'center',
    color: colors.textMuted,
    ...latin(),
  },
  inputFooter: { marginTop: 'auto', gap: spacing(3), paddingTop: spacing(6) },
  hint: { alignSelf: 'center', paddingVertical: spacing(2), paddingHorizontal: spacing(5) },
  hintLabel: { fontSize: font.small, color: colors.primary, fontWeight: '600' },
});
