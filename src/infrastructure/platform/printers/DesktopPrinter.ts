/**
 * Desktop printer adapter — prints the receipt through the system print
 * dialog using a hidden iframe (works offline on Linux desktop browsers).
 *
 * Port of the reference project's
 * `~/paddyprice/src/services/printer/DesktopPrinter.ts`. If no system printer
 * is configured the user simply cancels the dialog; purchase data is never
 * affected either way.
 *
 * Platform boundary: `infrastructure/platform/printers/`.
 */
import { formatReceiptText } from '@/services/print/receiptText'
import type { PrintOptions, PrinterAdapter, PrinterCapabilities, PrinterStatus } from '@/types/print'

const DESKTOP_CAPABILITIES: PrinterCapabilities = {
  text: true,
  bold: false,
  alignment: false,
  lineSeparator: true,
  table: true,
  image: false,
  paperCut: false,
}

export class DesktopPrinter implements PrinterAdapter {
  readonly type = 'desktop' as const
  readonly capabilities = DESKTOP_CAPABILITIES
  readonly limitation =
    'Uses the system print dialog. Direct USB/thermal output is not available on desktop yet.'

  private status: PrinterStatus = 'connected' // always "available" via dialog

  getStatus(): PrinterStatus {
    return this.status
  }

  /** Print arbitrary plain text (used by Test Print). */
  async printText(text: string): Promise<void> {
    return this.printRawText(text)
  }

  async print(receipt: Parameters<PrinterAdapter['print']>[0], options: PrintOptions): Promise<void> {
    const text = formatReceiptText(receipt, options.paperWidth)
    return this.printRawText(text)
  }

  private async printRawText(text: string): Promise<void> {
    const iframe = document.createElement('iframe')
    iframe.style.position = 'fixed'
    iframe.style.right = '0'
    iframe.style.bottom = '0'
    iframe.style.width = '0'
    iframe.style.height = '0'
    iframe.style.border = '0'
    document.body.appendChild(iframe)
    try {
      const doc = iframe.contentDocument
      if (!doc) throw new Error('Cannot create print document.')
      doc.open()
      const esc = String.fromCharCode(38) + 'amp;'
      const lt = String.fromCharCode(38) + 'lt;'
      doc.write(
        '<html><head><title>Paddy Receipt</title></head><body><pre style="font-family:monospace;font-size:12px;">' +
          text.replace(/&/g, esc).replace(/</g, lt) +
          '</pre></body></html>',
      )
      doc.close()
      iframe.contentWindow?.focus()
      iframe.contentWindow?.print()
    } finally {
      setTimeout(() => iframe.remove(), 60_000) // leave time for the dialog
    }
  }
}
