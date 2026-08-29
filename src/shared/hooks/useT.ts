/**
 * React bridge for the i18n foundation — docs/ARCHITECTURE.md shared/hooks.
 *
 * Reads the active language from the single app-wide settings store and binds
 * the i18n `translate` API to it. Myanmar is the default (`DEFAULT_LANGUAGE`).
 *
 * This is the only place components should obtain a translator; the
 * English-only security strings (`SECURITY_LOCK_TITLE` and friends from
 * `services/security/messages`) are deliberately NOT routed through this hook.
 */
import { useMemo } from 'react'
import { normalizeLanguage, createTranslator, type Language, type TranslateFn } from '@/shared/i18n'
import { useSettingsStore } from '@/shared/state'

/** The active application language (defaults to Myanmar). */
export function useLanguage(): Language {
  return useSettingsStore(
    (state) => normalizeLanguage(state.settings?.language),
  )
}

/** A `t(pair)` translator bound to the active application language. */
export function useT(): TranslateFn {
  const language = useLanguage()
  return useMemo(() => createTranslator(language), [language])
}