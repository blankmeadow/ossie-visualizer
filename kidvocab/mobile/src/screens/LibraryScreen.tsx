/**
 * 词库 (spec section 6).
 *
 * The content-management centre, kept as a browsable list rather than an admin
 * console. One "＋" in the corner -- the parent's intent is "add learning
 * content", and a camera icon would presume the method (section 6.2).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import type { VocabularyPage, VocabularyRow } from '../api/types';
import { speak } from '../components/speech';
import { Body, Card, EmptyState, Loading, Pill, Speaker } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, latin, radius, spacing } from '../theme';

type Filter = 'ALL' | 'WORD' | 'PHRASE';

export function LibraryScreen() {
  const { push, revision } = useNav();
  const [page, setPage] = useState<VocabularyPage | null>(null);
  const [filter, setFilter] = useState<Filter>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const result = await api.vocabulary({
      type: filter === 'ALL' ? undefined : filter,
      q: query.trim() || undefined,
    });
    setPage(result);
    setLoading(false);
  }, [filter, query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, revision]);

  const renderRow = useCallback(
    ({ item }: { item: VocabularyRow }) => (
      <Pressable
        onPress={() => push('detail', { id: item.id })}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.lemma}>{item.lemma}</Text>
          {item.phonetic ? <Text style={styles.phonetic}>{item.phonetic}</Text> : null}
        </View>
        <Text style={styles.meaning} numberOfLines={1}>
          {item.meaning}
        </Text>
        <Speaker onPress={() => speak(item.lemma)} size={18} />
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    ),
    [push],
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>我的词库</Text>
          {page ? (
            <Body muted style={{ marginTop: spacing(1) }}>
              {page.total} 个单词和短语
            </Body>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加学习内容"
          onPress={() => push('addSheet')}
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.addLabel}>＋</Text>
        </Pressable>
      </View>

      <View style={styles.search}>
        <Text style={{ fontSize: 16 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="搜索单词或短语"
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      <View style={styles.filters}>
        <Pill label="全部" active={filter === 'ALL'} onPress={() => setFilter('ALL')} />
        <Pill label="单词" active={filter === 'WORD'} onPress={() => setFilter('WORD')} />
        <Pill label="短语" active={filter === 'PHRASE'} onPress={() => setFilter('PHRASE')} />
      </View>

      {loading ? (
        <Loading />
      ) : !page || page.items.length === 0 ? (
        <EmptyState
          emoji={query ? '🔍' : '📚'}
          title={query ? '没有找到' : '词库还是空的'}
          body={query ? '换个词试试' : '点右上角的 ＋ 添加学习内容'}
        />
      ) : (
        <FlatList
          data={page.items}
          keyExtractor={(item) => item.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingBottom: spacing(8) }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacing(5), paddingTop: spacing(10) },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  title: { fontSize: font.display - 6, fontWeight: '800', color: colors.text },
  add: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addLabel: { color: '#fff', fontSize: 26, lineHeight: 30, fontWeight: '600' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(2),
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing(4),
    height: 46,
    marginTop: spacing(5),
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: font.body, color: colors.text, height: '100%' },
  filters: { flexDirection: 'row', gap: spacing(2), marginTop: spacing(4) },
  list: { marginTop: spacing(3) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(4),
  },
  lemma: { fontSize: font.body + 1, color: colors.text, ...latin('bold') },
  phonetic: { fontSize: font.tiny, color: colors.textFaint, marginTop: 2, ...latin() },
  meaning: { fontSize: font.small, color: colors.textMuted, maxWidth: 110, textAlign: 'right' },
  chevron: { fontSize: 22, color: colors.textFaint },
  separator: { height: 1, backgroundColor: colors.border },
});
