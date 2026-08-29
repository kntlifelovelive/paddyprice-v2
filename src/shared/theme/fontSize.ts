/**
 * Application font-size scale (documented: Small 0.90 / Normal 1.00 /
 * Large 1.10 / Extra Large 1.20, applied as `--app-font-scale` on :root and
 * consumed by `html { font-size: calc(16px * var(--app-font-scale, 1)) }`
 * in tokens.css). Values must stay in sync with the `font_size` setting.
 *
 * Persisting the choice is the settings service/store's responsibility
 * (later step); this module only validates and applies the scale.
 */

export type FontSizeId = 'small' | 'normal' | 'large' | 'xlarge'

/** Display label for each font scale (bilingual pairs). */
export const FONT_SIZE_LABELS: Record<FontSizeId, { my: string; en: string }> = {
  small: { my: 'သေးသေး', en: 'Small' },
  normal: { my: 'ပုံမှန်', en: 'Normal' },
  large: { my: 'ကြီးသေး', en: 'Large' },
  xlarge: { my: 'အထူးကြီး', en: 'Extra Large' },
}

/** CSS font-size scale multiplier for each font size id. */
export const FONT_SIZE_SCALE: Record<FontSizeId, number> = {
  small: 0.9,
  normal: 1.0,
  large: 1.1,
  xlarge: 1.2,
}

export const DEFAULT_FONT_SIZE: FontSizeId = 'normal'

/** Validate a value is a known font size id. */
export function isFontSizeId(value: unknown): value is FontSizeId {
  return (
    value === 'small' || value === 'normal' || value === 'large' || value === 'xlarge'
  )
}

/** Map unknown values to the default font size. */
export function normalizeFontSize(value: unknown): FontSizeId {
  return isFontSizeId(value) ? value : DEFAULT_FONT_SIZE
}

/** Apply a font-size scale to the document root. */
export function applyFontSize(id: FontSizeId): void {
  document.documentElement.style.setProperty('--app-font-scale', String(FONT_SIZE_SCALE[id]))
}
