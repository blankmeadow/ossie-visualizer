/**
 * 今天 (spec section 5).
 *
 * One number and one button. No new/review split, no accuracy, no mastery, no
 * SRS, no word-book picker -- the child only needs to know how much there is
 * and where to tap.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import type { Today } from '../api/types';
import { Body, Button, Card, EmptyState, Loading, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, shadow, spacing } from '../theme';

export function TodayScreen() {
  const { push, setTab, revision } = useNav();
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setToday(await api.today());
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (error) {
    return (
      <EmptyState
        emoji="🌧"
        title="连接不上"
        body={`${error}\n请确认后端已经启动。`}
        cta={<Button label="重试" onPress={load} />}
      />
    );
  }

  if (!today) return <Loading />;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.header}>今天</Text>

      {!today.has_content ? (
        // Section 5.3 -- shown only until the very first item exists.
        <EmptyState
          emoji="📄"
          title="还没有学习内容"
          body={'把孩子正在学的英语加进来，\n以后每天自动安排学习和复习。'}
          cta={<Button label="去添加内容" onPress={() => setTab('library')} />}
        />
      ) : today.completed_today || today.total === 0 ? (
        // Section 5.2
        <Card style={styles.hero}>
          <Text style={styles.celebrate}>🎉</Text>
          <Title style={{ textAlign: 'center' }}>今天已经完成啦</Title>
          <Text style={styles.count}>✓ {today.answered_today}</Text>
          <Body muted center>
            明天继续
          </Body>
        </Card>
      ) : (
        // Section 5.1
        <Card style={styles.hero}>
          <Text style={styles.count}>{today.total}</Text>
          <Body muted>待学习</Body>
          <Body muted style={{ marginTop: spacing(1) }}>
            约 {today.estimated_minutes} 分钟
          </Body>
          <Button
            label="开始学习 →"
            onPress={() => push('study')}
            style={{ marginTop: spacing(7), alignSelf: 'stretch' }}
          />
        </Card>
      )}

      {today.streak_days > 0 ? (
        <View style={styles.streak}>
          <Text style={{ fontSize: 22 }}>🔥</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.streakTitle}>连续 {today.streak_days} 天</Text>
            <Text style={styles.streakBody}>每天一点点，更棒的自己</Text>
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: spacing(5), paddingTop: spacing(10) },
  header: { fontSize: font.display, fontWeight: '800', color: colors.text, marginBottom: spacing(8) },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing(10),
    backgroundColor: colors.card,
    ...shadow.card,
  },
  count: { fontSize: 64, fontWeight: '800', color: colors.primary, lineHeight: 74 },
  celebrate: { fontSize: 52, marginBottom: spacing(3) },
  streak: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginTop: spacing(5),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.streakSoft,
  },
  streakTitle: { fontSize: font.body, fontWeight: '700', color: colors.text },
  streakBody: { fontSize: font.small, color: colors.textMuted, marginTop: 2 },
});
