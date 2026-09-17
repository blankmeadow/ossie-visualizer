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
