/**
 * 手动添加 (spec section 13).
 *
 * The parent types one thing. The system fills in the lemma, the type, the
 * meaning and the phonetic; an original sentence is welcome but never
 * required. This route is free forever (section 45.4).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { api } from '../api/client';
import { speak } from '../components/speech';
import { Body, Button, Speaker, Title } from '../components/ui';
import { useNav } from '../nav/router';
import { colors, font, radius, spacing } from '../theme';

export function ManualAddScreen() {
  const { pop, dismissAll } = useNav();
  const [text, setText] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    lemma: string;
    type: string;
    meaning: string;
    phonetic: string | null;
  } | null>(null);
  const meaningTouched = useRef(false);

  // The form fills itself in as the parent types.
  const lookup = useCallback(async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setPreview(null);
      return;
    }
    try {
      const result = await api.lookup(trimmed);
      setPreview(result);
      if (!meaningTouched.current) setMeaning(result.meaning);
    } catch {
      setPreview(null);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void lookup(text), 300);
    return () => clearTimeout(timer);
  }, [text, lookup]);

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const created = await api.manualAdd({
        text: text.trim(),
        meaning: meaning.trim() || null,
        example: example.trim() || null,
      });
      dismissAll('library');
      Alert.alert(
        created.created ? '已加入词库' : '又遇到了 👋',
        `${created.lemma}  ${created.meaning}`,
      );
    } catch (error) {
      setBusy(false);
      Alert.alert('添加失败', error instanceof Error ? error.message : '请稍后再试');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={pop} hitSlop={12} accessibilityLabel="取消">
          <Text style={styles.cancel}>取消</Text>
        </Pressable>
        <Title style={{ fontSize: font.heading }}>手动添加</Title>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing(5) }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.label}>单词或短语</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="例如 take care of"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.inputLarge]}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />

        {preview && preview.lemma ? (
          <View style={styles.preview}>
            <View style={{ flex: 1 }}>
              <View style={styles.previewLine}>
                <Text style={styles.previewLemma}>{preview.lemma}</Text>
                <Text style={styles.badge}>{preview.type === 'PHRASE' ? '短语' : '单词'}</Text>
              </View>
              {preview.phonetic ? (
                <Text style={styles.previewPhonetic}>{preview.phonetic}</Text>
              ) : null}
              <Body muted style={{ marginTop: spacing(1) }}>
                {preview.meaning || '还没有释义，可以自己填一个'}
              </Body>
            </View>
            <Speaker onPress={() => speak(preview.lemma)} />
          </View>
        ) : null}

        <Text style={styles.label}>中文释义</Text>
        <TextInput
          value={meaning}
          onChangeText={(value) => {
            meaningTouched.current = true;
            setMeaning(value);
          }}
          placeholder="留空则自动填写"
          placeholderTextColor={colors.textFaint}
          style={styles.input}
        />

        <Text style={styles.label}>原文例句（可选）</Text>
        <TextInput
          value={example}
          onChangeText={setExample}
          placeholder="孩子在书上看到的那句话"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.inputMultiline]}
          multiline
        />
        <Body muted style={{ marginTop: spacing(2), fontSize: font.tiny }}>
          填了的话，以后会用这句话来出题。
        </Body>
      </ScrollView>

      <View style={styles.footer}>
        <Button label="加入词库" onPress={submit} loading={busy} disabled={!text.trim()} />
      </View>
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
  },
  cancel: { fontSize: font.body, color: colors.textMuted, width: 40 },
  label: {
    fontSize: font.small,
    fontWeight: '700',
    color: colors.textMuted,
    marginTop: spacing(6),
    marginBottom: spacing(2),
  },
  input: {
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(3),
    fontSize: font.body,
    color: colors.text,
    minHeight: 48,
  },
  inputLarge: { fontSize: font.heading, fontWeight: '600', minHeight: 58 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    marginTop: spacing(4),
    padding: spacing(4),
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
  },
  previewLine: { flexDirection: 'row', alignItems: 'center', gap: spacing(2) },
  previewLemma: { fontSize: font.body + 2, fontWeight: '700', color: colors.text },
  previewPhonetic: { fontSize: font.tiny, color: colors.textMuted, marginTop: 2 },
  badge: {
    fontSize: font.tiny,
    color: colors.primary,
    backgroundColor: '#fff',
    paddingHorizontal: spacing(2),
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  footer: {
    padding: spacing(5),
    paddingBottom: spacing(10),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.card,
  },
});
