import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, font, spacing } from '../theme';
import { TabName, useNav } from '../nav/router';

const TABS: { name: TabName; label: string; icon: string }[] = [
  { name: 'today', label: '今天', icon: '☀️' },
  { name: 'library', label: '词库', icon: '📖' },
  { name: 'profile', label: '我的', icon: '🙂' },
];

export function TabBar() {
  const { tab, setTab } = useNav();
  return (
    <View style={styles.bar}>
      {TABS.map((item) => {
        const active = tab === item.name;
        return (
          <Pressable
            key={item.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
            onPress={() => setTab(item.name)}
            style={styles.tab}
          >
            <Text style={[styles.icon, !active && styles.iconInactive]}>{item.icon}</Text>
            <Text style={[styles.label, active && styles.labelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing(2),
    paddingBottom: Platform.OS === 'ios' ? spacing(7) : spacing(3),
  },
  tab: { flex: 1, alignItems: 'center', gap: spacing(1) },
  icon: { fontSize: 20 },
  iconInactive: { opacity: 0.45 },
  label: { fontSize: font.tiny, color: colors.textFaint, fontWeight: '600' },
  labelActive: { color: colors.primary },
});
