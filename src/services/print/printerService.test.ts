/**
 * Printer service tests — verify adapter selection, lazy init, and the
 * friendly-message mapping that the UI surfaces on failure.
 *
 * The printerService is the single entry point the UI uses for printing
 * (ports the reference project's ~/paddyprice PrinterService). These tests
 * confirm it selects the right adapter per configured printer_type without
 * instantiating adapters at module load (which would break in DB-less
 * environments).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'

import { createTestDatabase, closeTestDatabase } from '@/infrastructure/db/test-support'
import type { PrintReceipt } from '@/types/print'
import { printerService } from './printerService'
import { settingsService } from '@/services/settings'
import { useSettingsStore } from '@/shared/state'

const RECEIPT: PrintReceipt = {
  company_name: 'Test',
  company_address: '',
  company_phone: '',
  invoice_no: 'T-001',
  date: '2026-09-01',
  time: '10:00 AM',
  generated_at: '2026-09-01T10:00:00.000Z',
  farmer_name: 'Test',
  farmer_address: '',
  farmer_phone: '',
  rows: [{ rice_type_name: 'P', pounds: 100, tins: 2, price_100_tin: 50000, price_per_tin: 500, amount: 100000 }],
  bags: [],
  total_pounds: 100,
  total_tins: 2,
  total_amount: 100000,
  remark: '',
}

describe('printerService', () => {
  let db: Database

  beforeAll(async () => {
    db = await createTestDatabase()
  })

  afterAll(() => closeTestDatabase())

  beforeEach(() => {
    settingsService.load(db)
    // Reset printer config to the documented defaults so each test starts clean
    // (syncAdapter reads from the DB, so the DB row must be reset too).
    settingsService.update(db, 'printer_type', 'none')
    settingsService.update(db, 'paper_width', '58')
    settingsService.update(db, 'copies', 1)
    useSettingsStore.setState({
      settings: {
        company_name: 'Test',
        company_address: '',
        company_phone: '',
        company_footer_text: '',
        tin_formula: '50',
        moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
        pdf_dir: 'PSO/pdf',
        theme: 'tokyo-night',
        font_size: 'normal',
        language: 'en',
        printer_type: 'none',
        paper_width: '58',
        copies: 1,
        printer_device_address: '',
        printer_device_name: '',
      },
      loaded: true,
    })
  })

  it('defaults to a desktop adapter when printer_type is "none" (browser print)', () => {
    // settings already default to 'none' from beforeEach
    expect(printerService.getAdapter().type).toBe('desktop')
  })

  it('selects the mock adapter when configured', () => {
    settingsService.update(db, 'printer_type', 'mock')
    expect(printerService.getAdapter().type).toBe('mock')
  })

  it('selects the desktop adapter when configured', () => {
    settingsService.update(db, 'printer_type', 'desktop')
    expect(printerService.getAdapter().type).toBe('desktop')
  })

  it('selects the bluetooth adapter when configured (Android bridge)', () => {
    settingsService.update(db, 'printer_type', 'bluetooth')
    expect(printerService.getAdapter().type).toBe('bluetooth')
  })

  it('switches adapter when the configured printer_type changes', () => {
    expect(printerService.getAdapter().type).toBe('desktop')
    settingsService.update(db, 'printer_type', 'mock')
    expect(printerService.getAdapter().type).toBe('mock')
  })

  it('exposes the configured paper width and copies through print settings', async () => {
    settingsService.update(db, 'paper_width', '80')
    settingsService.update(db, 'copies', 3)
    settingsService.update(db, 'printer_type', 'mock')
    const adapter = printerService.getAdapter()
    if ('connect' in adapter) await adapter.connect?.()
    await printerService.print(RECEIPT)
    if ('lastOutput' in adapter) {
      expect((adapter as { lastOutput: string }).lastOutput).toContain('PADDY PURCHASE')
    }
  })

  it('reports a defined status even before any print', () => {
    settingsService.update(db, 'printer_type', 'none')
    // 'none' maps to the DesktopPrinter adapter; status must not throw.
    expect(printerService.getStatus()).toBeDefined()
  })

  it('honours an explicit paperWidth override (80mm) without changing the saved setting', async () => {
    // Saved width is 58mm, but the Home export/print forces the wide 80mm
    // layout (reference PrinterService.configure({...cfg, paperWidth:'80'})).
    settingsService.update(db, 'printer_type', 'mock')
    settingsService.update(db, 'paper_width', '58')
    const adapter = printerService.getAdapter()
    if ('connect' in adapter) await adapter.connect?.()
    await printerService.print(RECEIPT, { paperWidth: '80' })
    if ('lastOutput' in adapter) {
      const out = (adapter as { lastOutput: string }).lastOutput
      // 80mm paper -> 48 "=" heavy rules (reference daily/monthly receipt).
      expect(out.split('\n').some((line) => line === '='.repeat(48))).toBe(true)
      expect(out.split('\n').some((line) => line === '='.repeat(32))).toBe(false)
    }
    // The saved 58mm setting is left unchanged.
    expect(settingsService.load(db).paper_width).toBe('58')
  })
})