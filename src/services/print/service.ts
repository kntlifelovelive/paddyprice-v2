/**
 * Thermal print service — formats the receipt with the REFERENCE project's
 * thermal text format (ported in ./receiptText: 58mm ≈ 32 chars / 80mm ≈ 48
 * chars per line) and triggers the browser print dialog with that exact text.
 *
 * The receipt content is the PrintReceipt model defined in src/types/print.ts
 * (built from saved SQLite purchase records only). No hardware-specific
 * integration in this phase — the browser's native print dialog is the print
 * target on all platforms. Hardware Bluetooth thermal transport requires the
 * reference project's custom native Capacitor plugin (see REPORT) and is NOT
 * added here.
 */
import type { PaperWidth, PrintReceipt } from '@/types/print'
import { formatReceiptText } from './receiptText'

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Build the print-window HTML: the reference thermal receipt text, rendered
 * verbatim in a monospace block so spacing/alignment match the ESC/POS output.
 */
function buildReceiptHtml(receipt: PrintReceipt, paperWidth: PaperWidth): string {
  const W = paperWidth === '80' ? '80mm' : '58mm'
  const text = formatReceiptText(receipt, paperWidth)
  return [
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<title>Receipt</title>',
    '<style>@media print { @page { margin: 4mm; size: ' + W + ' auto; } }',
    'body { width: ' + W + '; margin: 0 auto; padding: 4px; box-sizing: border-box;',
    'font-family: "Noto Sans Myanmar", "Myanmar Text", monospace; font-size: 12px;',
    'line-height: 1.35; color: #000; background: #fff; white-space: pre; }</style>',
    '</head><body>',
    escapeHtml(text),
    '</body></html>',
  ].join('')
}

/**
 * Print a purchase receipt using the browser's native print dialog.
 * The output format is the reference thermal format at the given paper width
 * (default 58mm). Returns true if the print window was opened.
 */
export function printReceipt(receipt: PrintReceipt, options?: { paperWidth?: PaperWidth }): boolean {
  if (typeof window === 'undefined') return false
  const paperWidth: PaperWidth = options?.paperWidth ?? '58'
  const html = buildReceiptHtml(receipt, paperWidth)
  const printWindow = window.open('', '_blank', 'width=400,height=600')
  if (!printWindow) return false
  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  printWindow.print()
  return true
}
