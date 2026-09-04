/**
 * PDF voucher + bag-weights FORMAT-PARITY tests (reference:
 * ~/paddyprice/src/services/pdf.ts buildReportHtml / buildBagWeightsPageHtml).
 *
 * Fixtures cover: a normal purchase, a moisture Pattern 1 purchase and a
 * Pattern 2 / deduction purchase. Templates consume the ALREADY calculated
 * snapshot values — the tests verify the reference structure, ordering and
 * those exact values appear in the rendered DOM.
 */
import { describe, expect, it } from 'vitest'

import { formatMMK, formatNumber, formatTins } from '@/shared/format'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import type {
  BagWeightReportInput,
  HomeSummaryPdfInput,
  VoucherReportInput,
  YearlyReportInput,
} from '@/types/pdf'
import { A4_HEIGHT_MM, planA4Pages } from './render'
import {
  buildBagWeightNode,
  buildHomeSummaryNode,
  buildVoucherNode,
  buildYearlyNode,
} from './templates'

const COMPANY = {
  name: 'PadDy Trading',
  address: 'No.12 Strand Rd, Yangon',
  phone: '09-123456789',
  footer_text: 'ကျေးဇူးတင်ပါသည်',
}

/** Normal purchase — net 400 lb, tins 8, amount 148,000. */
const VOUCHER: VoucherReportInput = {
  company: COMPANY,
  purchase_no: 'PSO-202609-0001',
  date: '2026-09-01',
  purchase_time: '',
  generated_at: '2026-09-01T11:00:00.000Z',
  farmer: { name: 'Mg Mg', address: 'Insein', phone: '09-555111' },
  rice_type_name: 'Shwe War Tun',
  price_per_tin: 18500,
  price_100_tin: 1850000,
  bags: [
    { seq: 1, weight_lb: 100 },
    { seq: 2, weight_lb: 150 },
    { seq: 3, weight_lb: 150 },
  ],
  total_bags: 3,
  gross_pound: 400,
  moisture_loss: 0,
  net_pound: 400,
  total_tins: 8,
  // decomposeNetPound(400, 50) → { tins: 8, extraLb: 0 } — no-extra-lb case.
  tins_whole: 8,
  extra_lb: 0,
  total_amount: 148000,
  finalized: true,
}

/** Pattern 1 purchase — label 17 deduction already applied by the domain. */
const PATTERN_1: VoucherReportInput = {
  ...VOUCHER,
  purchase_no: 'PSO-202609-0002',
  gross_pound: 500,
  moisture_loss: 25,
  net_pound: 475,
  total_tins: 9.5,
  // decomposeNetPound(475, 50) → { tins: 9, extraLb: 25 }.
  tins_whole: 9,
  extra_lb: 25,
  total_amount: 175750,
}

/** Pattern 2 / per-bag deduction purchase — same consumed-value rule. */
const PATTERN_2: VoucherReportInput = {
  ...VOUCHER,
  purchase_no: 'PSO-202609-0003',
  gross_pound: 395,
  moisture_loss: 20,
  net_pound: 375,
  total_tins: 7.5,
  // decomposeNetPound(375, 50) → { tins: 7, extraLb: 25 }.
  tins_whole: 7,
  extra_lb: 25,
  total_amount: 138750,
}

const BAGS: BagWeightReportInput = {
  company: COMPANY,
  farmer_name: 'Mg Mg',
  farmer_address: 'Insein',
  farmer_phone: '09-555111',
  groups: [
    {
      rice_type_name: 'Shwe War Tun',
      purchase_no: 'PSO-202609-0001',
      purchase_date: '2026-09-01',
      purchase_time: '10:30:00',
      rows: [
        { display_seq: 1, weight_lb: 100 },
        { display_seq: 2, weight_lb: 100 },
        { display_seq: 3, weight_lb: 95 },
      ],
    },
  ],
  generated_at: '2026-09-01T11:00:00.000Z',
  total_bags: 3,
  total_pound: 295,
  page: 1,
  total_pages: 2,
}

