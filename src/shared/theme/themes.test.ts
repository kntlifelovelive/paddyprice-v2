import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME,
  FONT_SIZE_SCALE,
  THEMES,
  applyFontSize,
  applyTheme,
  isLightTheme,
  normalizeFontSize,
  normalizeTheme,
} from './'

describe('theme registry', () => {
  it('registers 21 unique themes with the documented default', () => {
    expect(THEMES).toHaveLength(21)
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(21)
    expect(DEFAULT_THEME).toBe('tokyo-night')
    expect(isLightTheme(DEFAULT_THEME)).toBe(false)
    expect(isLightTheme('github-light')).toBe(true)
  })

  it('normalizes unknown and legacy values to the default theme', () => {
    expect(normalizeTheme('dracula')).toBe('dracula')
    expect(normalizeTheme('light')).toBe(DEFAULT_THEME)
    expect(normalizeTheme('dark')).toBe(DEFAULT_THEME)
    expect(normalizeTheme(42)).toBe(DEFAULT_THEME)
  })
})

describe('font-size scale', () => {
  it('uses the documented multipliers', () => {
    expect(FONT_SIZE_SCALE).toEqual({ small: 0.9, normal: 1.0, large: 1.1, xlarge: 1.2 })
    expect(normalizeFontSize('huge')).toBe('normal')
  })
})

describe('apply helpers', () => {
  it('applyTheme sets data-theme and the dark class for dark themes', () => {
    applyTheme('github-light')
    expect(document.documentElement.dataset.theme).toBe('github-light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    applyTheme('tokyo-night')
    expect(document.documentElement.dataset.theme).toBe('tokyo-night')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('applyFontSize sets the scale variable', () => {
    applyFontSize('large')
    expect(document.documentElement.style.getPropertyValue('--app-font-scale')).toBe('1.1')
  })
})
