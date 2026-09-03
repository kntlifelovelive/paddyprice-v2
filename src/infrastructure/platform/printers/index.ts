/**
 * Platform printer adapters barrel export.
 *
 * Printer adapters live in `infrastructure/platform/printers/` (platform
 * boundary, ARCHITECTURE §5). The UI never imports adapters directly — it
 * talks to `services/print/printerService.ts`, which selects the right adapter
 * for the configured printer type / platform.
 */
export { AndroidBluetoothPrinter } from './AndroidBluetoothPrinter'
export { DesktopPrinter } from './DesktopPrinter'
export { MockPrinterAdapter } from './MockPrinterAdapter'
export { PrinterError, friendlyPrinterMessage } from './types'
export type { BluetoothPrinterPluginInterface } from './AndroidBluetoothPrinter'
