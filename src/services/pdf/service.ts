/**
 * PDF service entry point (Step 9) - services/pdf/service.ts.
 *
 * Pure orchestration layer. Reads settings, purchase records, and report data
 * from the existing services + DAOs; builds the report Input shape; delegates
 * the DOM build to the templates; rasterizes via the render pipeline; saves
 * through the platform StoragePort.
 *
 * Architectural rules followed:
 *  - NO business math here. All totals, moisture, tin math live in
 *    `src/domain`. We only read stored snapshot values and pass them through.
 *  - The `moisture_rates` used for any historical computation are the
 *    purchase's SNAPSHOTTED rates (DOMAIN_RULES §4.4); current Settings are
 *    irrelevant for existing purchases.
 *  - The `price_per_tin` / `price_100_tin` are always the purchase's stored
 *    price snapshot (DOMAIN_RULES §5.4). Current Settings are irrelevant.
 *  - Voucher bag weights use moisture-ADJUSTED weight via the domain helper.
 *  - NO React, NO DOM (except through templates + render which are isolated).
 *  - The storage adapter is injected for tests; the default is the browser
 *    download adapter (the Electron host intercepts this in production).
 */
import type { Database } from 'sql.js'

import {
  moistureAdjustedWeight,
  type MoistureLabel,
  type MoistureRates,
} from '@/domain/paddy/moisture'
import type { PurchaseRecord } from '@/domain/purchase/types'
import { getFarmer, type Farmer } from '@/infrastructure/db/dao/farmers'
import { getPurchase, listPurchases } from '@/infrastructure/db/dao/purchases'
import { getRiceType, listRiceTypes } from '@/infrastructure/db/dao/riceTypes'
import { getAllSettings, getSetting } from '@/infrastructure/db/dao/settings'
import {
  summarizeByMonth,
  summarizeByRiceType,
  type MonthSummaryRow,
  type RiceTypeSummaryRow,
} from '@/domain/summaries/summaries'
import { splitDateTime } from '@/shared/format/format'
import { formatDateDMY, formatMMK, formatNumber, formatTime12, formatTime12Short } from '@/shared/format/format'
import { formatTins } from '@/shared/format/format'
import {
  buildBagWeightPath,
  buildFarmerReportPath,
  buildPeriodSummaryPath,
  buildVoucherPath,
  buildYearlyPath,
  formatGeneratedAt,
} from './paths'
import { htmlToPdf } from './render'
import {
  buildBagWeightNode,
  buildFarmerReportNode,
  buildPeriodSummaryNode,
  buildVoucherNode,
  buildYearlyNode,
  type DocumentFactory,
} from './templates'
import type { StoragePort } from '@/types/storage'
import { browserDownloadStorage } from '@/infrastructure/platform/fs'
import type {
  BagWeightPaddyTypeGroup,
  BagWeightReportInput,
  FarmerReportInput,
  PdfArtifact,
  PeriodKind,
  PeriodSummaryInput,
  VoucherReportInput,
  YearlyMonthRow,
  YearlyPaddyTypeRow,
  YearlyReportInput,
} from '@/types/pdf'

/* ------------------------------------------------------------------ */
/*  Company info                                                       */
/* ------------------------------------------------------------------ */

interface CompanyInfo {
  name: string
  address: string
  phone: string
  footer_text: string
}

const DEFAULT_COMPANY: CompanyInfo = {
  name: 'Paddy',
  address: '',
  phone: '',
  footer_text: '',
}

function readCompanyInfo(db: Database): CompanyInfo {
  const all = getAllSettings(db)
  return {
    name: all['company_name']?.trim() || DEFAULT_COMPANY.name,
    address: all['company_address'] ?? '',
    phone: all['company_phone'] ?? '',
    footer_text: all['company_footer_text'] ?? '',
  }
}

function readPdfDir(db: Database): string {
  return getSetting(db, 'pdf_dir')?.trim() || 'PSO/pdf'
}

/* ------------------------------------------------------------------ */
/*  Voucher - moisture-adjusted bag weight presentation                */
/* ------------------------------------------------------------------ */

