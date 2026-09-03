/**
 * Receipt text formatter — turns PrintReceipt data into plain-text lines
 * sized for 58mm (32 chars) or 80mm (48 chars) thermal paper.
 *
 * OUTPUT FORMAT PORT of the reference project's
 * `~/paddyprice/src/services/printer/ReceiptFormatter.ts` — same structure,
 * same ordering, same labels, same column widths. Pure functions only: no
 * SQLite, no Bluetooth, no UI. All values come from the caller (already
 * calculated by P2's domain/purchase layer) — nothing is recomputed here.
 */
import { formatMMK, formatNumber, formatTime12Short, formatTins } from '@/shared/format'
import { formatPriceShorthand } from '@/domain/paddy/price'
import type { PaperWidth, PrintReceipt } from '@/types/print'

/**
 * Reference receipt date display: DD/MM/YYYY (the reference project's
 * `formatDateDisplay` — its output format uses slashes, unlike P2's
 * app-wide DD-MMM-YYYY history display).
 */
export function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

/** Characters per line for each supported paper width. */
export function charsForWidth(width: PaperWidth): number {
  return width === '80' ? 48 : 32
}

function padEnd(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length)
}

function padStart(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : ' '.repeat(n - s.length) + s
}

function center(s: string, width: number): string {
  if (s.length >= width) return s.slice(0, width)
  const left = Math.floor((width - s.length) / 2)
  return ' '.repeat(left) + s
}

function repeat(ch: string, width: number): string {
  return ch.repeat(width)
}

/**
 * Render the full receipt as plain text.
 * Every paddy type keeps its own row — types are never merged.
 */
export function formatReceiptText(receipt: PrintReceipt, width: PaperWidth): string {
  const w = charsForWidth(width)
  const heavy = repeat('=', w)
  const light = repeat('-', w)
  const lines: string[] = []

  lines.push(heavy)
  lines.push(center('PADDY PURCHASE', w))
  if (receipt.company_name) lines.push(center(receipt.company_name, w))
  if (receipt.company_address) lines.push(center(receipt.company_address, w))
  if (receipt.company_phone) lines.push(center(receipt.company_phone, w))
  lines.push(heavy)

  lines.push(`Invoice: ${receipt.invoice_no}`)
  lines.push(`Purchase Date: ${formatDateDisplay(receipt.date)}`)
  lines.push(`Purchase Time: ${receipt.time}`)
  lines.push(
    `Generated: ${formatDateDisplay(receipt.generated_at)} ${formatTime12Short(receipt.generated_at)}`,
  )

  lines.push('')
  lines.push('Customer:')
  lines.push(receipt.farmer_name)
  if (receipt.farmer_address) lines.push(receipt.farmer_address)
  if (receipt.farmer_phone) lines.push(receipt.farmer_phone)

  lines.push(light)
  // Table header — column layout adapts to paper width.
  const nameW = Math.max(10, w - 16)
  lines.push(`${padEnd('Paddy Type', nameW)}${padStart('Pound', 6)}${padStart('Tin', 6)}`)
  lines.push(light)
  for (const row of receipt.rows) {
    lines.push(
      `${padEnd(row.rice_type_name, nameW)}${padStart(formatNumber(row.pounds), 6)}${padStart(formatTins(row.tins), 6)}`,
    )
    lines.push(
      `  ${padEnd(formatPriceShorthand(row.price_100_tin), Math.max(8, w - 20))}${padStart(formatMMK(row.amount), 16)}`,
    )
  }
  lines.push(light)

  // Per-bag weight details (so partial-fill bags are visible on the receipt).
  if (receipt.bags.length > 0) {
    lines.push(`Bags: ${receipt.bags.length}`)
    const perLine = width === '80' ? 3 : 2
    const colW = Math.floor(w / perLine)
    for (let i = 0; i < receipt.bags.length; i += perLine) {
      const cells: string[] = []
      for (let j = 0; j < perLine; j++) {
        const b = receipt.bags[i + j]
        cells.push(b ? `#${b.seq} ${formatNumber(b.weight_lb)}lb` : '')
      }
      lines.push(cells.map((c) => padEnd(c, colW)).join(''))
    }
    lines.push(light)
  }

  lines.push(`Total Pound: ${formatNumber(receipt.total_pounds)}`)
  lines.push(`Total Tin:   ${formatTins(receipt.total_tins)}`)
  lines.push('')
  lines.push(`Total Amount: ${formatMMK(receipt.total_amount)}`)
  if (receipt.remark) {
    lines.push('')
    lines.push(`Remark: ${receipt.remark}`)
  }

  lines.push(heavy)
  lines.push(center('Thank you', w))
  lines.push(heavy)

  return lines.join(String.fromCharCode(10))
}
