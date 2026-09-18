/**
 * One source of truth for colour, spacing and type.
 *
 * The palette is deliberately narrow: a child sees two accents (blue for
 * "go", green for "right") and nothing else competing for attention. There is
 * no red anywhere -- section 25 rules out strong negative feedback.
 */
export const colors = {
  primary: '#2563EB',
  primaryDark: '#1D4ED8',
  primarySoft: '#EAF2FF',
  primaryTint: '#DBE9FF',

  success: '#22C55E',
  successSoft: '#DCFCE7',

  streak: '#F97316',
  streakSoft: '#FFF3E6',

  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',

  bg: '#F6F8FC',
  card: '#FFFFFF',
  border: '#E6EBF3',
  borderStrong: '#CBD5E1',

  overlay: 'rgba(15, 23, 42, 0.45)',
} as const;

export const spacing = (n: number) => n * 4;

/**
 * The reading column never grows past this, however wide the screen is.
 *
 * On an iPad the layout would otherwise stretch a single vocabulary row across
 * a foot of glass, and a four-option question would put its A/B/C/D labels and
 * their answers at opposite ends of the screen. A phone-width column, centred,
 * keeps every target within a thumb's reach in either orientation.
 */
export const maxContentWidth = 560;

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const font = {
  display: 44,
  title: 26,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

export const shadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.06,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#1D4ED8',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
} as const;

/**
 * Typography.
 *
 * Two families, split by script rather than by role:
 *
 * - **English, IPA and digits use Andika.** It is SIL's literacy typeface,
 *   drawn for beginning readers, and it is the only candidate that carries the
 *   full IPA range the dictionary needs -- Lexend, Nunito, Baloo and Atkinson
 *   Hyperlegible are all missing more than half of it, so a phonetic like
 *   /ˈfɒrɪst/ would fall back mid-word or render as tofu. Two of its shapes
 *   matter directly to this product: capital I carries serifs, so `Il1` cannot
 *   collapse into three identical bars in a spelling question, and `a` and `g`
 *   are single-storey, matching the letterforms a Chinese primary school child
 *   is taught to write in 四线三格.
 *
 * - **Chinese keeps the platform font** (PingFang SC on iOS, the vendor's
 *   Source Han / HarmonyOS cut on Android). Both are excellent and already
 *   installed; the smallest complete CJK webfont in this family costs ~10MB
 *   per weight, which is not a trade an MVP should make.
 *
 * Because React Native cannot fall back across families the way CSS can, and
 * because `fontWeight` is ignored for custom families on Android, English text
 * opts in explicitly through `latin()` and never merely sets a weight.
 */
export const fonts = {
  latinRegular: 'Andika_400Regular',
  latinBold: 'Andika_700Bold',
} as const;

/**
 * Style for text that is guaranteed to be Latin -- a lemma, a phonetic, an
 * original sentence, a letter tile, a digit.
 *
 * Do not use it for Chinese: it would rely on per-platform glyph fallback and
 * render 中文 at an inconsistent weight.
 */
export const latin = (weight: 'regular' | 'bold' = 'regular') => ({
  fontFamily: weight === 'bold' ? fonts.latinBold : fonts.latinRegular,
  // Android ignores fontWeight on a custom family and would synthesise a fake
  // bold on top of the real one, so the weight lives in the family name only.
  fontWeight: 'normal' as const,
});
