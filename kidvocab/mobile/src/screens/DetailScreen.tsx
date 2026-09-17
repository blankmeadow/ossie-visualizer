/**
 * 单词 / 短语详情 (spec section 30).
 *
 * The payoff for the whole pipeline: the parent sees the sentences their own
 * child actually read. At most three are shown; every sighting is kept.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import type { VocabularyDetail } from '../api/types';
import { speak } from '../components/speech';
import { Body, Loading, Speaker, Title } from '../components/ui';
import { Highlighted } from './study/QuestionViews';
import { useNav } from '../nav/router';
import { colors, font, latin, radius, spacing } from '../theme';

export function DetailScreen({ id }: { id: string }) {
  const { pop } = useNav();
  const [detail, setDetail] = useState<VocabularyDetail | null>(null);

  useEffect(() => {
    void api.vocabularyDetail(id).then(setDetail);
  }, [id]);

  if (!detail) return <Loading />;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={pop} hitSlop={12} accessibilityLabel="返回">
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing(5), paddingBottom: spacing(12) }}>
        <View style={styles.titleRow}>
          <Title style={{ fontSize: 34, ...latin('bold') }}>{detail.lemma}</Title>
          <Speaker onPress={() => speak(detail.lemma)} size={26} />
        </View>
        {detail.phonetic ? <Text style={styles.phonetic}>{detail.phonetic}</Text> : null}
        <Text style={styles.meaning}>{detail.meaning}</Text>

        <View style={styles.badges}>
          <Text style={styles.badge}>{detail.type === 'PHRASE' ? '短语' : '单词'}</Text>
          <Text style={styles.badge}>遇到过 {detail.seen_count} 次</Text>
        </View>

        <Text style={styles.sectionLabel}>我的原文</Text>
        {detail.examples.length === 0 ? (
          <Body muted>还没有原文例句。下次在材料里遇到它时会自动补上。</Body>
        ) : (
          detail.examples.map((example, index) => (
            <View key={index} style={styles.exampleCard}>
              <Highlighted
                sentence={example.sentence}
                start={example.start_offset}
                end={example.end_offset}
              />
              <Speaker onPress={() => speak(example.sentence)} size={18} />
            </View>
          ))
        )}

        {detail.total_occurrences > detail.examples.length ? (
          <Body muted style={{ marginTop: spacing(4), fontSize: font.tiny }}>
            一共出现过 {detail.total_occurrences} 次，这里显示最有代表性的 {detail.examples.length} 条。
          </Body>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing(12) },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: spacing(5) },
  back: { fontSize: 30, color: colors.text, width: 24, lineHeight: 32 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  phonetic: { fontSize: font.small, color: colors.textMuted, marginTop: spacing(2), ...latin() },
  meaning: { fontSize: font.title, color: colors.text, marginTop: spacing(4) },
  badges: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(5) },
  badge: {
    fontSize: font.tiny,
    color: colors.textMuted,
    backgroundColor: colors.card,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  sectionLabel: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textFaint,
    marginTop: spacing(9),
    marginBottom: spacing(3),
  },
  exampleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.card,
    marginBottom: spacing(3),
  },
});
