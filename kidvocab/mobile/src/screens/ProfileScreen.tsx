/**
 * 我的 (spec section 31).
 *
 * Nickname, grade, daily goal, streak, and the remaining AI allowance. The
 * grade is here because it is what the extraction uses to judge difficulty --
 * it is the one setting that genuinely changes the product's behaviour.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import type { Profile } from '../api/types';
import { setSoundEnabled } from '../components/speech';
import { Body, Card, Loading, Pill, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

const GRADES = [1, 2, 3, 4, 5, 6];
const GOALS = [10, 15, 20, 30];

export function ProfileScreen() {
  const { revision } = useNav();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [nickname, setNickname] = useState('');

  const load = useCallback(async () => {
    const result = await api.profile();
    setProfile(result);
    setNickname(result.nickname ?? '');
    setSoundEnabled(result.sound_enabled);
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const update = async (patch: Partial<Profile>) => {
    const next = await api.updateProfile(patch as any);
    setProfile(next);
    setSoundEnabled(next.sound_enabled);
  };

  if (!profile) return <Loading />;

  const aiImport = profile.entitlements.find((e) => e.feature_code === 'AI_IMAGE_IMPORT');

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.header}>我的</Text>

      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing(4) }}>
        <View style={styles.avatar}>
          <Text style={{ fontSize: 22 }}>🙂</Text>
        </View>
        <View style={{ flex: 1 }}>
          <TextInput
            value={nickname}
            onChangeText={setNickname}
            onBlur={() => update({ nickname: nickname.trim() || null })}
            placeholder="给孩子起个昵称"
            placeholderTextColor={colors.textFaint}
            style={styles.nickname}
          />
          <Body muted style={{ fontSize: font.small }}>
            {profile.grade} 年级 · {profile.vocabulary_count} 个单词和短语
          </Body>
        </View>
      </Card>

      <View style={styles.statsRow}>
        <Card style={styles.statCard}>
          <Text style={{ fontSize: 22 }}>🔥</Text>
          <Text style={styles.statValue}>连续 {profile.streak_days} 天</Text>
          <Text style={styles.statLabel}>每天一点点</Text>
        </Card>
        <Card style={styles.statCard}>
          <Text style={{ fontSize: 22 }}>📅</Text>
          <Text style={styles.statValue}>本周 {profile.days_completed_this_week} 天</Text>
          <Text style={styles.statLabel}>已完成学习</Text>
        </Card>
      </View>

      <Text style={styles.sectionLabel}>学习设置</Text>
      <Card style={{ gap: spacing(5) }}>
        <View>
          <Text style={styles.settingLabel}>年级</Text>
          <Body muted style={{ fontSize: font.tiny, marginBottom: spacing(3) }}>
            用来判断推荐哪些单词和短语
          </Body>
          <View style={styles.pillRow}>
            {GRADES.map((grade) => (
              <Pill
                key={grade}
                label={`${grade}`}
                active={profile.grade === grade}
                onPress={() => update({ grade })}
              />
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.settingLabel}>每日学习量</Text>
          <View style={[styles.pillRow, { marginTop: spacing(3) }]}>
            {GOALS.map((goal) => (
              <Pill
                key={goal}
                label={`${goal} 个`}
                active={profile.daily_goal === goal}
                onPress={() => update({ daily_goal: goal })}
              />
            ))}
          </View>
        </View>

        <View style={styles.switchRow}>
          <Text style={styles.settingLabel}>学习发音</Text>
          <Switch
            value={profile.sound_enabled}
            onValueChange={(value) => update({ sound_enabled: value })}
            trackColor={{ true: colors.primary, false: colors.border }}
          />
        </View>
      </Card>

      <Text style={styles.sectionLabel}>AI 整理</Text>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingLabel}>拍照识别</Text>
            <Body muted style={{ fontSize: font.tiny, marginTop: 2 }}>
              手动添加永远免费，不占用次数
            </Body>
          </View>
          <Text style={styles.quota}>
            {aiImport?.unlimited ? '不限' : `剩余 ${aiImport?.remaining ?? 0} 次`}
          </Text>
        </View>
      </Card>

      <Text style={styles.footer}>个人英语词库 · MVP 1.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing(5), paddingTop: spacing(10), paddingBottom: spacing(10) },
  header: { fontSize: font.display - 6, fontWeight: '800', color: colors.text, marginBottom: spacing(6) },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nickname: { fontSize: font.heading, fontWeight: '700', color: colors.text, paddingVertical: 2 },
  statsRow: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(4) },
  statCard: { flex: 1, alignItems: 'center', gap: spacing(1), paddingVertical: spacing(5) },
  statValue: { fontSize: font.body, fontWeight: '700', color: colors.text },
  statLabel: { fontSize: font.tiny, color: colors.textMuted },
  sectionLabel: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textFaint,
    marginTop: spacing(8),
    marginBottom: spacing(3),
  },
  settingLabel: { fontSize: font.body, fontWeight: '600', color: colors.text },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing(2) },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing(4) },
  quota: { fontSize: font.small, color: colors.primary, fontWeight: '700' },
  footer: {
    textAlign: 'center',
    marginTop: spacing(10),
    fontSize: font.tiny,
    color: colors.textFaint,
  },
});
