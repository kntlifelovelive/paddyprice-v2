/**
 * Android Bluetooth thermal printer adapter.
 *
 * Port of the reference project's
 * `~/paddyprice/src/services/printer/AndroidBluetoothPrinter.ts`.
 *
 * All Bluetooth work (permissions, discovery, connection, writing) happens in
 * the native Capacitor plugin `BluetoothPrinter` (Java). This adapter is only
 * a thin bridge: it never touches sockets or ESC/POS transport itself — it
 * delegates byte generation to the ESC/POS formatter and hands the bytes over.
 *
 * Platform boundary: `infrastructure/platform/printers/`.
 *
 * NOTE: This adapter requires the custom native Capacitor plugin
 * `BluetoothPrinter` (Java) that the reference project ships. P2 does not
 * include that native plugin yet — until it is added, this adapter reports
 * `unavailable` on all platforms. This is intentional: the adapter code is
 * ready, it just needs the native transport to actually print.
 */
import { registerPlugin } from '@capacitor/core'

import { buildEscPos, buildEscPosText } from '@/services/print/escPos'
import type {
  PaperWidth,
  PrintOptions,
  PrinterAdapter,
  PrinterCapabilities,
  PrinterDevice,
  PrinterStatus,
} from '@/types/print'
import { PrinterError } from './types'

/** Native plugin interface (implemented in Java: BluetoothPrinterPlugin.java). */
export interface BluetoothPrinterPluginInterface {
  requestPermissions(): Promise<{ granted: boolean }>
  listPairedDevices(): Promise<{ devices: PrinterDevice[] }>
  connect(options: { address: string }): Promise<void>
  disconnect(): Promise<void>
  isConnected(): Promise<{ connected: boolean }>
  write(options: { dataBase64: string }): Promise<void>
}

const BluetoothPrinterPlugin = registerPlugin<BluetoothPrinterPluginInterface>('BluetoothPrinter', {
  web: {},
})

const BT_CAPABILITIES: PrinterCapabilities = {
  text: true,
  bold: true,
  alignment: true,
  lineSeparator: true,
  table: true,
  image: false,
  paperCut: true,
}

function mapNativeError(err: unknown): PrinterError {
  const message = err instanceof Error ? err.message : String(err)
  if (/unavailable/i.test(message)) return new PrinterError('unsupported', message)
  if (/permission/i.test(message)) return new PrinterError('permission-denied', message)
  if (/bluetooth.*(off|disabled)/i.test(message)) return new PrinterError('bluetooth-disabled', message)
  if (/not found|socket/i.test(message)) return new PrinterError('device-not-found', message)
  if (/timeout/i.test(message)) return new PrinterError('connection-failed', message)
  if (/write/i.test(message)) return new PrinterError('write-failed', message)
  return new PrinterError('unknown', message)
}

export class AndroidBluetoothPrinter implements PrinterAdapter {
  readonly type = 'bluetooth' as const
  readonly capabilities = BT_CAPABILITIES
  readonly limitation =
    'Text-mode ESC/POS: Myanmar renders correctly ONLY on printers with Myanmar font support. ' +
    'Printers without Myanmar glyphs need raster printing (not yet implemented). Use Test Print to verify.'

  private status: PrinterStatus = 'disconnected'
  private connectedAddress: string | null = null

  getStatus(): PrinterStatus {
    return this.status
  }

  async requestPermissions(): Promise<boolean> {
    try {
      const { granted } = await BluetoothPrinterPlugin.requestPermissions()
      return granted
    } catch (err) {
      throw mapNativeError(err)
    }
  }

  async listDevices(): Promise<PrinterDevice[]> {
    try {
      const { devices } = await BluetoothPrinterPlugin.listPairedDevices()
      return devices
    } catch (err) {
      throw mapNativeError(err)
    }
  }

  async connect(device?: PrinterDevice): Promise<void> {
    if (!device?.address) throw new PrinterError('device-not-found', 'No printer device selected.')
    this.status = 'connecting'
    try {
      await BluetoothPrinterPlugin.connect({ address: device.address })
      this.connectedAddress = device.address
      this.status = 'connected'
    } catch (err) {
      this.status = 'error'
      this.connectedAddress = null
      throw mapNativeError(err)
    }
  }

  async disconnect(): Promise<void> {
    try {
      await BluetoothPrinterPlugin.disconnect()
    } finally {
      this.connectedAddress = null
      this.status = 'disconnected'
    }
  }

  async isConnected(): Promise<boolean> {
    try {
      const { connected } = await BluetoothPrinterPlugin.isConnected()
      if (!connected && this.status === 'connected') this.status = 'disconnected'
      return connected
    } catch {
      return false
    }
  }

  /** Write pre-encoded ESC/POS bytes directly (used by Test Print). */
  async printRaw(bytes: Uint8Array): Promise<void> {
    const ok = await this.isConnected()
    if (!ok || !this.connectedAddress) {
      throw new PrinterError('not-connected', 'Bluetooth printer is not connected.')
    }
    this.status = 'printing'
    try {
      let binary = ''
      for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j])
      await BluetoothPrinterPlugin.write({ dataBase64: btoa(binary) })
      this.status = 'connected'
    } catch (err) {
      this.status = 'error'
      throw err instanceof PrinterError ? err : mapNativeError(err)
    }
  }

  async print(receipt: Parameters<PrinterAdapter['print']>[0], options: PrintOptions): Promise<void> {
    const ok = await this.isConnected()
    if (!ok || !this.connectedAddress) {
      throw new PrinterError('not-connected', 'Bluetooth printer is not connected.')
    }
    this.status = 'printing'
    try {
      const copies = Math.max(1, Math.min(5, options.copies))
      for (let i = 0; i < copies; i++) {
        const { bytes } = buildEscPos(receipt, options.paperWidth)
        let binary = ''
        for (let j = 0; j < bytes.length; j++) binary += String.fromCharCode(bytes[j])
        const dataBase64 = btoa(binary)
        await BluetoothPrinterPlugin.write({ dataBase64 })
      }
      this.status = 'connected'
    } catch (err) {
      this.status = 'error'
      throw err instanceof PrinterError ? err : mapNativeError(err)
    }
  }

  /** Test Print entry point — builds ESC/POS bytes from plain text and writes them. */
  async printText(text: string, paperWidth: PaperWidth): Promise<void> {
    const bytes = buildEscPosText(text, paperWidth)
    await this.printRaw(bytes)
  }
}