function buildVoucherInput(
  db: Database,
  record: PurchaseRecord,
  company: CompanyInfo,
  generatedAt: string,
): VoucherReportInput {
  const s = record.snapshot
  // DOMAIN_RULES §4.4 - deduction rates are the purchase's SNAPSHOT, never
  // current Settings. The bag rows are presented as the moisture-adjusted
  // display weight computed with those snapshotted rates.
  const rates: MoistureRates = s.moisture_rates
  const farmer = getFarmer(db, s.farmer_id)
  const rice = getRiceType(db, s.rice_type_id)
  const purchaseTime = s.total_bags > 0 ? s.total_amount.toString() : '' // no created_at; use time portion
  return {
    company,
    purchase_no: s.purchase_no,
    date: formatDateDMY(s.date),
    purchase_time: formatTime12(purchaseTime || '1970-01-01T00:00:00'),
    generated_at: generatedAt,
    farmer: {
      name: s.farmer_name,
      address: farmer?.address ?? '',
      phone: farmer?.phone ?? '',
    },
    rice_type_name: s.rice_type_name || rice?.name || '',
    price_per_tin: s.price_per_tin,
    price_100_tin: s.price_100_tin,
    bags: record.bags.map((bag, idx) => ({
      seq: idx + 1,
      // CRITICAL: voucher shows the moisture-adjusted weight, not gross.
      weight_lb: moistureAdjustedWeight(bag.weight_lb, bag.moisture_label, rates),
      moisture_label:
        bag.moisture_label != null && isMoistureLabel(bag.moisture_label) ? bag.moisture_label : null,
    })),
    total_bags: s.total_bags,
    gross_pound: s.gross_pound,
    moisture_loss: s.moisture_loss,
    net_pound: s.net_pound,
    total_tins: s.total_tins,
    total_amount: s.total_amount,
    remarks: '',
    finalized: s.finalized,
  }
}

function isMoistureLabel(v: number): v is MoistureLabel {
  return v === 17 || v === 18 || v === 19 || v === 20
}

/* ------------------------------------------------------------------ */
/*  Bag Weight Details                                                 */
/* ------------------------------------------------------------------ */

const BAG_WEIGHT_ROWS_PER_PAGE = 100

function buildBagWeightInput(
  _db: Database,
  farmer: Farmer,
  records: readonly PurchaseRecord[],
  riceTypeName: string | null,
  company: CompanyInfo,
  generatedAt: string,
): BagWeightReportInput {
  // Group: one entry per (purchase, paddy type) - preserved in the order
  // purchases appear (newest first by source). Bag seq restarts at 1 inside
  // each group (DOMAIN_RULES §3.5 - bag weight details).
  const groups: BagWeightPaddyTypeGroup[] = []
  for (const rec of records) {
    if (riceTypeName && rec.snapshot.rice_type_name !== riceTypeName) continue
    const { time } = splitDateTime(generatedAt) // placeholder; replaced per-group below
    const { time: _drop, ...dateInfo } = { date: formatDateDMY(rec.snapshot.date), time: '' }
    // Re-extract properly from the original purchase (no created_at stored on
    // the snapshot, so fall back to the generated date's time portion - the
    // reference also does not preserve a precise purchase time-of-day).
    const parts = splitDateTime(`${rec.snapshot.date}T00:00:00`)
    groups.push({
      rice_type_name: rec.snapshot.rice_type_name,
      purchase_no: rec.snapshot.purchase_no,
      purchase_date: formatDateDMY(rec.snapshot.date),
      purchase_time: formatTime12Short(`${rec.snapshot.date}T00:00:00`),
      rows: rec.bags.map((b, idx) => ({
        display_seq: idx + 1,
        weight_lb: moistureAdjustedWeight(b.weight_lb, b.moisture_label, rec.snapshot.moisture_rates),
      })),
    })
  }
  const totalBags = groups.reduce((n, g) => n + g.rows.length, 0)
  const totalPound = groups.reduce((n, g) => n + g.rows.reduce((s, r) => s + r.weight_lb, 0), 0)
  // date range from records (newest to oldest)
  const dates = records.map((r) => r.snapshot.date).sort()
  return {
    company,
    farmer_name: farmer.name,
    groups,
    generated_at: generatedAt,
    total_bags: totalBags,
    total_pound: totalPound,
  }
}

/* ------------------------------------------------------------------ */
/*  Yearly Report                                                      */
/* ------------------------------------------------------------------ */

