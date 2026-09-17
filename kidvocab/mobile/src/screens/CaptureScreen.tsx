/**
 * 拍照 / 相册导入 (spec section 7).
 *
 * Up to ten images per import, reorderable and removable, and exactly one
 * primary action at the end: 用这些内容. The parent is never asked for a
 * textbook name, unit, page, difficulty or word-book -- the source title is
 * generated and editable later, not on this path.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import { api, PaywallError } from '../api/client';
import { Body, Button, EmptyState, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

const MAX_IMAGES = 10;

export function CaptureScreen({ mode }: { mode: 'camera' | 'album' }) {
  const { pop, replace, push } = useNav();
  const [uris, setUris] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const pick = useCallback(
    async (from: 'camera' | 'album') => {
      const remaining = MAX_IMAGES - uris.length;
      if (remaining <= 0) {
        Alert.alert('已达上限', `一次最多 ${MAX_IMAGES} 张图片`);
        return;
      }
      try {
        const result =
          from === 'camera'
            ? await (async () => {
                const permission = await ImagePicker.requestCameraPermissionsAsync();
                if (!permission.granted) {
                  Alert.alert('需要相机权限', '请在系统设置里允许使用相机。');
                  return null;
                }
                return ImagePicker.launchCameraAsync({ quality: 0.7 });
              })()
            : await ImagePicker.launchImageLibraryAsync({
                quality: 0.7,
                allowsMultipleSelection: true,
                selectionLimit: remaining,
              });

        if (!result || result.canceled) return;
        setUris((current) =>
          [...current, ...result.assets.map((a) => a.uri)].slice(0, MAX_IMAGES),
        );
      } catch {
        Alert.alert('打不开', from === 'camera' ? '无法启动相机' : '无法打开相册');
      }
    },
    [uris.length],
  );

  // Open the picker straight away: the parent already chose the method.
  useEffect(() => {
    void pick(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const move = (index: number, delta: number) => {
    setUris((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const submit = async () => {
    if (uris.length === 0) return;
    setBusy(true);
    try {
      const source = await api.createSource(mode === 'camera' ? 'PHOTO' : 'ALBUM');
      await api.uploadImages(source.id, uris);
      replace('analyzing', { sourceId: source.id });
    } catch (error) {
      setBusy(false);
      if (error instanceof PaywallError) {
        push('paywall', { paywall: error.paywall });
        return;
      }
      Alert.alert('出错了', error instanceof Error ? error.message : '请稍后再试');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={pop} hitSlop={12} accessibilityRole="button" accessibilityLabel="取消">
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
        <Title style={{ fontSize: font.heading }}>
          {mode === 'camera' ? '拍照识别' : '从相册选择'}
        </Title>
        <View style={{ width: 40 }} />
      </View>

      {uris.length === 0 ? (
        <EmptyState
          emoji={mode === 'camera' ? '📷' : '🖼'}
          title="对准教材页面"
          body={'拍清楚一点，一次最多 10 张。\n同一份材料的多页可以连着拍。'}
          cta={
            <Button
              label={mode === 'camera' ? '打开相机' : '打开相册'}
              onPress={() => pick(mode)}
            />
          }
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.grid}>
            {uris.map((uri, index) => (
              <View key={`${uri}-${index}`} style={styles.thumbWrap}>
                <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                <Text style={styles.page}>{index + 1}</Text>
                <Pressable
                  onPress={() => setUris((c) => c.filter((_, i) => i !== index))}
                  style={styles.remove}
                  accessibilityRole="button"
                  accessibilityLabel={`删除第 ${index + 1} 张`}
                >
                  <Text style={styles.removeLabel}>✕</Text>
                </Pressable>
                <View style={styles.reorder}>
                  <Pressable onPress={() => move(index, -1)} hitSlop={8} accessibilityLabel="前移">
                    <Text style={styles.arrow}>‹</Text>
                  </Pressable>
                  <Pressable onPress={() => move(index, 1)} hitSlop={8} accessibilityLabel="后移">
                    <Text style={styles.arrow}>›</Text>
                  </Pressable>
                </View>
              </View>
            ))}
            {uris.length < MAX_IMAGES ? (
              <Pressable onPress={() => pick(mode)} style={styles.addTile} accessibilityLabel="继续添加">
                <Text style={{ fontSize: 30, color: colors.primary }}>＋</Text>
                <Text style={styles.addTileLabel}>继续添加</Text>
              </Pressable>
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            <Body muted center style={{ marginBottom: spacing(3) }}>
              已选 {uris.length} / {MAX_IMAGES} 张
            </Body>
            <Button label="用这些内容" onPress={submit} loading={busy} />
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, paddingTop: spacing(12) },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(5),
    marginBottom: spacing(4),
  },
  cancel: { fontSize: font.body, color: colors.textMuted, width: 40 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing(3),
    padding: spacing(5),
  },
  thumbWrap: {
    width: 104,
    height: 138,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.borderStrong,
  },
  thumb: { width: '100%', height: '100%' },
  page: {
    position: 'absolute',
    left: 6,
    top: 6,
    color: '#fff',
    fontSize: font.tiny,
    fontWeight: '700',
    backgroundColor: 'rgba(15,23,42,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  remove: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeLabel: { color: '#fff', fontSize: 12 },
  reorder: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1),
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  arrow: { color: '#fff', fontSize: 20, lineHeight: 22 },
  addTile: {
    width: 104,
    height: 138,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing(1),
  },
  addTileLabel: { fontSize: font.tiny, color: colors.primary },
  footer: {
    padding: spacing(5),
    paddingBottom: spacing(10),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
