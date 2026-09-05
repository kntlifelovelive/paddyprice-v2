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
import { buildHomeSummaryNode, buildVoucherNode, buildBagWeightNode } from '@/services/pdf/templates'
import { buildVoucherInput, buildBagWeightInput } from '@/services/pdf/service'
import type { HomeSummaryPdfInput } from '@/types/pdf'
import { createGallery, type GalleryPort } from '@/infrastructure/platform/gallery'
import type { SavedFile } from '@/types/storage'
import { getDatabase } from '@/infrastructure/db/connection'
import * as loadSettings from '@/services/settings'
import * as purchasesDao from '@/infrastructure/db/dao/purchases'

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
 * Sanitize a string for use as an Android Gallery filename component.
 * Replaces path separators, colons, and other filesystem-unsafe characters
 * with dashes; collapses runs of whitespace into dashes.
 */
function sanitizeFileName(s: string): string {
  return s
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Render a customer's bag-weight voucher to PNG (using the SAME node the PDF
 * bag-weight export renders) and save each page to the device gallery.
 * The PNG is visually equivalent to the PDF because both share `buildBagWeightInput`
 * + `buildBagWeightNode`.
 *
 * Filename: `PSO{farmerId}-001-{customer_name}.png`
 */
export async function generateBagWeightDetailsPng(
  farmerId: number,
  farmerName: string,
  gallery: GalleryPort = createGallery(),
): Promise<PngExportResult> {
  const input = await buildBagWeightInput(farmerId, null, '', '', 0)
  const node = buildBagWeightNode(input)
  const pages = await htmlToPng(node)

  const baseName = sanitizeFileName(`PSO${farmerId}-001-${farmerName}`)
  const files: SavedFile[] = []
  const totalPages = pages.length || 1
  for (let i = 0; i < pages.length; i += 1) {
    const fileName = totalPages > 1
      ? `${baseName}_page${i + 1}.png`
      : `${baseName}.png`
    const saved = await gallery.savePng(fileName, pages[i])
    files.push(saved)
  }
  return { files, pageCount: pages.length }
}

/**
 * Extract the sequence number from a purchase number.
 * Purchase number format: PSO-YYYYMM-NNNN (e.g., "PSO-202609-0001")
 * Returns the sequence part (e.g., "0001")
 */
function extractSequenceFromPurchaseNo(purchaseNo: string): string {
  const parts = purchaseNo.split('-')
  return parts[parts.length - 1] || '0001'
}

/**
 * Render a customer's purchase voucher to PNG (using the SAME node the PDF
 * voucher renders) and save each page to the device gallery. The PNG is
 * pixel-identical to the PDF voucher because both share the template node.
 *
 * Filename: `PSO{farmer_id}-{date}-{sequence}-{customer_name}.png`
 */
export async function generateVoucherPng(
  purchaseId: number,
  gallery: GalleryPort = createGallery(),
): Promise<PngExportResult> {
  const input = await buildVoucherInput(purchaseId)
  if (!input) throw new Error('Purchase not found')

  const node = buildVoucherNode(input)
  const pages = await htmlToPng(node)

  // Get farmer_id from the purchase record for the filename
  const db = getDatabase()
  const record = purchasesDao.getPurchase(db, purchaseId)
  const farmerId = record ? record.snapshot.farmer_id : 0

  // Extract sequence number from purchase number (e.g., "PSO-202609-0001" -> "0001")
  const sequence = extractSequenceFromPurchaseNo(input.purchase_no)

  const baseName = sanitizeFileName(
    `PSO${farmerId}-${input.date}-${sequence}-${input.farmer.name}`,
  )
  const files: SavedFile[] = []
  const totalPages = pages.length || 1
  for (let i = 0; i < pages.length; i += 1) {
    const fileName = totalPages > 1
      ? `${baseName}_page${i + 1}.png`
      : `${baseName}.png`
    const saved = await gallery.savePng(fileName, pages[i])
    files.push(saved)
  }
  return { files, pageCount: pages.length }
}
