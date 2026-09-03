/**
 * Mock printer adapter — development/testing adapter.
 *
 * Port of the reference project's
 * `~/paddyprice/src/services/printer/MockPrinterAdapter.ts`. Simulates a
 * thermal printer without any hardware: the formatted receipt text is logged
 * to the console so developers can verify the exact data that would be sent
 * to a real printer.
 *
 * Platform boundary: `infrastructure/platform/printers/`.
 */
import { formatReceiptText } from '@/services/print/receiptText'
import type { PrintOptions, PrinterAdapter, PrinterCapabilities, PrinterStatus } from '@/types/print'
import { PrinterError } from './types'

const MOCK_CAPABILITIES: PrinterCapabilities = {
  text: true,
  bold: false,
  alignment: true,
  lineSeparator: true,
  table: true,
  image: false,
  paperCut: false,
}

export class MockPrinterAdapter implements PrinterAdapter {
  readonly type = 'mock' as const
  readonly capabilities = MOCK_CAPABILITIES
  readonly limitation = 'Mock printer — output goes to the browser console only. No physical printing.'

  private status: PrinterStatus = 'disconnected'
  /** Last printed text — exposed for unit tests. */
  lastOutput = ''

  getStatus(): PrinterStatus {
    return this.status
  }

  async connect(): Promise<void> {
    this.status = 'connected'
  }

  async disconnect(): Promise<void> {
    this.status = 'disconnected'
  }

  async print(receipt: Parameters<PrinterAdapter['print']>[0], options: PrintOptions): Promise<void> {
    if (this.status !== 'connected') {
      throw new PrinterError('not-connected', 'Mock printer is not connected.')
    }
    if (this.failNextPrint) {
      this.failNextPrint = false
      throw new PrinterError('write-failed', 'Simulated mock printer failure.')
    }
    this.status = 'printing'
    try {
      const nl = String.fromCharCode(10)
      const text = [
        '------------------------------',
        'MOCK PRINTER',
        '------------------------------',
        formatReceiptText(receipt, options.paperWidth),
        'Printing completed.',
      ].join(nl)
      this.lastOutput = text
      // eslint-disable-next-line no-console
      console.log(nl + text + nl)
    } finally {
      this.status = 'connected'
    }
  }

  /** Test helper — simulate a write failure to exercise error handling. */
  failNextPrint = false
}
