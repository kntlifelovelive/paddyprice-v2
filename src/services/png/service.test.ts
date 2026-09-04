/**
 * Home period-summary PNG export test — verifies the PNG service reuses the
 * SAME template/data the PDF service uses and routes bytes to the gallery
 * adapter. Rasterization itself is browser-only (jsdom returns [] from
 * htmlToPng), so this test asserts the orchestration + parity contract.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { createTestDatabase, closeTestDatabase } from '@/infrastructure/db/test-support'
import { createFarmer } from '@/infrastructure/db/dao/farmers'
import { createRiceType } from '@/infrastructure/db/dao/riceTypes'
import { createRicePrice } from '@/infrastructure/db/dao/ricePrices'
import { settingsService } from '@/services/settings'
import { createPurchase as createPurchaseSession } from '@/services/purchase/service'
import type { SavedFile } from '@/types/storage'
import type { GalleryPort } from '@/infrastructure/platform/gallery'
import { exportHomeSummaryPng, generateVoucherPng } from './service'

// html2canvas/jsdom incompat: stub the browser-only PNG renderer so the test
// asserts the service orchestration (filename, page naming, gallery routing).
// importOriginal preserves the render module's template constants (A4_WIDTH_MM).
vi.mock('@/services/pdf/render', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    htmlToPng: async () => [new Uint8Array([137, 80, 78, 71]), new Uint8Array([1, 2, 3])],
  }
})

const INPUT = {
  title: 'DAILY REPORT',
  period_label: 'Period: 01/09/2026',
  file_tag: 'daily_2026-09-01',
  rows: [
    {
      rice_type_name: 'Shwe War Tun',
      total_bags: 3,
      total_pound: 373,
      total_tin: 7,
      total_extra_lb: 23,
      price_100_tin: 1850000,
      total_amount: 148000,
    },
  ],
  totals: { bags: 3, pound: 373, tin: 7, extra_lb: 23, amount: 148000 },
}

function captureGallery(): { gallery: GalleryPort; saved: Array<{ name: string; bytes: Uint8Array }> } {
  const saved: Array<{ name: string; bytes: Uint8Array }> = []
  const gallery: GalleryPort = {
    async savePng(fileName: string, pngBytes: Uint8Array): Promise<SavedFile> {
      saved.push({ name: fileName, bytes: pngBytes })
      return { path: fileName }
    },
  }
  return { gallery, saved }
}

describe('exportHomeSummaryPng', () => {
  beforeAll(async () => {
    await createTestDatabase()
  })

  afterAll(() => closeTestDatabase())

  it('routes PNG bytes to the gallery with the reference filename', async () => {
    const { gallery, saved } = captureGallery()
    const result = await exportHomeSummaryPng(INPUT, gallery)
    // 2 pages from the stub → 2 files saved.
    expect(result.pageCount).toBe(2)
    expect(saved).toHaveLength(2)
    expect(saved[0].name).toBe('paddyprice_report_daily_2026-09-01_page1.png')
    expect(saved[1].name).toBe('paddyprice_report_daily_2026-09-01_page2.png')
  })

    it('passes real PNG bytes through to the gallery adapter', async () => {
    const { gallery, saved } = captureGallery()
    await exportHomeSummaryPng(INPUT, gallery)
    // First 4 bytes of a real PNG are 0x89 0x50 0x4E 0x47 (the stub value).
    expect(Array.from(saved[0].bytes.slice(0, 4))).toEqual([137, 80, 78, 71])
  })
})

/** Seed a purchase (farmer + rice type + price + zero-bag session) and return its id/purchase_no. */
async function seedPurchase(date = '2026-09-01'): Promise<{ id: number; purchase_no: string }> {
  const db = await createTestDatabase()
  settingsService.load(db)
  const farmer = createFarmer(db, {
    name: 'Ko Aung',
    address: '123 Paddy St, Yangon',
    phone: '09-555111',
  })
  const type = createRiceType(db, { name: 'Emata' })
  createRicePrice(db, { date, rice_type_id: type.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })
  const { snapshot } = createPurchaseSession(db, {
    farmer_id: farmer.id,
    date,
    rice_type_id: type.id,
    moisture_label: null,
  })
  return { id: snapshot.id, purchase_no: snapshot.purchase_no }
}

describe('generateVoucherPng', () => {
  afterAll(() => closeTestDatabase())

  it('saves one PNG per page using the purchase_no as filename tag', async () => {
    const { id, purchase_no } = await seedPurchase()
    const { gallery, saved } = captureGallery()
    const result = await generateVoucherPng(id, gallery)
    expect(result.pageCount).toBe(2)          // stub returns 2 pages
    expect(saved).toHaveLength(2)
    expect(saved[0].name).toBe(`paddyprice_report_${purchase_no}_page1.png`)
    expect(saved[1].name).toBe(`paddyprice_report_${purchase_no}_page2.png`)
  })

  it('throws when the purchase does not exist', async () => {
    await createTestDatabase()
    const { gallery } = captureGallery()
    await expect(generateVoucherPng(999_999, gallery)).rejects.toThrow('Purchase not found')
  })
})
