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
  /** Settings-list preview colours: [background, surface, accent, info, warning, danger]. */
  readonly swatch: readonly [string, string, string, string, string, string]
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

/**
 * Settings theme-list preview chips — mirrors the `--c-*` values in
 * tokens.css (source of truth). Order: background, surface, accent, info,
 * warning, danger. Keep in sync when editing tokens.css.
 */
const THEME_SWATCHES: Record<ThemeId, readonly [string, string, string, string, string, string]> = {
  'tokyo-night': ['#1a1b26', '#1f2335', '#7aa2f7', '#7dcfff', '#e0af68', '#f7768e'],
  'github-light': ['#ffffff', '#f6f8fa', '#1a7f37', '#0969da', '#9a6700', '#cf222e'],
  'tokyo-night-storm': ['#24283b', '#1f2335', '#7aa2f7', '#7dcfff', '#e0af68', '#f7768e'],
  'one-dark': ['#282c34', '#21252b', '#61afef', '#61afef', '#e5c07b', '#e06c75'],
  'gruvbox-dark': ['#282828', '#32302f', '#fabd2f', '#83a598', '#fabd2f', '#fb4934'],
  'catppuccin-mocha': ['#1e1e2e', '#181825', '#89b4fa', '#89dceb', '#f9e2af', '#f38ba8'],
  nord: ['#2e3440', '#3b4252', '#88c0d0', '#8fbcbb', '#ebcb8b', '#bf616a'],
  dracula: ['#282a36', '#21222c', '#bd93f9', '#8be9fd', '#f1fa8c', '#ff5555'],
  'everforest-dark': ['#2d3830', '#272f27', '#a7c080', '#7fb8a4', '#e5c07b', '#e67071'],
  kanagawa: ['#1f1f28', '#23252f', '#7e9a60', '#7fb8a4', '#e5c07b', '#cf7a70'],
  'rose-pine': ['#191724', '#1f1d2b', '#c4a7e7', '#9ccfd8', '#f6c177', '#eb6f92'],
  'solarized-light': ['#fdf6e3', '#eee8d5', '#268bd2', '#2aa198', '#b58900', '#dc322f'],
  'one-light': ['#fafafa', '#f0f0f0', '#4078f2', '#4078f2', '#c18401', '#e45649'],
  'nord-light': ['#eceff4', '#e5e9f0', '#88c0d0', '#8fbcbb', '#ebcb8b', '#bf616a'],
  'catppuccin-latte': ['#eff1f5', '#e6e9ef', '#1e66f5', '#04a5e5', '#df8e1d', '#d20f39'],
  'everforest-light': ['#f3ead6', '#e4ddc8', '#a7c080', '#7fb8a4', '#e5c07b', '#e67071'],
  'rose-pine-dawn': ['#faf4ed', '#f2ece4', '#b4639c', '#9ccfd8', '#e5c07b', '#eb6f92'],
  'emerald-light': ['#f0fdf4', '#e6f7ed', '#10b981', '#06b6d4', '#f59e0b', '#ef4444'],
  'sky-light': ['#f0f9ff', '#e0f2fe', '#0ea5e9', '#38bdf8', '#f59e0b', '#ef4444'],
  'warm-paper': ['#f5f0e8', '#ebe5d9', '#c4720a', '#4a7a8a', '#c4720a', '#c44a2a'],
  midnight: ['#0d0d0d', '#171717', '#5c8ae6', '#5ca8d6', '#c4a02a', '#c44a4a'],
}

export const THEMES: readonly ThemeDefinition[] = THEME_IDS.map((id) => ({
  id,
  name: THEME_NAMES[id],
  light: LIGHT_THEMES.has(id),
  swatch: THEME_SWATCHES[id],
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
