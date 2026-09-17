/**
 * The shared primitives. Everything a child touches is at least 48pt tall and
 * has a single obvious action -- section 43's "今天 → 开始 → 完成".
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { colors, font, radius, shadow, spacing } from '../theme';

export function Screen({
  children,
  style,
  scroll = false,
  background = colors.bg,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  scroll?: boolean;
  background?: string;
}) {
  const body = <View style={[styles.screenInner, style]}>{children}</View>;
  if (!scroll) return <View style={[styles.screen, { backgroundColor: background }]}>{body}</View>;
  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: background }]}
      contentContainerStyle={{ flexGrow: 1 }}
      keyboardShouldPersistTaps="handled"
    >
      {body}
    </ScrollView>
  );
}

export function Title({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[styles.title, style]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  center,
  style,
}: {
  children: React.ReactNode;
  muted?: boolean;
  center?: boolean;
  style?: TextStyle;
}) {
  return (
    <Text
      style={[
        styles.body,
        muted && { color: colors.textMuted },
        center && { textAlign: 'center' },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
}) {
  const content = <View style={[styles.card, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {content}
    </Pressable>
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'success';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'success' && styles.buttonSuccess,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? '#fff' : colors.primary} />
      ) : (
        <Text
          style={[
            styles.buttonLabel,
            (variant === 'secondary' || variant === 'ghost') && { color: colors.primary },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** The 🔊 affordance. Audio is a one-tap extra, never a step in a flow. */
export function Speaker({ onPress, size = 22 }: { onPress: () => void; size?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="朗读"
      onPress={onPress}
      hitSlop={12}
      style={({ pressed }) => [styles.speaker, pressed && styles.pressed]}
    >
      <Text style={{ fontSize: size }}>🔊</Text>
    </Pressable>
  );
}

export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.min(1, value / total) : 0;
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${pct * 100}%` }]} />
    </View>
  );
}

export function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        active && styles.pillActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.pillLabel, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Loading({ label = '正在加载…' }: { label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Body muted style={{ marginTop: spacing(4) }}>
        {label}
      </Body>
    </View>
  );
}

export function EmptyState({
  emoji,
  title,
  body,
  cta,
}: {
  emoji: string;
  title: string;
  body?: string;
  cta?: React.ReactNode;
}) {
  return (
    <View style={styles.center}>
      <Text style={{ fontSize: 56, marginBottom: spacing(4) }}>{emoji}</Text>
      <Title style={{ textAlign: 'center' }}>{title}</Title>
      {body ? (
        <Body muted center style={{ marginTop: spacing(3), maxWidth: 280, lineHeight: 24 }}>
          {body}
        </Body>
      ) : null}
      {cta ? <View style={{ marginTop: spacing(8), width: '100%' }}>{cta}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  screenInner: { flex: 1, paddingHorizontal: spacing(5) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(6) },
  title: { fontSize: font.title, fontWeight: '700', color: colors.text },
  body: { fontSize: font.body, color: colors.text },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing(5),
    ...shadow.card,
  },
  button: {
    minHeight: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing(6),
  },
  buttonPrimary: { backgroundColor: colors.primary, ...shadow.raised },
  buttonSuccess: { backgroundColor: colors.success },
  buttonSecondary: {
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primaryTint,
  },
  buttonGhost: { backgroundColor: 'transparent', minHeight: 44 },
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { color: '#fff', fontSize: font.body, fontWeight: '600' },
  pressed: { opacity: 0.75, transform: [{ scale: 0.99 }] },
  speaker: { padding: spacing(1) },
  progressTrack: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.border,
    overflow: 'hidden',
    flex: 1,
  },
  progressFill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.primary },
  pill: {
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillLabel: { fontSize: font.small, color: colors.textMuted, fontWeight: '600' },
});
