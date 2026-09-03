/**
 * App-level data contracts — src/types foundation (Step 3).
 *
 * Type-only, framework-independent. This is the bottom layer: it imports
 * nothing at runtime. Every other layer (app, features, services,
 * infrastructure, shared) may import these contracts without coupling to
 * each other.
 *
 * Important reuse rule: entity shapes that already exist in `src/domain`
 * (e.g. `PurchaseSnapshot`, `BagRow`, `MoistureLabelValue`, `MoistureRates`,
 * summary rows) are NOT duplicated here — ports reference them via type-only
 * imports from `@/domain`, so the domain stays the single source of truth
 * for the domain model while this file stays runtime-free.
 */

import type {
  MoistureLabelValue,
  MoistureRates,
} from '@/domain/paddy/moisture'
import type { PaperWidth, PrinterType } from '@/types/print'

/** §6.2 — the data needed to establish a new purchase session. */
export interface NewPurchaseInput {
  /** Farmer id (a farmer must be selected). */
  farmer_id: number
  /** Purchase date, `YYYY-MM-DD`. */
  date: string
  rice_type_id: number
  /** §5.4 — price snapshot taken at creation; never re-read from the price table later. */
  price_100_tin: number
  /** §5.4 — price snapshot (MMK for 1 tin). */
  price_per_tin: number
  /** §4.4 — Pattern-1 moisture label (null = None), snapshotted at creation. */
  moisture_label: MoistureLabelValue | undefined
}

/** Schema entity — a farmer (customer). */
export interface Farmer {
  id: number
  name: string
  address: string
  phone: string
  created_at: string
  updated_at: string
}

/** Schema entity — a paddy (rice) type. `active` gates whether it is selectable for new purchases. */
export interface RiceType {
  id: number
  name: string
  description: string
  /** 1 = active, 0 = inactive. */
  active: number
  created_at: string
}

/** Schema entity — a date+paddy-type price for 100 tins (and per tin). */
export interface RicePrice {
  /** Unique (date, rice_type_id). */
  id: number
  date: string
  rice_type_id: number
  /** MMK per 100 tins. */
  price_100_tin: number
  /** MMK per 1 tin (= price_100_tin / 100). */
  price_per_tin: number
  created_at: string
  updated_at: string
}

/** Per-farmer + per-paddy-type moisture configuration (Moisture page). */
export interface MoistureConfig {
  id: number
  farmer_id: number
  rice_type_id: number
  /** 'default' = no deduction suggestion; 'active' = apply `label`. */
  status: 'default' | 'active'
  /** §4.1 — 17|18|19|20 when active, else null. */
  label: MoistureLabelValue
  created_at: string
  updated_at: string
  farmer_name: string
  rice_type_name: string
}

/** Runtime application settings — persisted in the settings table. */
export interface Settings {
  company_name: string
  company_address: string
  company_phone: string
  /** Myanmar-language footer line shown on the voucher PDF. */
  company_footer_text: string
  /** §1 — "1 Tin = ? Pounds"; fallback 50 when invalid/missing. */
  tin_formula: string
  /** §4.1 — Settings-configured moisture deduction rates (lb per 50 lb). */
  moisture_rates: MoistureRates
  pdf_dir: string
  theme: string
  font_size: 'small' | 'normal' | 'large' | 'xlarge'
  language: 'my' | 'en'
  /** Selected printer adapter (settings-persisted). */
  printer_type: PrinterType
  /** Thermal paper width: 58mm ≈ 32 chars / 80mm ≈ 48 chars per line. */
  paper_width: PaperWidth
  /** Number of receipt copies (1-5). */
  copies: number
  /** Last-connected Bluetooth device address (empty when none). */
  printer_device_address: string
  /** Last-connected Bluetooth device name (empty when none). */
  printer_device_name: string
}

/** Settings keys that can be updated at runtime (subset of the settings table). */
export type SettingsKey = keyof Settings