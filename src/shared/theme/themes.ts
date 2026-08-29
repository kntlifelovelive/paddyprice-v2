/**
 * Central theme registry — the 21 documented themes (10 dark + 10 light +
 * `midnight`; default `tokyo-night`). Legacy `light`/`dark` settings values
 * normalize to the default theme.
 *
 * Themes are semantic CSS variables (`--c-*`) defined centrally in
 * `tokens.css` (one block per theme) and consumed by components only through
 * the Tailwind tokens mapped in `tailwind.config.js` (`bg-surface`,
 * `text-muted`, `border-border`, `text-content-*`, …). No theme logic lives
 * inside components.
 *
 * `applyTheme` touches only `document` (framework-light). Persisting the
 * selected theme is the settings service/store's responsibility (later step).
 */

export const THEME_IDS = [
  'tokyo-night',
  'tokyo-night-storm',
  'one-dark',
  'gruvbox-dark',
  'catppuccin-mocha',
  'nord',
  'dracula',
  'everforest-dark',
  'kanagawa',
  'rose-pine',
  'github-light',
  'solarized-light',
  'one-light',
  'nord-light',
  'catppuccin-latte',
  'everforest-light',
  'rose-pine-dawn',
  'emerald-light',
  'sky-light',
  'warm-paper',
  'midnight',
] as const

export type ThemeId = (typeof THEME_IDS)[number]

export interface ThemeDefinition {
  readonly id: ThemeId
  readonly name: string
  /** `true` ⇒ light-scheme theme. */
  readonly light: boolean
}

const LIGHT_THEMES: ReadonlySet<string> = new Set([
  'github-light',
  'solarized-light',
  'one-light',
  'nord-light',
  'catppuccin-latte',
  'everforest-light',
  'rose-pine-dawn',
  'emerald-light',
  'sky-light',
  'warm-paper',
])

const THEME_NAMES: Record<ThemeId, string> = {
  'tokyo-night': 'Tokyo Night',
  'tokyo-night-storm': 'Tokyo Night Storm',
  'one-dark': 'One Dark',
  'gruvbox-dark': 'Gruvbox Dark',
  'catppuccin-mocha': 'Catppuccin Mocha',
  nord: 'Nord',
  dracula: 'Dracula',
  'everforest-dark': 'Everforest Dark',
  kanagawa: 'Kanagawa',
  'rose-pine': 'Rosé Pine',
  'github-light': 'GitHub Light',
  'solarized-light': 'Solarized Light',
  'one-light': 'One Light',
  'nord-light': 'Nord Light',
  'catppuccin-latte': 'Catppuccin Latte',
  'everforest-light': 'Everforest Light',
  'rose-pine-dawn': 'Rosé Pine Dawn',
  'emerald-light': 'Emerald Light',
  'sky-light': 'Sky Light',
  'warm-paper': 'Warm Paper',
  midnight: 'Midnight',
}

export const THEMES: readonly ThemeDefinition[] = THEME_IDS.map((id) => ({
  id,
  name: THEME_NAMES[id],
  light: LIGHT_THEMES.has(id),
}))

export const DEFAULT_THEME: ThemeId = 'tokyo-night'

/** Validate a value is a known theme id. */
export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && (THEME_IDS as readonly string[]).includes(value)
}

/** Map legacy `light`/`dark` and unknown values to the default theme. */
export function normalizeTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME
}

export function isLightTheme(id: ThemeId): boolean {
  return LIGHT_THEMES.has(id)
}

/**
 * Apply a theme to the document root: sets `data-theme` (selecting the
 * matching `--c-*` variable block in tokens.css) and toggles the `dark`
 * class for dark-scheme themes (Tailwind `dark:` variant support).
 */
export function applyTheme(id: ThemeId): void {
  const root = document.documentElement
  root.dataset.theme = id
  root.classList.toggle('dark', !isLightTheme(id))
}
