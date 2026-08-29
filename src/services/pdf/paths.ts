/**
 * PDF path construction (Step 9) - services/pdf/paths.ts.
 *
 * Deterministic, platform-agnostic path builders. Each generator returns a
 * relative path string (under the company's pdf_dir setting). The actual
 * save/download is performed by the platform storage adapter in
 * infrastructure/platform/fs (see service.ts -> storage.save).
 */
import type { ReportKind } from '@/types/pdf'
import type { PurchaseRecord } from '@/types/ports'
import type { Farmer } from '@/types/entities'

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

/** Replace filesystem-unsafe characters. Myanmar text is preserved (Unicode-safe). */
export function sanitizeSegment(value: string): string {
  return value
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compose a relative PDF path under pdfDir (no leading/trailing slashes). */
export function buildRelativePath(
  pdfDir: string,
  kind: ReportKind,
  fileName: string,
): string {
  const dir = pdfDir.replace(/^\/+|\/+$/g, '')
  return `${dir}/${kind}/${sanitizeSegment(fileName)}`.replace(/^\/+/, '')
}

/** §3.5 - voucher file name uses the immutable purchase number. */
export function buildVoucherPath(
  pdfDir: string,
  record: PurchaseRecord,
): string {
  return buildRelativePath(
    pdfDir,
    'voucher',
    `${record.snapshot.purchase_no}.pdf`,
  )
}

/** §3.5 - bag-weight file name combines farmer + date range + filter. */
export function buildBagWeightPath(
  pdfDir: string,
  farmer: Farmer,
  date: string,
  endDate: string | null,
  riceTypeName: string | null,
): string {
  const parts: string[] = [farmer.name]
  if (riceTypeName) parts.push(riceTypeName)
  if (endDate && endDate !== date) parts.push(`${date}_${endDate}`)
  else parts.push(date)
  return buildRelativePath(pdfDir, 'bag-weights', `${parts.join('_')}.pdf`)
}

/** §3.5 - yearly file name. */
export function buildYearlyPath(pdfDir: string, year: number): string {
  return buildRelativePath(pdfDir, 'yearly', `Yearly_${year}.pdf`)
}

/** §3.5 - period summary file name. */
export function buildPeriodSummaryPath(
  pdfDir: string,
  period: 'day' | 'month' | 'year',
  value: string,
): string {
  return buildRelativePath(pdfDir, 'summary', `Summary_${period}_${value}.pdf`)
}

/** §3.5 - farmer report file name. */
export function buildFarmerReportPath(
  pdfDir: string,
  farmer: Farmer,
  year: number | null,
): string {
  const fileName = year == null
    ? `${farmer.name}_all`
    : `${farmer.name}_${year}`
  return buildRelativePath(pdfDir, 'farmer', `${fileName}.pdf`)
}

/** Format a "Generated:" timestamp in DD-MMM-YYYY HH:mm:ss (local time). */
export function formatGeneratedAt(date: Date = new Date()): string {
  const d = pad(date.getDate(), 2)
  const m = date.toLocaleString('en-US', { month: 'short' })
  const y = date.getFullYear()
  const h = pad(date.getHours(), 2)
  const mi = pad(date.getMinutes(), 2)
  const s = pad(date.getSeconds(), 2)
  return `${d}-${m}-${y} ${h}:${mi}:${s}`
}
