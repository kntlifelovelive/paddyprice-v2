import { describe, expect, it } from 'vitest'
import {
  DEFAULT_LANGUAGE,
  createTranslator,
  isLanguage,
  normalizeLanguage,
  translate,
} from './i18n'

describe('language defaults', () => {
  it('defaults to Myanmar', () => {
    expect(DEFAULT_LANGUAGE).toBe('my')
    expect(normalizeLanguage(undefined)).toBe('my')
    expect(normalizeLanguage('fr')).toBe('my')
    expect(normalizeLanguage('en')).toBe('en')
    expect(isLanguage('my')).toBe(true)
    expect(isLanguage('en')).toBe(true)
    expect(isLanguage('th')).toBe(false)
  })
})

describe('translate', () => {
  it('renders bilingual pair objects per language', () => {
    const pair = { my: 'ကြီး', en: 'Big' }
    expect(translate('my', pair)).toBe('ကြီး')
    expect(translate('en', pair)).toBe('Big')
  })

  it('renders "my / en" shorthand strings (first separator wins)', () => {
    expect(translate('my', 'ကြီး / Big')).toBe('ကြီး')
    expect(translate('en', 'ကြီး / Big')).toBe('Big')
    expect(translate('en', 'a / b / c')).toBe('b / c')
  })

  it('returns plain strings and invalid shorthand unchanged', () => {
    expect(translate('en', 'plain')).toBe('plain')
    expect(translate('en', ' / no-leading-my')).toBe(' / no-leading-my')
  })
})

describe('createTranslator', () => {
  it('binds a language', () => {
    const t = createTranslator('en')
    expect(t('ကြီး / Big')).toBe('Big')
  })
})
