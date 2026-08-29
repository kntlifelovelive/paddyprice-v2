/**
 * Settings service — docs/ARCHITECTURE.md §3.5 (`services/settings`).
 *
 * Loads settings from the settings DAO, keeps the app-wide settings store
 * (`shared/state`) in sync, persists single-field updates, and exposes the
 * current tin formula and moisture deduction rates to other services.
 *
 * This service owns NO business rules: fallback/resolution logic (invalid
 * `tin_formula` → 50, invalid/missing moisture rates → documented defaults,
 * legacy theme ids → default theme) lives in `src/domain` / `shared/theme`.
 *
 * Single-writer rule (ARCHITECTURE §3.7): this service is the only writer of
 * the settings store.
 */
import type { Database } from 'sql.js'
import { resolveLbPerTin } from '@/domain/paddy/tins'
import { resolveMoistureRates, type MoistureRates } from '@/domain/paddy/moisture'
import { normalizeTheme } from '@/shared/theme'
import { useSettingsStore } from '@/shared/state'
import * as settingsDao from '@/infrastructure/db/dao/settings'
import type { Settings, SettingsKey } from '@/types'

const FONT_SIZES = ['small', 'normal', 'large', 'xlarge'] as const
const LANGUAGES = ['my', 'en'] as const

/** Parse the stored moisture-rates JSON defensively → resolved defaults. */
function storedMoistureRates(db: Database): MoistureRates {
  let parsed: MoistureRates | null = null
  try {
    parsed = settingsDao.getMoistureRates(db)
  } catch {
    parsed = null // corrupt JSON → documented defaults
  }
  return resolveMoistureRates(parsed)
}

/** Build the typed `Settings` object from the stored key/value rows. */
function loadSettings(db: Database): Settings {
  const raw = settingsDao.getAllSettings(db)

  return {
    company_name: raw.company_name ?? 'Paddy',
    company_address: raw.company_address ?? '',
    company_phone: raw.company_phone ?? '',
    company_footer_text: raw.company_footer_text ?? '',
    tin_formula: raw.tin_formula ?? '50',
    moisture_rates: storedMoistureRates(db),
    pdf_dir: raw.pdf_dir ?? 'PSO/pdf',
    theme: normalizeTheme(raw.theme),
    font_size: (FONT_SIZES as readonly string[]).includes(raw.font_size ?? '')
      ? (raw.font_size as Settings['font_size'])
      : 'normal',
    language: (LANGUAGES as readonly string[]).includes(raw.language ?? '')
      ? (raw.language as Settings['language'])
      : 'my',
  }
}

export interface SettingsService {
  /** Load settings, replace the store contents, and return the typed object. */
  load(db: Database): Settings
  /** Persist one setting through the DAO and apply it to the store (single-writer). */
  update<K extends SettingsKey>(db: Database, key: K, value: Settings[K]): void
  /** Persist the configured moisture deduction rates and sync the store. */
  updateMoistureRates(db: Database, rates: MoistureRates): void
  /** Current effective lb-per-tin (domain fallback 50 when invalid/missing). */
  lbPerTin(db: Database): number
  /** Current configured moisture deduction rates (documented defaults when unset/corrupt). */
  moistureRates(db: Database): MoistureRates
}

function persistSetting<K extends SettingsKey>(
  db: Database,
  key: K,
  value: Settings[K],
): void {
  if (key === 'moisture_rates') {
    settingsDao.setMoistureRates(db, value as MoistureRates)
  } else {
    settingsDao.setSetting(db, key, String(value))
  }
}

export const settingsService: SettingsService = {
  load(db) {
    const settings = loadSettings(db)
    useSettingsStore.getState().load(settings)
    return settings
  },

  update(db, key, value) {
    persistSetting(db, key, value)
    useSettingsStore.getState().update(key, value)
  },

  updateMoistureRates(db, rates) {
    const resolved = resolveMoistureRates(rates)
    settingsDao.setMoistureRates(db, resolved)
    useSettingsStore.getState().update('moisture_rates', resolved)
  },

  lbPerTin(db) {
    return resolveLbPerTin(settingsDao.getSetting(db, 'tin_formula') ?? '')
  },

  moistureRates(db) {
    return storedMoistureRates(db)
  },
}