describe('buildVoucherNode (reference voucher format)', () => {
  it('renders the reference sections in the reference order', () => {
    const node = buildVoucherNode(VOUCHER)
    const text = node.textContent ?? ''
    expect(text).toContain('PADDY PURCHASE VOUCHER')
    expect(text).toContain('INFORMATION')
    expect(text).toContain('Voucher No')
    expect(text).toContain('Purchase Date')
    expect(text).toContain('Purchase Time')
    expect(text).toContain('Generated')
    expect(text).toContain('Paddy Type')
    expect(text).toContain('Price / 100 Tin')
    expect(text).toContain('Amount (MMK)')
    expect(text).toContain('Farmer Signature')
    expect(text).toContain('Authorized Signature')
    expect(text).toContain('Thank you for your business')
    expect(text).toContain(COMPANY.footer_text)
    // Reference ordering.
    const indexOf = (s: string) => text.indexOf(s)
    expect(indexOf('PADDY PURCHASE VOUCHER')).toBeLessThan(indexOf('INFORMATION'))
    expect(indexOf('INFORMATION')).toBeLessThan(indexOf('Paddy Type'))
    expect(indexOf('Paddy Type')).toBeLessThan(indexOf('Farmer Signature'))
    expect(indexOf('Farmer Signature')).toBeLessThan(indexOf('Thank you for your business'))
  })

  it('renders the exact snapshot values (normal purchase)', () => {
    const text = buildVoucherNode(VOUCHER).textContent ?? ''
    expect(text).toContain('PSO-202609-0001')
    expect(text).toContain('Mg Mg')
    expect(text).toContain('Shwe War Tun')
    expect(text).toContain(formatNumber(400)) // net pound (row + total)
    expect(text).toContain(formatTins(8)) // total tin (row + total)
    expect(text).toContain(formatNumber(0)) // extra lb (no-extra-lb case)
    expect(text).toContain(formatMMK(1850000)) // price / 100 tin
    expect(text).toContain(formatMMK(148000)) // amount (row + total)
    expect(text).toContain('01/09/2026') // DMY purchase date
  })

  it('renders Pattern 1 deduction values unchanged', () => {
    const text = buildVoucherNode(PATTERN_1).textContent ?? ''
    expect(text).toContain('PSO-202609-0002')
    expect(text).toContain(formatNumber(475))
    expect(text).toContain(formatTins(9)) // whole tin = floor(475/50)
    expect(text).not.toContain(formatTins(9.5))
    expect(text).toContain(formatNumber(25)) // extra lb = 475 - 9*50
    expect(text).toContain(formatMMK(175750))
  })

  it('renders Pattern 2 / deduction values unchanged', () => {
    const text = buildVoucherNode(PATTERN_2).textContent ?? ''
    expect(text).toContain('PSO-202609-0003')
    expect(text).toContain(formatNumber(375))
    expect(text).toContain(formatTins(7)) // whole tin = floor(375/50)
    expect(text).not.toContain(formatTins(7.5))
    expect(text).toContain(formatNumber(25)) // extra lb = 375 - 7*50
    expect(text).toContain(formatMMK(138750))
  })

  it('renders the real Purchase Time value (regression: it used to always show "—")', () => {
    const text = buildVoucherNode({ ...VOUCHER, purchase_time: '09:15 AM' }).textContent ?? ''
    expect(text).toContain('Purchase Time: 09:15 AM')
  })

  it('falls back to "—" only when no purchase time is available', () => {
    const text = buildVoucherNode(VOUCHER).textContent ?? '' // fixture: purchase_time ''
    expect(text).toContain('Purchase Time: —')
  })

  it('Tin + Extra lb are the SAME source values History shows (domain decomposition)', () => {
    // Both HistoryPage and the PDF service consume ONE `decomposeNetPound`
    // result. Any fixture must match both `.tins` (→ tins_whole) and
    // `.extraLb` (→ extra_lb).
    expect(decomposeNetPound(VOUCHER.net_pound, 50).tins).toBe(VOUCHER.tins_whole)
    expect(decomposeNetPound(VOUCHER.net_pound, 50).extraLb).toBe(VOUCHER.extra_lb)
    expect(decomposeNetPound(PATTERN_1.net_pound, 50).tins).toBe(PATTERN_1.tins_whole)
    expect(decomposeNetPound(PATTERN_1.net_pound, 50).extraLb).toBe(PATTERN_1.extra_lb)
    expect(decomposeNetPound(PATTERN_2.net_pound, 50).tins).toBe(PATTERN_2.tins_whole)
    expect(decomposeNetPound(PATTERN_2.net_pound, 50).extraLb).toBe(PATTERN_2.extra_lb)
  })
})

