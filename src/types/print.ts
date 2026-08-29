/**
 * Printer port — src/types foundation (Step 3).
 *
 * Type-only contract for thermal/receipt printing. The React UI only talks to
 * the printer service (later, in `services/printing`); the services talk to
 * this port; adapters in `infrastructure/platform/printers` implement it.
 */

/** §11 — thermal paper width: 58mm ≈ 32 chars, 80mm ≈ 48 chars per line. */
export type PaperWidth = '58' | '80'

/** Which printer adapter is active. */
export type PrinterType = 'none' | 'mock' | 'bluetooth' | 'desktop'

/** Connection / activity status of the selected printer. */
export type PrinterStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'printing'
  | 'error'
  | 'unavailable'

/** What a given adapter can do — never assume every printer supports everything. */
export interface PrinterCapabilities {
  text: boolean
  bold: boolean
  alignment: boolean
  lineSeparator: boolean
  table: boolean
  image: boolean
  paperCut: boolean
}

/** A discoverable printer device (Bluetooth, USB, …). */
export interface PrinterDevice {
  name: string
  /** Stable identifier — MAC address for Bluetooth devices. */
  address: string
}

/** One purchase row on the receipt — paddy types are NEVER merged. */
export interface PrintReceiptRow {
  rice_type_name: string
  /** Gross pounds (from the purchase snapshot). */
  pounds: number
  /** Unrounded tins (from the snapshot). */
  tins: number
  /** Historical snapshot price (MMK for 100 tins). */
  price_100_tin: number
  /** Historical snapshot price (MMK for 1 tin). */
  price_per_tin: number
  /** MMK. */
  amount: number
}

/** One bag weight line for the receipt (per-bag detail). */
export interface PrintReceiptBag {
  /** Bag number within the purchase (1-based). */
  seq: number
  weight_lb: number
}

/**
 * Receipt data model — pure business data, no formatting, no transport.
 * Built from saved SQLite purchase records only (snapshot values).
 */
export interface PrintReceipt {
  company_name: string
  company_address: string
  company_phone: string
  invoice_no: string
  /** Purchase date, `YYYY-MM-DD`. */
  date: string
  /** Purchase time (local, from the purchase creation timestamp), e.g. "10:30 AM". */
  time: string
  /** ISO timestamp of when the receipt is printed. */
  generated_at: string
  farmer_name: string
  farmer_address: string
  farmer_phone: string
  rows: PrintReceiptRow[]
  bags: PrintReceiptBag[]
  total_pounds: number
  total_tins: number
  total_amount: number
  remark: string
}

/** User-facing error categories — the service maps these to friendly messages. */
export type PrinterErrorCode =
  | 'not-connected'
  | 'bluetooth-disabled'
  | 'permission-denied'
  | 'device-not-found'
  | 'connection-failed'
  | 'write-failed'
  | 'unsupported'
  | 'unknown'

/** Contract every printer adapter must fulfil. */
export interface PrinterAdapter {
  readonly type: PrinterType
  readonly capabilities: PrinterCapabilities
  /** Human-readable note about known limitations (e.g. Myanmar font support). */
  readonly limitation?: string

  getStatus(): PrinterStatus
  connect?(device?: PrinterDevice): Promise<void>
  disconnect?(): Promise<void>
  /** Discover paired/available devices (Bluetooth adapters only). */
  listDevices?(): Promise<PrinterDevice[]>
  print(receipt: PrintReceipt, options: PrintOptions): Promise<void>
}

export interface PrintOptions {
  paperWidth: PaperWidth
  copies: number
}