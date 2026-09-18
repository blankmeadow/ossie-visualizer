/**
 * 付费墙 (spec sections 45.4, 48).
 *
 * Appears only here: the parent reached for AI import and has no allowance
 * left. Never on 今天, never during study, never on review. The free route is
 * an equal-weight button, not fine print.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { api } from '../api/client';
import type { Paywall } from '../api/types';
import { Body, Button, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, maxContentWidth, radius, spacing } from '../theme';

export function PaywallScreen({ paywall }: { paywall: Paywall }) {
  const { pop, dismissAll, push } = useNav();

  return (
    <View style={styles.backdrop}>
      <View style={styles.sheet}>
        <Text style={{ fontSize: 44 }}>📷</Text>
        <Title style={{ marginTop: spacing(4), textAlign: 'center' }}>{paywall.title}</Title>
        <Body muted center style={{ marginTop: spacing(4), lineHeight: 24 }}>
          {paywall.body}
        </Body>

        <View style={styles.plans}>
          {/* Section 49: the first cohort sees the offer without a real
              payment rail, so intent can be measured before it is built. */}
          <View style={[styles.plan, styles.planActive]}>
            <Text style={styles.planName}>月度</Text>
            <Text style={styles.planPrice}>¥29</Text>
            <Text style={styles.planNote}>每月 30 次拍照整理</Text>
          </View>
          <View style={styles.plan}>
            <Text style={styles.planName}>年度</Text>
            <Text style={styles.planPrice}>¥199</Text>
            <Text style={styles.planNote}>每月 100 次 · 更划算</Text>
          </View>
        </View>

        <Button
          label={paywall.primary_cta}
          onPress={() => {
            void api.track('PAYWALL_UPGRADE_CLICKED', { feature: paywall.feature_code });
            pop();
          }}
          style={{ alignSelf: 'stretch', marginTop: spacing(6) }}
        />
        <Button
          label={paywall.secondary_cta}
          variant="ghost"
          onPress={() => {
            void api.track('PAYWALL_MANUAL_ADD_CLICKED', { feature: paywall.feature_code });
            dismissAll('library');
            push('manualAdd');
          }}
          style={{ marginTop: spacing(2) }}
        />
        <Button label="以后再说" variant="ghost" onPress={() => dismissAll('library')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: maxContentWidth,
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing(6),
    paddingBottom: spacing(10),
    alignItems: 'center',
  },
  plans: { flexDirection: 'row', gap: spacing(3), marginTop: spacing(6), alignSelf: 'stretch' },
  plan: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing(4),
    alignItems: 'center',
  },
  planActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  planName: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
  planPrice: { fontSize: font.title, fontWeight: '800', color: colors.text, marginTop: spacing(1) },
  planNote: { fontSize: font.tiny, color: colors.textFaint, marginTop: spacing(1), textAlign: 'center' },
});
