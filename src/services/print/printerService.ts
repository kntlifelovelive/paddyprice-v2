/**
 * Printer service — manages the selected printer adapter and dispatches
 * print/testPrint actions.
 *
 * Port of the reference project's
 * `~/paddyprice/src/services/printer/PrinterService.ts`. The adapter is chosen
 * by the user via Settings → Printer (persisted in the settings table) and
 * instantiated lazily. Web-safe adapters (desktop, mock) work immediately;
 * the Bluetooth adapter requires the reference project's native Capacitor
 * plugin and reports "unavailable" until that plugin is added.
 *
 * All receipt data comes from the caller (already built from saved purchase
 * records by History/HistoryFarmer). No business logic or calculation here.
 */
import type {
  PrintOptions,
  PrinterAdapter,
  PrinterDevice,
  PrinterStatus,
  PrintReceipt,
  PrinterType,
} from '@/types/print'
import { DesktopPrinter } from '@/infrastructure/platform/printers/DesktopPrinter'
import { MockPrinterAdapter } from '@/infrastructure/platform/printers/MockPrinterAdapter'
import { AndroidBluetoothPrinter } from '@/infrastructure/platform/printers/AndroidBluetoothPrinter'
import { settingsService } from '@/services/settings'
import { getDatabase } from '@/infrastructure/db'

function createAdapter(type: PrinterType): PrinterAdapter {
  switch (type) {
    case 'bluetooth':
      return new AndroidBluetoothPrinter()
    case 'mock':
      return new MockPrinterAdapter()
    case 'desktop':
      return new DesktopPrinter()
    case 'none':
    default:
      return new DesktopPrinter()
  }
}

export interface PrinterService {
  /** The currently selected adapter (matches settings.printer_type). */
  getAdapter(): PrinterAdapter
  /** Current status of the selected adapter. */
  getStatus(): PrinterStatus
  /** Print the receipt using the selected adapter + settings (paper width, copies). */
  print(receipt: PrintReceipt): Promise<void>
  /** Print a short test receipt using the selected adapter. */
  testPrint(): Promise<void>
  /** Connect the selected adapter (Bluetooth/Mock). No-op for desktop. */
  connect(device?: PrinterDevice): Promise<void>
  /** Disconnect the selected adapter. */
  disconnect(): Promise<void>
  /** List paired devices (Bluetooth only). */
  listDevices(): Promise<PrinterDevice[]>
}

class PrinterServiceImpl implements PrinterService {
  private adapter: PrinterAdapter | null = null

  /** Lazily create / re-create the adapter matching the current settings. */
  private syncAdapter(): void {
    const type = settingsService.load(getDatabase()).printer_type
    if (this.adapter === null || this.adapter.type !== type) {
      this.adapter = createAdapter(type)
    }
  }

  getAdapter(): PrinterAdapter {
    this.syncAdapter()
    return this.adapter!
  }

  getStatus(): PrinterStatus {
    return this.getAdapter().getStatus()
  }

  async print(receipt: PrintReceipt): Promise<void> {
    const db = getDatabase()
    const s = settingsService.load(db)
    const options: PrintOptions = { paperWidth: s.paper_width, copies: s.copies }
    await this.getAdapter().print(receipt, options)
  }

  async testPrint(): Promise<void> {
    const db = getDatabase()
    const s = settingsService.load(db)
    const receipt: PrintReceipt = {
      company_name: s.company_name || 'Test',
      company_address: s.company_address,
      company_phone: s.company_phone,
      invoice_no: 'TEST-001',
      date: new Date().toISOString().slice(0, 10),
      time: new Date().toLocaleTimeString(),
      generated_at: new Date().toISOString(),
      farmer_name: 'Test Farmer',
      farmer_address: '',
      farmer_phone: '',
      rows: [
        {
          rice_type_name: 'Test Paddy',
          pounds: 100,
          tins: 2,
          price_100_tin: 50000,
          price_per_tin: 500,
          amount: 100000,
        },
      ],
      bags: [
        { seq: 1, weight_lb: 50 },
        { seq: 2, weight_lb: 50 },
      ],
      total_pounds: 100,
      total_tins: 2,
      total_amount: 100000,
      remark: 'Test print',
    }
    await this.print(receipt)
  }

  async connect(device?: PrinterDevice): Promise<void> {
    await this.getAdapter().connect?.(device)
  }

  async disconnect(): Promise<void> {
    await this.getAdapter().disconnect?.()
  }

  async listDevices(): Promise<PrinterDevice[]> {
    return this.getAdapter().listDevices?.() ?? []
  }
}

export const printerService: PrinterService = new PrinterServiceImpl()
