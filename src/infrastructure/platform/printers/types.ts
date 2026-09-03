/**
 * Printer error types + messages for the platform printer adapters.
 *
 * Port of the reference project's `~/paddyprice/src/services/printer/printerTypes.ts`
 * `PrinterError` class and error mapping. Pure types/errors only — no transport,
 * no UI.
 *
 * These are re-consumed by `services/print/printerService.ts` for friendly UI
 * messages. The full printer port model (`PrinterType`, `PrinterStatus`,
 * `PrinterCapabilities`, `PrinterDevice`, `PrinterAdapter`, `PrintOptions`,
 * `PrinterErrorCode`, `PrintReceipt`, `PrintReceiptRow`, `PrintReceiptBag`,
 * `PaperWidth`) lives in `src/types/print.ts` and is re-used here.
 */
import type { PrinterErrorCode } from '@/types/print'

/** Typed printer error — every adapter failure wraps in this. */
export class PrinterError extends Error {
  readonly code: PrinterErrorCode

  constructor(code: PrinterErrorCode, message?: string) {
    super(message ?? code)
    this.name = 'PrinterError'
    this.code = code
  }
}

/** Friendly messages per error code (English; UI may localize). */
export const PRINTER_ERROR_MESSAGES: Record<PrinterErrorCode, string> = {
  'not-connected': 'Printer is not connected.',
  'bluetooth-disabled': 'Bluetooth is turned off. Please enable it and try again.',
  'permission-denied': 'Bluetooth permission is required. Please grant it in Settings.',
  'device-not-found': 'Could not find the printer. Is it paired and powered on?',
  'connection-failed': 'Could not connect to the printer.',
  'write-failed': 'Printing failed. Please check the printer and try again.',
  unsupported: 'This printer type is not available on this device.',
  unknown: 'An unexpected printer error occurred.',
}

/** Map any thrown error to a friendly user-facing message. */
export function friendlyPrinterMessage(err: unknown): string {
  if (err instanceof PrinterError) return PRINTER_ERROR_MESSAGES[err.code]
  return PRINTER_ERROR_MESSAGES.unknown
}