describe('buildBagWeightNode (reference bag-weights format)', () => {
  it('renders the reference structure', () => {
    const node = buildBagWeightNode(BAGS)
    const text = node.textContent ?? ''
    expect(text).toContain('BAG WEIGHT DETAILS')
    expect(text).toContain('INFORMATION')
    expect(text).toContain('Mg Mg')
    expect(text).toContain('PSO-202609-0001')
    expect(text).toContain('Rice Type: Shwe War Tun')
    expect(text).toContain(formatNumber(100))
    expect(text).toContain(formatNumber(95))
    expect(text).toContain('Page 1 / 2')
    expect(text).toContain('Rows 1–3')
  })
})

/* ------------------------------------------------------------------ */
/* Pagination regression — small vouchers must produce exactly 1 page. */
/* Uses the pure planA4Pages math (no DOM required) for deterministic    */
/* assertions. The DOM-level test belongs in a real browser / jsdom-canvas */
/* environment which is not the case in the current test runner.         */
/* ------------------------------------------------------------------ */

/** Rough content mm for each fixture type (letterhead + info + table + sigs). */
const SMALL_NORMAL_MM = 60   // ~60mm of real content for a 1-row voucher
const SMALL_PATTERN_MM = 70  // ~70mm for Pattern 1 / Pattern 2

describe('PDF pagination (planA4Pages — small vouchers)', () => {
  it('small normal purchase -> 1 page', () => {
    expect(planA4Pages(SMALL_NORMAL_MM)).toBe(1)
  })

  it('Pattern 1 voucher -> 1 page', () => {
    expect(planA4Pages(SMALL_PATTERN_MM)).toBe(1)
  })

  it('Pattern 2 / deduction voucher -> 1 page', () => {
    expect(planA4Pages(SMALL_PATTERN_MM)).toBe(1)
  })

  it('large data -> multiple pages only when genuinely required', () => {
    expect(planA4Pages(A4_HEIGHT_MM * 2 + 30)).toBe(3)
    expect(planA4Pages(A4_HEIGHT_MM + 40)).toBe(2)
  })

  it('no near-blank trailing page for tight fits', () => {
    expect(planA4Pages(A4_HEIGHT_MM)).toBe(1)
    expect(planA4Pages(A4_HEIGHT_MM + 8)).toBe(1)
    expect(planA4Pages(A4_HEIGHT_MM + 9)).toBe(2)
  })
})

/* ------------------------------------------------------------------ */
/* Typography parity — report pages must use reference sizing at 100%   */
/* zoom (36px/44px page padding, 24px letterhead, 13px tables with the  */
/* reference TH/TD borders and dark header rows).                       */
/* ------------------------------------------------------------------ */

const YEARLY: YearlyReportInput = {
  company: COMPANY,
  year: 2026,
  months: [
    {
      month: 'September',
      purchase_count: 2,
      total_bags: 6,
      total_pound: 875,
      total_tin: 17.5,
      total_amount: 323750,
    },
  ],
  paddy_types: [
    {
      rice_type_name: 'Shwe War Tun',
      total_pound: 875,
      total_tin: 17.5,
      total_amount: 323750,
    },
  ],
  totals: {
    month: '',
    purchase_count: 2,
    total_bags: 6,
    total_pound: 875,
    total_tin: 17.5,
    total_amount: 323750,
  },
  generated_at: '2026-09-01T11:00:00.000Z',
}

describe('PDF typography parity (report pages)', () => {
  it('uses the reference page margins (36px 44px)', () => {
    const node = buildYearlyNode(YEARLY)
    expect(node.style.padding).toBe('36px 44px')
    expect(node.style.width).toBe('210mm')
  })

  it('uses the reference letterhead / heading sizes', () => {
    const node = buildYearlyNode(YEARLY)
    // headerBar: wrap > left > company name
    const companyName = node.children[0].children[0].children[0] as HTMLElement
    expect(companyName.style.fontSize).toBe('24px')
  })

  it('renders 13px tables with the reference dark header + TD borders', () => {
    const node = buildYearlyNode(YEARLY)
    const table = node.querySelector('table') as HTMLTableElement
    expect(table.style.fontSize).toBe('13px')
    const headRow = table.querySelector('thead tr') as HTMLElement
    // jsdom normalizes colors to rgb().
    expect(headRow.style.background).toBe('rgb(17, 24, 39)')
    const th = headRow.children[0] as HTMLElement
    expect(th.style.border).toBe('1px solid rgb(17, 24, 39)')
    expect(th.style.padding).toBe('7px 10px')
    const td = table.querySelector('tbody td') as HTMLElement
    expect(td.style.border).toBe('1px solid rgb(55, 65, 81)')
    expect(td.style.padding).toBe('7px 10px')
  })

  it('keeps report totals untouched (PDF consumes existing values only)', () => {
    const text = buildYearlyNode(YEARLY).textContent ?? ''
    // Report tables render the existing values verbatim (pound toFixed(2),
    // amount toFixed(0)) — the PDF never recomputes anything.
    expect(text).toContain('875.00')
    expect(text).toContain('323750')
  })
})

