/**
 * PDF service contracts (Step 3/9) - src/types foundation.
 *
 * Type-only contracts. The five documented report kinds each have a small
 * input shape and the path pattern they MUST emit (see REFERENCE_NOTES §8).
 * Implementations live in `src/services/pdf`; the renderer + rasterizer is
 * browser-only and lives in the same service module so the import edge is
 * `features -> services/pdf -> infrastructure/platform/fs -> platform`.
 */

/** Five documented PDF report kinds. */
export type ReportKind = 'voucher' | 'bag-weights' | 'yearly' | 'summary' | 'farmer'

/** Result of generating a PDF: the bytes + the deterministic relative path. */
export interface PdfArtifact {
  /** Raw PDF bytes. */
  bytes: Uint8Array
  /** Relative path inside the configured `pdf_dir` (no leading slash). */
  relativePath: string
  /** When the PDF was generated (ISO timestamp). */
  generatedAt: string
}

/** A small label/text pair used inside templates. */
export interface LabeledValue {
  label: string
  value: string
}

/** A document footer line. */
export interface FooterLine {
  text: string
  /** Centered vs left-aligned. Default centered. */
  align?: 'left' | 'center' | 'right'
}

/* ------------------------------------------------------------------ */
/* A. Purchase Voucher                                                  */
/* ------------------------------------------------------------------ */

export interface VoucherBagRow {
  /** 1-based bag sequence as displayed. */
  seq: number
  /** The weight to display - moisture-ADJUSTED weight per the documented rule. */
  weight_lb: number
  /** Optional Pattern 2 label - shown only when the bag overrides the default. */
  moisture_label?: number | null
}

export interface VoucherReportInput {
  /** Paddy company info shown in the letterhead. */
  company: {
    name: string
    address: string
    phone: string
    /** Optional Myanmar footer text. */
    footer_text: string
  }
  /** The purchase snapshot (price, totals, dates all come from this). */
  purchase_no: string
  date: string
  purchase_time: string
  generated_at: string
  /** Farmer (customer) information block. */
  farmer: {
    name: string
    address?: string
    phone?: string
  }
  /** The paddy type. */
  rice_type_name: string
  /** The STORED price snapshot (used for display). */
  price_per_tin: number
  price_100_tin: number
  /** All bag rows in display order. Weights MUST be moisture-adjusted. */
  bags: VoucherBagRow[]
  /** Aggregates - all stored values, never recomputed at template time. */
  total_bags: number
  gross_pound: number
  moisture_loss: number
  net_pound: number
  total_tins: number
  /**
   * Extra lb of the net-pound decomposition — mapped from the EXISTING domain
   * result (`decomposeNetPound`, services/pdf/service.ts). Same source the
   * History table's Extra Lb column consumes.
   */
  extra_lb: number
  /**
   * Whole-tin count of the SAME net-pound decomposition (`decomposeNetPound(...).tins`).
   * The voucher's Tin column renders this (floor), never the stored exact
   * `total_tins` — so Tin + Extra Lb always present one consistent result.
   */
  tins_whole: number
  total_amount: number
  /** Optional notes / remarks. */
  remarks?: string
  /** True when this purchase has been finalized (controls the read-only banner). */
  finalized: boolean
}

/* ------------------------------------------------------------------ */
/* B. Bag Weight Details                                                */
/* ------------------------------------------------------------------ */

export interface BagWeightRow {
  /** Display number - restarts at 1 within a single paddy-type group. */
  display_seq: number
  weight_lb: number
}

export interface BagWeightPaddyTypeGroup {
  rice_type_name: string
  purchase_no: string
  /** Original purchase date/time (NOT the generated timestamp). */
  purchase_date: string
  purchase_time: string
  rows: BagWeightRow[]
}

export interface BagWeightReportInput {
  company: VoucherReportInput['company']
  farmer_name: string
  /** Optional customer contact lines shown in the INFORMATION block. */
  farmer_address?: string
  farmer_phone?: string
  /** One entry per (purchase, paddy type) pair. */
  groups: BagWeightPaddyTypeGroup[]
  generated_at: string
  /** Total bag count across all groups. */
  total_bags: number
  /** Total moisture-adjusted pound across all groups. */
  total_pound: number
  /** 1-based page number shown in the page footer (default 1). */
  page?: number
  /** Total page count shown in the page footer (default 1). */
  total_pages?: number
}

/* ------------------------------------------------------------------ */
/* C. Yearly Report                                                     */
/* ------------------------------------------------------------------ */

export interface YearlyMonthRow {
  month: string
  purchase_count: number
  total_bags: number
  total_pound: number
  total_tin: number
  total_amount: number
}

export interface YearlyPaddyTypeRow {
  rice_type_name: string
  total_pound: number
  total_tin: number
  total_amount: number
}

export interface YearlyReportInput {
  company: VoucherReportInput['company']
  year: number
  months: YearlyMonthRow[]
  paddy_types: YearlyPaddyTypeRow[]
  totals: YearlyMonthRow
  generated_at: string
}

/* ------------------------------------------------------------------ */
/* D. Period Summary (day / month / year)                              */
/* ------------------------------------------------------------------ */

export type PeriodKind = 'day' | 'month' | 'year'

export interface PeriodSummaryRow {
  rice_type_name: string
  total_bags: number
  total_pound: number
  total_tin: number
  total_amount: number
}

export interface PeriodSummaryInput {
  company: VoucherReportInput['company']
  period: PeriodKind
  /** Human-readable period label, e.g. "August 2026" or "2026-08-15". */
  period_label: string
  rows: PeriodSummaryRow[]
  totals: PeriodSummaryRow
  generated_at: string
}

/* ------------------------------------------------------------------ */
/* E. Farmer Report                                                     */
/* ------------------------------------------------------------------ */

export interface FarmerReportPaddyTypeRow {
  rice_type_name: string
  total_pounds: number
  total_tins: number
  total_amount: number
}

export interface FarmerReportPurchaseRow {
  purchase_no: string
  date: string
  rice_type_name: string
  net_pound: number
  total_tins: number
  total_amount: number
}

export interface FarmerReportInput {
  company: VoucherReportInput['company']
  farmer: {
    name: string
    address?: string
    phone?: string
  }
  /** "all_time" when no filter is active. */
  period_label: string
  yearly_summary: {
    record_count: number
    total_pounds: number
    total_tins: number
    total_amount: number
  }
  paddy_types: FarmerReportPaddyTypeRow[]
  purchases: FarmerReportPurchaseRow[]
  generated_at: string
}
