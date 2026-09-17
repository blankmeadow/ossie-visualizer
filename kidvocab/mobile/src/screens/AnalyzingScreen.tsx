/**
 * 正在整理…… (spec section 8).
 *
 * The parent is told what is happening in their own terms. OCR, lemmatisation,
 * phrase detection and dedupe are never named.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { api, PaywallError } from '../api/client';
import { Body, Button, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, spacing } from '../theme';

const STEPS = [
  '正在读取图片上的英文……',
  '正在还原完整的句子……',
  '正在帮你找出值得记住的单词和短语……',
];

export function AnalyzingScreen({ sourceId }: { sourceId: string }) {
  const { replace, pop, push } = useNav();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    const ticker = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3200);
    return () => {
      loop.stop();
      clearInterval(ticker);
    };
  }, [spin]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const analysis = await api.analyze(sourceId);
        if (cancelled) return;
        if (analysis.status === 'READY' && analysis.found_count > 0) {
          replace('confirm', { sourceId, analysis });
        } else if (analysis.status === 'EMPTY') {
          setError('这几页里没有找到值得学习的内容。\n换一页试试，这次不会消耗次数。');
        } else {
          setError('没能读清楚这些图片。\n重新拍一次试试，这次不会消耗次数。');
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof PaywallError) {
          push('paywall', { paywall: e.paywall });
          return;
        }
        setError(e instanceof Error ? e.message : '整理失败');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId, replace, push]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={{ fontSize: 52 }}>🫙</Text>
        <Title style={{ marginTop: spacing(5), textAlign: 'center' }}>没有整理出内容</Title>
        <Body muted center style={{ marginTop: spacing(3), lineHeight: 24 }}>
          {error}
        </Body>
        <Button label="重新选择图片" onPress={pop} style={{ marginTop: spacing(8), alignSelf: 'stretch' }} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Animated.Text style={{ fontSize: 56, transform: [{ rotate }] }}>✨</Animated.Text>
      <Title style={{ marginTop: spacing(6) }}>正在整理……</Title>
      <Body muted center style={{ marginTop: spacing(3), minHeight: 48, lineHeight: 24 }}>
        {STEPS[step]}
      </Body>
      <ActivityIndicator color={colors.primary} style={{ marginTop: spacing(5) }} />
      <Text style={styles.hint}>通常 10～20 秒</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing(8),
    backgroundColor: colors.bg,
  },
  hint: { marginTop: spacing(8), fontSize: font.small, color: colors.textFaint },
});
