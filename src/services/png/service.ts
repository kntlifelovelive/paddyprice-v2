/**
 * PNG export service — renders the SAME HTML templates the PDF service uses,
 * encodes each A4 page as a PNG image, and saves the PNGs to the device
 * gallery.
 *
 * Visual parity guarantee: PNG and PDF both rasterize the template node through
 * `services/pdf/render.ts` `rasterizeNodeToCanvas` (identical html2canvas call,
 * identical scale, identical styles). The only difference is the final encoding
 * (PDF bytes vs PNG bytes) and the storage target (Documents vs Gallery).
 *
 * No business calculation is duplicated here — every value comes from the
 * already-built template node that the PDF path consumes.
 */
import { htmlToPng } from '@/services/pdf/render'
import { buildHomeSummaryNode, buildVoucherNode } from '@/services/pdf/templates'
import { buildVoucherInput } from '@/services/pdf/service'
import type { HomeSummaryPdfInput } from '@/types/pdf'
import { createGallery, type GalleryPort } from '@/infrastructure/platform/gallery'
import type { SavedFile } from '@/types/storage'
import { getDatabase } from '@/infrastructure/db/connection'
import * as loadSettings from '@/services/settings'

/** Result of exporting one report to PNG: the saved gallery files. */
export interface PngExportResult {
  readonly files: SavedFile[]
  readonly pageCount: number
}

/** Format a single PNG filename for a (possibly multi-page) export. */
function pngFileName(fileTag: string, page: number, totalPages: number): string {
  return totalPages > 1
    ? `paddyprice_report_${fileTag}_page${page}.png`
    : `paddyprice_report_${fileTag}.png`
}

/**
 * Render a Home period-summary report (Daily/Monthly/Yearly) to PNG and save
 * each page to the device gallery. Uses the exact same template + data the PDF
 * export uses, so the PNG is visually equivalent to the PDF.
 */
export async function exportHomeSummaryPng(
  input: Omit<HomeSummaryPdfInput, 'company' | 'generated_at'>,
  gallery: GalleryPort = createGallery(),
): Promise<PngExportResult> {
  const db = getDatabase()
  const s = loadSettings.settingsService.load(db)
  const full: HomeSummaryPdfInput = {
    company: {
      name: s.company_name,
      address: s.company_address,
      phone: s.company_phone,
      footer_text: s.company_footer_text,
    },
    ...input,
    generated_at: new Date().toISOString(),
  }
  const node = buildHomeSummaryNode(full)
  const pages = await htmlToPng(node)

  const files: SavedFile[] = []
  const totalPages = pages.length || 1
  for (let i = 0; i < pages.length; i += 1) {
    const saved = await gallery.savePng(pngFileName(input.file_tag, i + 1, totalPages), pages[i])
    files.push(saved)
  }
  return { files, pageCount: pages.length }
}
/**
 * Render a customer's purchase voucher to PNG (using the SAME node the PDF
 * voucher renders) and save each page to the device gallery. The PNG is
 * pixel-identical to the PDF voucher because both share the template node.
 */
export async function generateVoucherPng(
  purchaseId: number,
  gallery: GalleryPort = createGallery(),
): Promise<PngExportResult> {
  const input = await buildVoucherInput(purchaseId)
  if (!input) throw new Error('Purchase not found')

  const node = buildVoucherNode(input)
  const pages = await htmlToPng(node)

  const files: SavedFile[] = []
  const totalPages = pages.length || 1
  for (let i = 0; i < pages.length; i += 1) {
    const saved = await gallery.savePng(pngFileName(input.purchase_no, i + 1, totalPages), pages[i])
    files.push(saved)
  }
  return { files, pageCount: pages.length }
}
