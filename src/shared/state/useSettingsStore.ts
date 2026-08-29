/**
 * App-wide settings store (Zustand) — docs/ARCHITECTURE.md §3.7 / shared/state.
 *
 * This is the ONE app-wide reactive settings state. Its shape comes from
 * `src/types` (`Settings`, `SettingsKey`). The store is deliberately passive:
 * it only holds state and exposes the two operations its single writer —
 * `services/settings` — calls after persisting through the settings DAO.
 * Nothing else writes it directly (single-writer rule, ARCHITECTURE §3.7).
 *
 * `useSettingsStore.getState()` / `.setState()` are used by services outside
 * React; the hook form is used by the settings feature later.
 */
import { create } from 'zustand'
import type { Settings, SettingsKey } from '@/types'

export interface SettingsState {
  settings: Settings | null
  /** Whether settings have been loaded at least once (startup). */
  loaded: boolean
  /** Replace the whole settings object — called by `services/settings` on load. */
  load(settings: Settings): void
  /** Apply a single typed field update — called by `services/settings` after persisting. */
  update<K extends SettingsKey>(key: K, value: Settings[K]): void
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  settings: null,
  loaded: false,

  load: (settings) => set({ settings, loaded: true }),

  update: (key, value) =>
    set((state) => {
      if (state.settings === null) return {}
      return { settings: { ...state.settings, [key]: value } as Settings }
    }),
}))