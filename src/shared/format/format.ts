/**
 * Display-only formatting helpers (docs/DOMAIN_RULES.md §9.2 — presentation).
 *
 * These format values for display ONLY. No Paddy business calculations live
 * here: moisture loss, tins, prices, totals and P&L values are computed by
 * `src/domain` and merely rendered by these helpers. Rounding semantics are
 * the documented ones (max 2 fraction digits for numbers/MMK, 3 for tins) and
 * must not be changed.
 */

/** Format a number with thousands separators: 1850000 → "1,850,000". */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value)
}

/** Format an amount as Myanmar Kyat: 110445 → "110,445 MMK". */
export function formatMMK(value: number): string {
  return `${formatNumber(value)} MMK`
}

/** Format tins with up to 3 decimals: 5.964 → "5.964", 5 → "5". */
export function formatTins(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value)
}

/** Today's date as YYYY-MM-DD (local time). */
export function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Split an ISO datetime into { date: YYYY-MM-DD, time: HH:mm:ss } (local time). */
export function splitDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(
    2,
    '0',
  )}:${String(d.getSeconds()).padStart(2, '0')}`
  return { date, time }
}

/** Format an ISO datetime as 12-hour local time with AM/PM, e.g. "09:15:30 PM". */
export function formatTime12(iso: string): string {
  const d = new Date(iso)
  const h24 = d.getHours()
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(
    d.getSeconds(),
  ).padStart(2, '0')} ${period}`
}

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

/** Format a date (YYYY-MM-DD or ISO datetime) as DD-MMM-YYYY, e.g. "26-Aug-2026" (local time). */
export function formatDateDMY(iso: string): string {
  const d = iso.length <= 10 ? new Date(`${iso}T00:00:00`) : new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}-${MONTHS_SHORT[d.getMonth()]}-${d.getFullYear()}`
}

/** Format an ISO datetime as 12-hour local time without seconds, e.g. "10:35 AM". */
export function formatTime12Short(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const h24 = d.getHours()
  const period = h24 >= 12 ? 'PM' : 'AM'
  const h12 = h24 % 12 || 12
  return `${String(h12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${period}`
}
