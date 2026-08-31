/**
 * Reports service — docs/ARCHITECTURE.md §3.5 (`services/reports`).
 *
 * Prepares Dashboard (Today/Month/Year), History, P&L and moisture-deduction
 * report data for later UI work. Queries go through the purchases DAO; all
 * values are assembled from STORED SNAPSHOTS (never recalculated from current
 * Settings) using the pure aggregators in `src/domain/summaries` and
 * `src/domain/pnl`.
 *
 * Display contracts preserved here:
 * - Dashboard/History/purchase displays use NET pound as "Total Pound" and
 *   compute tins from net pound (DOMAIN_RULES §6.3).
 * - The P&L moisture-deduction report provides DEDUCTION pounds per moisture
 *   label (DOMAIN_RULES §8.1) — never gross or net pound — and keeps
 *   `Deduction Pound` distinct from `Excess Lb`.
 */
import type { Database } from 'sql.js'
import {
  buildPnlRow,
  computeMoistureDeductionBreakdown,
  summarizePnl,
  type DeductionByLabelRow,
  type MoistureDeductionBreakdown,
  type PnlRow,
  type PnlSummary,
} from '@/domain/pnl/report'
import type { MoistureLabel } from '@/domain/paddy/moisture'
import {
  buildDashboardGroupRows,
  summarizeByMonth,
  summarizeByRiceType,
  summarizePurchases,
  type DashboardGroupRow,
  type MonthSummaryRow,
  type PurchaseAggregate,
  type RiceTypeSummaryRow,
} from '@/domain/summaries/summaries'
import {
  listPurchases,
  type PurchaseFilter,
} from '@/infrastructure/db/dao/purchases'
import type { PurchaseRecord } from '@/types'
import type { PurchaseSnapshot } from '@/domain/purchase/types'
import { todayISO } from '@/shared/format'

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

export interface DashboardSummaries {
  /** Purchases dated exactly on `now`. */
  today: PurchaseAggregate
  /** Purchases in the same `YYYY-MM` as `now`. */
  month: PurchaseAggregate
  /** Purchases in the same `YYYY` as `now`. */
  year: PurchaseAggregate
}

export interface DashboardData {
  summaries: DashboardSummaries
  /** §3.2 — Farmer + Paddy Type + Price group rows (Dashboard/Home table). */
  groups: DashboardGroupRow[]
}

/** Dashboard data for a reference date (defaults to today, local time). */
export function getDashboard(db: Database, now: string = todayISO()): DashboardData {
  const snapshots = listPurchases(db).map((record) => record.snapshot)
  const month = now.slice(0, 7)
  const year = now.slice(0, 4)
  return {
    summaries: {
      today: summarizePurchases(snapshots.filter((s) => s.date === now)),
      month: summarizePurchases(snapshots.filter((s) => s.date.slice(0, 7) === month)),
      year: summarizePurchases(snapshots.filter((s) => s.date.slice(0, 4) === year)),
    },
    groups: buildDashboardGroupRows(snapshots),
  }
}

export type DashboardPeriod = 'today' | 'month' | 'year'

export interface DashboardDateGroup {
  /** `YYYY-MM-DD` the rows in this group belong to (snapshot date). */
  date: string
  groups: DashboardGroupRow[]
}

export interface DashboardView {
  /** Period + paddy-type filtered aggregate (the single summary card). */
  summary: PurchaseAggregate
  /** §3.2 — group rows for the whole selection. */
  groups: DashboardGroupRow[]
  /** Same rows, grouped by their own date — newest date first. */
  dateGroups: DashboardDateGroup[]
}

/**
 * §3.2 — Home table data for ONE calendar period (Today/Monthly/Yearly, in
 * the local reference date's own month/year — never rolling 30/365 days)
 * with an optional paddy-type filter. Reuses the same stored-snapshot loader
 * and pure aggregators as getDashboard — no new calculations.
 */
export function getDashboardView(
  db: Database,
  period: DashboardPeriod,
  riceTypeId: number | null,
  now: string = todayISO(),
): DashboardView {
  const snapshots = listPurchases(db).map((record) => record.snapshot)
  const filtered = snapshots.filter((s) =>
    period === 'today'
      ? s.date === now
      : period === 'month'
        ? s.date.slice(0, 7) === now.slice(0, 7)
        : s.date.slice(0, 4) === now.slice(0, 4),
  )
  const typed =
    riceTypeId == null
      ? filtered
      : filtered.filter((s) => s.rice_type_id === riceTypeId)
  // Per-date grouping (existing snapshot dates, unchanged) — newest first.
  const byDate = new Map<string, PurchaseSnapshot[]>()
  for (const s of typed) {
    const key = s.date.slice(0, 10)
    const bucket = byDate.get(key)
    if (bucket) bucket.push(s)
    else byDate.set(key, [s])
  }
  const dateGroups: DashboardDateGroup[] = [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, snaps]) => ({ date, groups: buildDashboardGroupRows(snaps) }))
  return {
    summary: summarizePurchases(typed),
    groups: buildDashboardGroupRows(typed),
    dateGroups,
  }
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/** Full purchase records, newest first (date DESC) — History's source data. */
export function getHistoryRecords(
  db: Database,
  filter: PurchaseFilter = {},
): PurchaseRecord[] {
  return listPurchases(db, filter)
}

