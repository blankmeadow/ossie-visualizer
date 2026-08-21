import { describe, expect, it } from 'vitest'
import { LOCALES, MESSAGES, translate } from './i18n'

describe('translation catalogue', () => {
  it('covers every key in every locale', () => {
    const union = new Set(LOCALES.flatMap((locale) => Object.keys(MESSAGES[locale])))
    for (const locale of LOCALES) {
      const missing = [...union].filter((key) => !(key in MESSAGES[locale]))
      expect(missing, `missing from ${locale}`).toEqual([])
    }
  })

  it('never renders a raw key, which is what a gap in English looks like', () => {
    for (const locale of LOCALES) {
      for (const key of Object.keys(MESSAGES[locale])) {
        expect(translate(locale, key), `${locale}.${key}`).not.toBe(key)
      }
    }
  })

  it('fills placeholders and leaves unknown ones alone', () => {
    expect(translate('en', 'issue.unknownParent', { name: 'missing' }))
      .toBe('Unknown parent concept: missing')
    expect(translate('en', 'issue.unknownParent', {})).toBe('Unknown parent concept: {name}')
  })
})
