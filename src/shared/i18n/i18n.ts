/**
 * i18n foundation — bilingual (`my` default, `en`) translation API.
 *
 * Preserves the documented reference behavior: translation data is carried as
 * **bilingual pairs** (`{ my, en }` objects or `"myanmar / english"` shorthand
 * strings, split on the first ` / `) rather than a central string-id
 * dictionary; there is no fallback language — pairs are complete.
 *
 * Framework-light by design: no React, no storage. Persisting/choosing the
 * language is the settings layer's responsibility (later step); features call
 * `translate(lang, pair)` or a bound `createTranslator(lang)`.
 */

export type Language = 'my' | 'en'

/**
 * English is the default application language for fresh installs.
 * (Step 11 §2 — was Myanmar previously; switched to English. Myanmar remains
 * a fully supported, selectable language; bilingual `{ my, en }` pairs and
 * `useT()` are unchanged.)
 */
export const DEFAULT_LANGUAGE: Language = 'en'

/** A complete bilingual pair. Both sides must always be provided. */
export interface BilingualPair {
  my: string
  en: string
}

export function isLanguage(value: unknown): value is Language {
  return value === 'my' || value === 'en'
}

/** Map unknown values to the default language. */
export function normalizeLanguage(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE
}

/**
 * Render a bilingual pair (or `"my / en"` shorthand string) in the given
 * language. Shorthand strings split on the FIRST ` / ` occurrence; a string
 * without a valid separator is returned unchanged.
 */
export function translate(lang: Language, pair: BilingualPair | string): string {
  if (typeof pair === 'string') {
    const idx = pair.indexOf(' / ')
    if (idx > 0) {
      const my = pair.slice(0, idx)
      const en = pair.slice(idx + 3)
      return lang === 'en' ? en : my
    }
    return pair
  }
  return lang === 'en' ? pair.en : pair.my
}

export type TranslateFn = (pair: BilingualPair | string) => string

/** A `t(pair)` function bound to one language. */
export function createTranslator(lang: Language): TranslateFn {
  return (pair) => translate(lang, pair)
}