/** §9.1 — month-grouped History summaries (`YYYY-MM` rows). */
export function getMonthSummaries(
  db: Database,
  filter: PurchaseFilter = {},
): MonthSummaryRow[] {
  return summarizeByMonth(getHistoryRecords(db, filter).map((r) => r.snapshot))
}

/** §9.1 — per-paddy-type summary rows. */
export function getRiceTypeSummaries(
  db: Database,
  filter: PurchaseFilter = {},
): RiceTypeSummaryRow[] {
  return summarizeByRiceType(getHistoryRecords(db, filter).map((r) => r.snapshot))
}

/* ------------------------------------------------------------------ */
/* Profit & Loss                                                       */
/* ------------------------------------------------------------------ */

export interface PnlReport {
  /** One row per purchase (date DESC), including the Pattern-2 breakdown text. */
  rows: PnlRow[]
  summary: PnlSummary
}

/** §8 — P&L data from stored snapshot values only. */
export function getPnlReport(db: Database, filter: PurchaseFilter = {}): PnlReport {
  const records = listPurchases(db, filter)
  const rows: PnlRow[] = records.map(({ snapshot: s, bags }) =>
    buildPnlRow(
      {
        purchase_no: s.purchase_no,
        date: s.date,
        farmer_name: s.farmer_name,
        rice_type_name: s.rice_type_name,
        gross_pound: s.gross_pound,
        moisture_label: s.moisture_label,
        moisture_loss: s.moisture_loss,
        net_pound: s.net_pound,
        price_per_tin: s.price_per_tin,
        total_amount: s.total_amount,
      },
      bags,
    ),
  )
  return { rows, summary: summarizePnl(rows) }
}

/* ------------------------------------------------------------------ */
/* Moisture deduction (P&L §8.1)                                       */
/* ------------------------------------------------------------------ */

/** §8.1 — one purchase's deduction-row data (deduction pounds, NOT net). */
export interface PurchaseDeductionEntry {
  purchase_no: string
  date: string
  farmer_name: string
  rice_type_name: string
  breakdown: MoistureDeductionBreakdown
}

/** §8.3 — a grouped deduction total (by farmer / by paddy type). */
export interface DeductionGroupRow {
  name: string
  deduction_lb: number
}

export interface MoistureDeductionReport {
  /** Per-purchase deduction tables (purchase identification carried along). */
  entries: PurchaseDeductionEntry[]
  /** Report-wide label aggregation — only labels with deduction data appear. */
  byLabel: DeductionByLabelRow[]
  /** Grand total = Σ entries = Σ byLabel. This is NOT the net pound. */
  total_deduction_lb: number
  /** §8.3 — deduction pound grouped by Customer/Farmer. */
  byFarmer: DeductionGroupRow[]
  /** §8.3 — deduction pound grouped by Paddy/Rice Type. */
  byRiceType: DeductionGroupRow[]
}

/**
 * §8.1/§8.3 — moisture deduction report. Per-label deduction pounds are
 * computed by `domain/pnl` from the stored bag rows using each purchase's
 * SNAPSHOTTED deduction rates. Grouping is plain summation of those values. A
 * `None`/unknown row contributes 0 lb.
 */
export function getMoistureDeductionReport(
  db: Database,
  filter: PurchaseFilter = {},
): MoistureDeductionReport {
  const records = listPurchases(db, filter)

  const entries: PurchaseDeductionEntry[] = records.map(({ snapshot: s, bags }) => ({
    purchase_no: s.purchase_no,
    date: s.date,
    farmer_name: s.farmer_name,
    rice_type_name: s.rice_type_name,
    breakdown: computeMoistureDeductionBreakdown(bags, s.moisture_rates),
  }))

  const byLabelMap = new Map<MoistureLabel, number>()
  const byFarmerMap = new Map<string, number>()
  const byRiceTypeMap = new Map<string, number>()
  let total_deduction_lb = 0

  for (const entry of entries) {
    for (const row of entry.breakdown.labels) {
      byLabelMap.set(row.label, (byLabelMap.get(row.label) ?? 0) + row.deduction_lb)
    }
    const deduction = entry.breakdown.total_deduction_lb
    total_deduction_lb += deduction
    byFarmerMap.set(entry.farmer_name, (byFarmerMap.get(entry.farmer_name) ?? 0) + deduction)
    byRiceTypeMap.set(entry.rice_type_name, (byRiceTypeMap.get(entry.rice_type_name) ?? 0) + deduction)
  }

  const byLabel: DeductionByLabelRow[] = Array.from(byLabelMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([label, deduction_lb]) => ({ label, deduction_lb }))

  const byFarmer: DeductionGroupRow[] = groupRows(byFarmerMap)
  const byRiceType: DeductionGroupRow[] = groupRows(byRiceTypeMap)

  return { entries, byLabel, total_deduction_lb, byFarmer, byRiceType }
}

/** Sort group rows deterministically: highest deduction first, then name. */
function groupRows(map: Map<string, number>): DeductionGroupRow[] {
  return Array.from(map, ([name, deduction_lb]) => ({ name, deduction_lb })).sort(
    (a, b) => b.deduction_lb - a.deduction_lb || a.name.localeCompare(b.name),
  )
}