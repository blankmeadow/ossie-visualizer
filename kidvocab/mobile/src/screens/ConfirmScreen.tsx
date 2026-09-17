/**
 * AI 提取确认 (spec section 12).
 *
 * Everything recommended arrives ticked. The parent's whole job is to untick
 * what they don't want and press one button. Meanings are not confirmed one by
 * one, and a word the child already has is merged without asking.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import type { Analysis, Candidate } from '../api/types';
import { speak } from '../components/speech';
import { Body, Button, Speaker, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

export function ConfirmScreen({ sourceId, analysis }: { sourceId: string; analysis: Analysis }) {
  const { pop, dismissAll } = useNav();
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(analysis.candidates.filter((c) => c.selected).map((c) => c.id)),
  );
  const [extra, setExtra] = useState('');
  const [extras, setExtras] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const phrases = useMemo(
    () => analysis.candidates.filter((c) => c.type === 'PHRASE'),
    [analysis.candidates],
  );
  const words = useMemo(
    () => analysis.candidates.filter((c) => c.type === 'WORD'),
    [analysis.candidates],
  );

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const total = selected.size + extras.length;

  const submit = async () => {
    setBusy(true);
    try {
      await api.confirm(sourceId, [...selected], extras);
      dismissAll('today');
    } catch (error) {
      setBusy(false);
      Alert.alert('加入失败', error instanceof Error ? error.message : '请稍后再试');
    }
  };

  const addExtra = () => {
    const value = extra.trim();
    if (!value) return;
    setExtras((current) => [...current, value]);
    setExtra('');
  };

  const renderCandidate = (candidate: Candidate) => {
    const checked = selected.has(candidate.id);
    const example = candidate.occurrences[0];
    return (
      <Pressable
        key={candidate.id}
        onPress={() => toggle(candidate.id)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
      >
        <View style={[styles.checkbox, checked && styles.checkboxOn]}>
          {checked ? <Text style={styles.tick}>✓</Text> : null}
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.lemmaLine}>
            <Text style={styles.lemma}>{candidate.lemma}</Text>
            {candidate.already_in_library ? <Text style={styles.again}>又遇到了 👋</Text> : null}
          </View>
          <Text style={styles.meaning}>{candidate.meaning}</Text>
          {example ? (
            <Text style={styles.example} numberOfLines={2}>
              “{example.sentence}”
            </Text>
          ) : null}
        </View>
        <Speaker onPress={() => speak(candidate.lemma)} size={18} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={pop} hitSlop={12} accessibilityLabel="返回">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Title style={{ fontSize: font.heading }}>识别结果</Title>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(5), paddingBottom: spacing(6) }}>
        <Title>找到了 {analysis.found_count} 个值得学习的</Title>
        <Body muted style={{ marginTop: spacing(2) }}>
          已经帮你勾选好了，不需要的点一下取消
        </Body>

        {phrases.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>短语</Text>
            {phrases.map(renderCandidate)}
          </>
        ) : null}

        {words.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>单词</Text>
            {words.map(renderCandidate)}
          </>
        ) : null}

        <Text style={styles.sectionLabel}>漏掉了什么？</Text>
        <View style={styles.extraRow}>
          <TextInput
            value={extra}
            onChangeText={setExtra}
            onSubmitEditing={addExtra}
            placeholder="再补一个单词或短语"
            placeholderTextColor={colors.textFaint}
            style={styles.extraInput}
            autoCapitalize="none"
            returnKeyType="done"
          />
          <Button label="添加" variant="secondary" onPress={addExtra} style={{ minHeight: 44 }} />
        </View>
        {extras.length > 0 ? (
          <View style={styles.extraChips}>
            {extras.map((value, index) => (
              <Pressable
                key={`${value}-${index}`}
                onPress={() => setExtras((c) => c.filter((_, i) => i !== index))}
                style={styles.chip}
              >
                <Text style={styles.chipLabel}>{value} ✕</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={total > 0 ? `加入词库 (${total})` : '一个也不加'}
          onPress={submit}
          loading={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing(12) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(5),
  },
  back: { fontSize: 30, color: colors.text, width: 24, lineHeight: 32 },
  sectionLabel: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textFaint,
    marginTop: spacing(7),
    marginBottom: spacing(2),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing(3),
    paddingVertical: spacing(3),
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  tick: { color: '#fff', fontSize: 14, fontWeight: '800' },
  lemmaLine: { flexDirection: 'row', alignItems: 'center', gap: spacing(2), flexWrap: 'wrap' },
  lemma: { fontSize: font.body + 1, fontWeight: '700', color: colors.text },
  again: { fontSize: font.tiny, color: colors.streak },
  meaning: { fontSize: font.small, color: colors.textMuted, marginTop: 2 },
  example: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing(1), lineHeight: 18 },
  extraRow: { flexDirection: 'row', gap: spacing(2), alignItems: 'center' },
  extraInput: {
    flex: 1,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(4),
    fontSize: font.body,
    color: colors.text,
  },
  extraChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2), marginTop: spacing(3) },
  chip: {
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
  },
  chipLabel: { fontSize: font.small, color: colors.primary },
  footer: {
    padding: spacing(5),
    paddingBottom: spacing(10),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
