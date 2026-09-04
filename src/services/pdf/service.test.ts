/**
 * Home period-summary PDF service test — verifies the reference filename
 * (`paddyprice_report_{fileTag}.pdf` under the summary dir) and that the
 * default storage is used when none is supplied. No rasterization happens
 * in jsdom (htmlToPdf returns empty bytes), so the template output is asserted
 * separately in templates.test.ts.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Database } from 'sql.js'

// htmlToPdf is browser-only (real rasterization); stub it so the service
// logic (data assembly + filename/path building) is what the test verifies.
// importOriginal keeps the render module's type exports intact.
vi.mock('@/services/pdf/render', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>
  return {
    ...actual,
    htmlToPdf: async () => new Uint8Array(),
  }
})

import { createTestDatabase, closeTestDatabase } from '@/infrastructure/db/test-support'
import { settingsService } from '@/services/settings'
import type { SavedFile, StoragePort } from '@/types/storage'
import { generateHomeSummaryPdf } from './service'

function captureStorage(): { storage: StoragePort; paths: string[] } {
  const paths: string[] = []
  const storage: StoragePort = {
    async saveBinaryFile(relativePath: string): Promise<SavedFile> {
      paths.push(relativePath)
      return { path: relativePath }
    },
    async saveTextFile(relativePath: string): Promise<SavedFile> {
      paths.push(relativePath)
      return { path: relativePath }
    },
    async pickAndReadFile(): Promise<Uint8Array> {
      throw new Error('not used')
    },
  }
  return { storage, paths }
}

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

describe('generateHomeSummaryPdf', () => {
  let db: Database

  beforeAll(async () => {
    db = await createTestDatabase()
  })

  afterAll(() => closeTestDatabase())

  it('uses the reference filename under the summary directory', async () => {
    settingsService.load(db)
    const { storage, paths } = captureStorage()
    await generateHomeSummaryPdf(INPUT, storage)
    expect(paths).toHaveLength(1)
    expect(paths[0]).toBe('PSO/pdf/summary/paddyprice_report_daily_2026-09-01.pdf')
  })

  it('embeds the caller-supplied rows and totals verbatim (no recalculation)', async () => {
    const { storage } = captureStorage()
    const artifact = await generateHomeSummaryPdf(INPUT, storage)
    expect(artifact.relativePath).toContain('paddyprice_report_daily_2026-09-01.pdf')
    expect(artifact.pageCount).toBeGreaterThanOrEqual(1)
  })
})