function buildYearlyInput(
  db: Database,
  year: number,
  records: readonly PurchaseRecord[],
  company: CompanyInfo,
  generatedAt: string,
): YearlyReportInput {
  const filtered = records.filter((r) => r.snapshot.date.startsWith(String(year)))
  const snapshots = filtered.map((r) => r.snapshot)
  const monthRows: MonthSummaryRow[] = summarizeByMonth(snapshots)
  const paddyRows: RiceTypeSummaryRow[] = summarizeByRiceType(snapshots)
  const months: YearlyMonthRow[] = monthRows.map((m) => ({
    month: m.month,
    purchase_count: m.purchase_count,
    total_bags: m.total_bags,
    total_pound: m.total_pounds,
    total_tin: m.total_tins,
    total_amount: m.total_amount,
  }))
  const paddy_types: YearlyPaddyTypeRow[] = paddyRows.map((p) => ({
    rice_type_name: p.rice_type_name,
    total_pound: p.total_pounds,
    total_tin: p.total_tins,
    total_amount: p.total_amount,
  }))
  const totals: YearlyMonthRow = {
    month: 'Total',
    purchase_count: months.reduce((n, m) => n + m.purchase_count, 0),
    total_bags: months.reduce((n, m) => n + m.total_bags, 0),
    total_pound: months.reduce((n, m) => n + m.total_pound, 0),
    total_tin: months.reduce((n, m) => n + m.total_tin, 0),
    total_amount: months.reduce((n, m) => n + m.total_amount, 0),
  }
  return { company, year, months, paddy_types, totals, generated_at: generatedAt }
}

/* ------------------------------------------------------------------ */
/*  Period Summary (day / month / year)                               */
/* ------------------------------------------------------------------ */

function buildPeriodSummaryInput(
  _db: Database,
  period: PeriodKind,
  periodLabel: string,
  records: readonly PurchaseRecord[],
  company: CompanyInfo,
  generatedAt: string,
): PeriodSummaryInput {
  const snapshots = records.map((r) => r.snapshot)
  const paddyRows = summarizeByRiceType(snapshots)
  const rows = paddyRows.map((p) => ({
    rice_type_name: p.rice_type_name,
    total_bags: p.total_bags,
    total_pound: p.total_pounds,
    total_tin: p.total_tins,
    total_amount: p.total_amount,
  }))
  const totals = {
    rice_type_name: 'Total',
    total_bags: rows.reduce((n, r) => n + r.total_bags, 0),
    total_pound: rows.reduce((n, r) => n + r.total_pound, 0),
    total_tin: rows.reduce((n, r) => n + r.total_tin, 0),
    total_amount: rows.reduce((n, r) => n + r.total_amount, 0),
  }
  return { company, period, period_label: periodLabel, rows, totals, generated_at: generatedAt }
}

/* ------------------------------------------------------------------ */
/*  Farmer Report                                                      */
/* ------------------------------------------------------------------ */

function buildFarmerReportInput(
  _db: Database,
  farmer: Farmer,
  year: number | null,
  records: readonly PurchaseRecord[],
  company: CompanyInfo,
  generatedAt: string,
): FarmerReportInput {
  const filtered = year == null
    ? records
    : records.filter((r) => r.snapshot.date.startsWith(String(year)))
  const snapshots = filtered.map((r) => r.snapshot)
  const paddyRows = summarizeByRiceType(snapshots)
  const paddy_types = paddyRows.map((p) => ({
    rice_type_name: p.rice_type_name,
    total_pounds: p.total_pounds,
    total_tins: p.total_tins,
    total_amount: p.total_amount,
  }))
  const purchases = filtered.map((r) => ({
    purchase_no: r.snapshot.purchase_no,
    date: formatDateDMY(r.snapshot.date),
    rice_type_name: r.snapshot.rice_type_name,
    net_pound: r.snapshot.net_pound,
    total_tins: r.snapshot.total_tins,
    total_amount: r.snapshot.total_amount,
  }))
  const yearly_summary = {
    record_count: snapshots.length,
    total_pounds: snapshots.reduce((n, s) => n + s.net_pound, 0),
    total_tins: snapshots.reduce((n, s) => n + s.total_tins, 0),
    total_amount: snapshots.reduce((n, s) => n + s.total_amount, 0),
  }
  return {
    company,
    farmer: { name: farmer.name, address: farmer.address ?? '', phone: farmer.phone ?? '' },
    period_label: year == null ? 'all_time' : String(year),
    yearly_summary,
    paddy_types,
    purchases,
    generated_at: generatedAt,
  }
}

/* ------------------------------------------------------------------ */
/*  Public service                                                     */
/* ------------------------------------------------------------------ */

export interface PdfService {
  /** Generate a Purchase Voucher PDF for a saved purchase. */
  generateVoucher(purchaseId: number): Promise<PdfArtifact>
  /** Generate a Bag Weight Details PDF for a farmer. */
  generateBagWeights(
    farmerId: number,
    options: { riceTypeName?: string | null; date?: string; endDate?: string | null } = {},
  ): Promise<PdfArtifact>
  /** Generate a Yearly Report PDF. */
  generateYearly(year: number): Promise<PdfArtifact>
  /** Generate a Period Summary PDF. */
  generatePeriodSummary(
    period: PeriodKind,
    value: string,
  ): Promise<PdfArtifact>
  /** Generate a Farmer Report PDF. */
  generateFarmerReport(
    farmerId: number,
    options: { year?: number | null } = {},
  ): Promise<PdfArtifact>
}

