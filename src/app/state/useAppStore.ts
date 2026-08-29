/**
 * App-level bootstrap state (Zustand) — docs/ARCHITECTURE.md §3.7
 * (`app/state/useAppStore.ts`). App-local: features must not consume it.
 *
 * Owns DB readiness + bootstrap orchestration only. The `initialize()`
 * sequence matches ARCHITECTURE §3.7: init the sql.js DB via
 * `infrastructure/db`, load settings via `services/settings` (which syncs the
 * app-wide settings store), then apply the stored theme / font scale /
 * language via `shared/theme` + `document`. No business rules here.
 *
 * The gate order (Device Authorization → App Lock → Application,
 * PROJECT_SPEC §1.2) is composed in `src/app` — the device-auth and app-lock
 * gate UIs arrive with `features/device-auth` and `features/security`.
 */
import { create } from 'zustand'

import { initDatabase } from '@/infrastructure/db/init'
import { settingsService } from '@/services/settings'
import { applyFontSize, applyTheme, normalizeTheme } from '@/shared/theme'
import { useSettingsStore } from '@/shared/state'

export interface AppState {
  /** Whether bootstrap is still running. */
  bootstrapping: boolean
  /** True once the DB + settings have been initialized successfully. */
  dbReady: boolean
  /** Bootstrap failure message (null when healthy). */
  dbError: string | null
  /** Run the bootstrap sequence (idempotent per session). */
  initialize: () => Promise<void>
}

function applyStoredPreferences(): void {
  const settings = useSettingsStore.getState().settings
  if (!settings) return
  // normalizeTheme migrates legacy `light`/`dark` values to the default theme.
  applyTheme(normalizeTheme(settings.theme))
  applyFontSize(settings.font_size)
  // Documented default document language is Myanmar (`index.html` lang="my").
  document.documentElement.lang = settings.language
}

export const useAppStore = create<AppState>()((set) => ({
  bootstrapping: false,
  dbReady: false,
  dbError: null,

  initialize: async () => {
    set({ bootstrapping: true, dbError: null, dbReady: false })
    try {
      const db = await initDatabase()
      settingsService.load(db)
      applyStoredPreferences()
      set({ bootstrapping: false, dbReady: true })
    } catch (error) {
      // Fail safely: stay on the bootstrap error screen; nothing loads.
      set({
        bootstrapping: false,
        dbReady: false,
        dbError: error instanceof Error ? error.message : 'Application bootstrap failed',
      })
    }
  },
}))