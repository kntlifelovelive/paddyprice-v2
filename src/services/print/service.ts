/**
 * Thermal print service — renders a receipt to HTML and triggers the browser
 * print dialog. The receipt content mirrors the PrintReceipt model defined in
 * src/types/print.ts (built from saved SQLite purchase records only).
 *
 * No hardware-specific integration in this phase — the browser's native print
 * dialog is the print target on all platforms. Hardware thermal printer
 * support (Capacitor Bluetooth adapter) is a future step.
 */
import type { PrintReceipt } from '@/types/print'
import { formatMMK } from '@/shared/format'

const RECEIPT_WIDTH = '58mm'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildReceiptHtml(receipt: PrintReceipt): string {
  const lines: string[] = []
  const W = RECEIPT_WIDTH

  function row(label: string, value: string): string {
    return `<div style="display:flex;justify-content:space-between;font-size:12px;line-height:1.5;margin:2px 0"><span style="text-align:left;flex:1">${escapeHtml(label)}</span><span style="text-align:right;flex:1">${escapeHtml(value)}</span></div>`
  }

  function header(text: string, align = 'center'): string {
    return `<div style="text-align:${align};font-size:13px;font-weight:bold;margin:4px 0 2px">${escapeHtml(text)}</div>`
  }

  function divider(): string {
    return `<div style="border-top:1px dashed #999;margin:4px 0"></div>`
  }

  lines.push('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Receipt</title><style>@media print { @page { margin: 4mm; size: 58mm auto; } body { width: ' + W + '; margin: 0 auto; font-family: "Noto Sans Myanmar","Myanmar Text",monospace; color: #000; background: #fff; } } body { width: ' + W + '; margin: 0 auto; padding: 4px; font-family: "Noto Sans Myanmar","Myanmar Text",monospace; font-size: 12px; line-height: 1.4; color: #000; background: #fff; }</style></head><body>')

  lines.push(header(receipt.company_name || 'Paddy Price'))
  if (receipt.company_address) lines.push(header(receipt.company_address))
  if (receipt.company_phone) lines.push(header(receipt.company_phone))
  lines.push(divider())
  lines.push(row('Invoice No:', receipt.invoice_no))
  lines.push(row('Date:', receipt.date))
  lines.push(row('Time:', receipt.time))
  lines.push(divider())
  lines.push(header('Customer'))
  lines.push(row('Name:', receipt.farmer_name))
  if (receipt.farmer_address) lines.push(row('Address:', receipt.farmer_address))
  if (receipt.farmer_phone) lines.push(row('Phone:', receipt.farmer_phone))
  lines.push(divider())
  lines.push(header('Items'))

  for (const r of receipt.rows) {
    lines.push('<div style="font-size:12px;margin:2px 0">' + escapeHtml(r.rice_type_name) + '</div>')
    lines.push(row('Lbs:', r.pounds.toFixed(0) + ' lb'))
    lines.push(row('Tin:', r.tins.toFixed(3)))
    lines.push(row('Price:', formatMMK(r.price_100_tin)))
    lines.push(row('Amount:', formatMMK(r.amount)))
  }

  lines.push(divider())
  lines.push(header('Summary'))
  lines.push(row('Total Pound:', receipt.total_pounds.toFixed(0) + ' lb'))
  lines.push(row('Total Tin:', receipt.total_tins.toFixed(3)))
  lines.push(row('Total Amount:', formatMMK(receipt.total_amount)))
  lines.push(divider())

  if (receipt.remark) {
    lines.push(header('Remark'))
    lines.push('<div style="font-size:11px;margin:2px 0">' + escapeHtml(receipt.remark) + '</div>')
  }

  lines.push('<div style="text-align:center;font-size:10px;margin-top:6px">' + escapeHtml(receipt.generated_at) + '</div>')
  lines.push('</body></html>')
  return lines.join('\n')
}

/**
 * Print a purchase receipt using the browser's native print dialog.
 * Returns true if the print window was opened.
 */
export function printReceipt(receipt: PrintReceipt): boolean {
  if (typeof window === 'undefined') return false
  const html = buildReceiptHtml(receipt)
  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}
