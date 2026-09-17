/**
 * 添加学习内容 (spec section 6.2).
 *
 * Three ways in, all equal citizens in the MVP. Manual add is listed last but
 * never hidden -- it is the route that stays free forever (section 45.4).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '../components/Sheet';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

const OPTIONS = [
  {
    key: 'camera',
    icon: '📷',
    title: '拍照识别',
    body: '拍教材、绘本、练习册',
  },
  {
    key: 'album',
    icon: '🖼',
    title: '从相册选择',
    body: '选择已经拍好的图片',
  },
  {
    key: 'manual',
    icon: '✏️',
    title: '手动添加',
    body: '输入一个单词或短语',
  },
] as const;

export function AddSheet() {
  const { pop, replace } = useNav();

  const choose = (key: (typeof OPTIONS)[number]['key']) => {
    if (key === 'manual') replace('manualAdd');
    else replace('capture', { mode: key });
  };

  return (
    <Sheet title="添加到词库" onClose={pop}>
      <View style={{ gap: spacing(3) }}>
        {OPTIONS.map((option) => (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            onPress={() => choose(option.key)}
            style={({ pressed }) => [styles.option, pressed && { opacity: 0.75 }]}
          >
            <View style={styles.iconBox}>
              <Text style={{ fontSize: 22 }}>{option.icon}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{option.title}</Text>
              <Text style={styles.body}>{option.body}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(4),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBox: {
    width: 46,
    height: 46,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: font.body, fontWeight: '700', color: colors.text },
  body: { fontSize: font.small, color: colors.textMuted, marginTop: 2 },
});