export interface PdfServiceDeps {
  db: Database
  storage?: StoragePort
  /** Override the document factory (tests). */
  factory?: DocumentFactory
  /** Inject a fixed generated-at timestamp (tests). */
  now?: () => Date
}

export function createPdfService(deps: PdfServiceDeps): PdfService {
  const { db, storage = browserDownloadStorage, factory, now = () => new Date() } = deps
  const company = readCompanyInfo(db)
  const pdfDir = readPdfDir(db)

  async function buildAndSave<T>(
    builder: (factory: DocumentFactory) => HTMLElement,
    relativePath: string,
    factoryOverride?: DocumentFactory,
  ): Promise<PdfArtifact> {
    const node = builder(factoryOverride ?? factory ?? defaultFactoryArg())
    const bytes = await htmlToPdf(node)
    const artifact: PdfArtifact = {
      bytes,
      relativePath,
      generatedAt: formatGeneratedAt(now()),
    }
    // Persist via the platform storage adapter (Electron intercepts in prod;
    // web/Android download through the browser).
    await storage.saveBinaryFile(relativePath, bytes)
    return artifact
  }

  return {
    async generateVoucher(purchaseId) {
      const record = getPurchase(db, purchaseId)
      if (!record) throw new Error(`Purchase ${purchaseId} not found`)
      const input = buildVoucherInput(db, record, company, formatGeneratedAt(now()))
      const relativePath = buildVoucherPath(pdfDir, record)
      return buildAndSave((f) => buildVoucherNode(input, f), relativePath, factory)
    },

    async generateBagWeights(farmerId, options = {}) {
      const farmer = getFarmer(db, farmerId)
      if (!farmer) throw new Error(`Farmer ${farmerId} not found`)
      const all = listPurchases(db, { farmer_id: farmerId })
      const filtered = all.filter((r) => {
        if (options.riceTypeName && r.snapshot.rice_type_name !== options.riceTypeName) return false
        if (options.date && r.snapshot.date < options.date) return false
        if (options.endDate && r.snapshot.date > options.endDate) return false
        return true
      })
      const input = buildBagWeightInput(db, farmer, filtered, options.riceTypeName ?? null, company, formatGeneratedAt(now()))
      const relativePath = buildBagWeightPath(pdfDir, farmer, options.date ?? filtered[0]?.snapshot.date ?? '', options.endDate ?? null, options.riceTypeName ?? null)
      return buildAndSave((f) => buildBagWeightNode(input, f), relativePath, factory)
    },

    async generateYearly(year) {
      const all = listPurchases(db)
      const input = buildYearlyInput(db, year, all, company, formatGeneratedAt(now()))
      const relativePath = buildYearlyPath(pdfDir, year)
      return buildAndSave((f) => buildYearlyNode(input, f), relativePath, factory)
    },

    async generatePeriodSummary(period, value) {
      const all = listPurchases(db)
      const filtered = all.filter((r) => {
        const d = r.snapshot.date
        if (period === 'day') return d === value
        if (period === 'month') return d.startsWith(value)
        if (period === 'year') return d.startsWith(value)
        return false
      })
      const input = buildPeriodSummaryInput(db, period, value, filtered, company, formatGeneratedAt(now()))
      const relativePath = buildPeriodSummaryPath(pdfDir, period, value)
      return buildAndSave((f) => buildPeriodSummaryNode(input, f), relativePath, factory)
    },

    async generateFarmerReport(farmerId, options = {}) {
      const farmer = getFarmer(db, farmerId)
      if (!farmer) throw new Error(`Farmer ${farmerId} not found`)
      const all = listPurchases(db, { farmer_id: farmerId })
      const input = buildFarmerReportInput(db, farmer, options.year ?? null, all, company, formatGeneratedAt(now()))
      const relativePath = buildFarmerReportPath(pdfDir, farmer, options.year ?? null)
      return buildAndSave((f) => buildFarmerReportNode(input, f), relativePath, factory)
    },
  }
}

function defaultFactoryArg(): DocumentFactory {
  return {
    createElement: (tag) => document.createElement(tag),
    createTextNode: (text) => document.createTextNode(text),
  }
}

export { BAG_WEIGHT_ROWS_PER_PAGE }
