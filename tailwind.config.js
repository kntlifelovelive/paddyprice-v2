/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic theme tokens — the ONLY colors components may use.
        // Values live in src/shared/theme/tokens.css (`--c-*` per theme) and
        // are switched via `data-theme` on <html>; no hard-coded colors here.
        background: 'var(--c-background)',
        surface: {
          DEFAULT: 'var(--c-surface)',
          hover: 'var(--c-surface-hover)',
        },
        overlay: 'var(--c-overlay)',
        // Text roles: normal body text, table primary/secondary/header text,
        // muted metadata. None of these are pure #ffffff in any theme.
        content: {
          DEFAULT: 'var(--c-text)',
          body: 'var(--c-text-body)',
          primary: 'var(--c-text-primary)',
          secondary: 'var(--c-text-secondary)',
          header: 'var(--c-text-header)',
          muted: 'var(--c-text-muted)',
        },
        muted: 'var(--c-muted)',
        subtle: 'var(--c-subtle)',
        border: 'var(--c-border)',
        'border-hover': 'var(--c-border-hover)',
        accent: {
          DEFAULT: 'var(--c-accent)',
          hover: 'var(--c-accent-hover)',
          text: 'var(--c-accent-text)',
          muted: 'var(--c-accent-muted)',
        },
        success: 'var(--c-success)',
        info: 'var(--c-info)',
        warning: 'var(--c-warning)',
        danger: 'var(--c-danger)',
      },
    },
  },
  plugins: [],
}
