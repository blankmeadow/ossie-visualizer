/**
 * 学习完成 (spec section 29).
 *
 * No accuracy breakdown, no memory strength, no points, no ranking, no report.
 * A child gets a trophy, a number, and a way home.
 */
import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import type { CompleteResult } from '../api/types';
import { Body, Button, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

export function CompleteScreen({ summary }: { summary: CompleteResult }) {
  const { dismissAll, replace } = useNav();

  useEffect(() => {
    void api.track('SESSION_COMPLETED', { answered: summary.completed_count });
  }, [summary.completed_count]);

  return (
    <View style={styles.container}>
      <Text style={{ fontSize: 68 }}>🏆</Text>
      <Title style={{ fontSize: 32, marginTop: spacing(5) }}>太棒了！</Title>
      <Body muted center style={{ marginTop: spacing(3) }}>
        今天的 {summary.completed_count} 个都完成啦！
      </Body>

      <View style={styles.stats}>
        <Stat value={`${summary.completed_count}`} label="今日学习" />
        {summary.duration_minutes > 0 ? (
          <Stat value={`${summary.duration_minutes} 分钟`} label="学习时长" />
        ) : null}
        <Stat value={`🔥 ${summary.streak_days}`} label="连续天数" />
      </View>

      <Button
        label="回到首页"
        onPress={() => dismissAll('today')}
        style={{ alignSelf: 'stretch', marginTop: spacing(10) }}
      />
      <Button label="再来一组" variant="ghost" onPress={() => replace('study')} />
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(7),
    backgroundColor: colors.bg,
  },
  stats: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(8), alignSelf: 'stretch' },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing(5),
    borderRadius: radius.md,
    backgroundColor: colors.card,
  },
  statValue: { fontSize: font.heading, fontWeight: '800', color: colors.text },
  statLabel: { fontSize: font.tiny, color: colors.textMuted, marginTop: spacing(1) },
});