/* ------------------------------------------------------------------ */
/* G. Home Period Summary (reference buildSummaryReportHtml)           */
/* ------------------------------------------------------------------ */

const HOME_SUMMARY: HomeSummaryPdfInput = {
  company: COMPANY,
  title: 'DAILY REPORT',
  period_label: 'Period: 01/09/2026 · Shwe War Tun',
  file_tag: 'daily_2026-09-01_type1',
  rows: [
    {
      rice_type_name: 'Shwe War Tun',
      total_bags: 3,
      total_pound: 373,
      total_tin: 7,
      total_extra_lb: 23,
      price_100_tin: 1850000,
      total_amount: 148000,
    },
  ],
  // decomposeNetPound(373, 50) → { tins: 7, extraLb: 23 } (7×50 = 350, remainder 23).
  totals: { bags: 3, pound: 373, tin: 7, extra_lb: 23, amount: 148000 },
  generated_at: '2026-09-01T11:00:00.000Z',
}

describe('buildHomeSummaryNode (reference buildSummaryReportHtml format)', () => {
  it('renders the reference letterhead, title, period line and footer', () => {
    const node = buildHomeSummaryNode(HOME_SUMMARY)
    const text = node.textContent ?? ''
    expect(text).toContain('PadDy Trading')
    expect(text).toContain('DAILY REPORT')
    expect(text).toContain('Period: 01/09/2026 · Shwe War Tun')
    expect(text).toContain('Thank you for your business')
    // Generated date uses the reference DD-MMM-YYYY hh:mm AM/PM formatter.
    expect(text).toContain('Generated: 01-Sep-2026')
  })

  it('uses reference page margins and report typography', () => {
    const node = buildHomeSummaryNode(HOME_SUMMARY)
    expect(node.style.width).toBe('210mm')
    expect(node.style.padding).toBe('36px 44px')
    // Letterhead name is 24px bold; title 20px bold with 2px letter-spacing.
    const letterhead = node.children[0].children[0] as HTMLElement
    expect(letterhead.style.fontSize).toBe('24px')
    expect(letterhead.style.fontWeight).toBe('700')
  })

  it('renders the dark-headed summary table with the reference columns', () => {
    const node = buildHomeSummaryNode(HOME_SUMMARY)
    const table = node.querySelector('table') as HTMLTableElement
    expect(table.style.fontSize).toBe('13px')
    const headRow = table.querySelector('thead tr') as HTMLElement
    expect(headRow.style.background).toBe('rgb(17, 24, 39)')
    const headers = Array.from(headRow.children).map((th) => (th as HTMLElement).textContent)
    expect(headers).toEqual([
      'No',
      'Paddy Type',
      'Bags',
      'Pound',
      'Tin',
      'Extra Lb',
      'Price / 100 Tin',
      'Amount (MMK)',
    ])
  })

  it('renders Tin as whole tins plus an Extra Lb column (decomposition)', () => {
    const node = buildHomeSummaryNode(HOME_SUMMARY)
    const text = node.textContent ?? ''
    // 373 lb → 7 Tin + 23 Extra Lb (the same decomposeNetPound the Home table uses).
    expect(text).toContain(formatTins(7))
    expect(text).toContain(formatNumber(23))
    // No decimal tins like "7.46" appear in the decomposition columns.
    expect(text).not.toContain(formatTins(7.46))
  })

  it('renders the exact snapshot values (rows + Total row) untouched', () => {
    const node = buildHomeSummaryNode(HOME_SUMMARY)
    const text = node.textContent ?? ''
    expect(text).toContain('Shwe War Tun')
    expect(text).toContain(formatNumber(373))
    expect(text).toContain(formatTins(7))
    expect(text).toContain(formatNumber(23))
    expect(text).toContain(formatMMK(1850000))
    expect(text).toContain(formatMMK(148000))
    // Total row: greyed bold background, Total + bags/pound/tin/amount.
    const tfoot = node.querySelector('tfoot') as HTMLElement
    expect(tfoot?.children[0]?.textContent ?? '').toContain('Total')
    expect(tfoot?.children[0]?.textContent ?? '').toContain(formatMMK(148000))
  })
})