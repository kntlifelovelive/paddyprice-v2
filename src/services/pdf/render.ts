/**
 * PDF rendering core (Step 9) - services/pdf/render.ts.
 *
 * Pipeline: HTML render -> browser text rendering -> rasterization -> A4 jsPDF pages.
 * Per REFERENCE_NOTES §4/§8 and PROJECT_SPEC §3.5 the output is intentionally
 * image-based so Myanmar Unicode is preserved through the browser text engine.
 * Text search/selection inside the generated PDF is not required.
 *
 * This file is the SINGLE browser-only code path; everything else in the PDF
 * service is platform-neutral. Tests run under jsdom, so the renderer
 * gracefully no-ops when document/canvas is unavailable.
 */
import { jsPDF } from 'jspdf'

import type { LabeledValue, FooterLine } from '@/types/pdf'

/** A4 size in millimeters. */
export const A4_WIDTH_MM = 210
export const A4_HEIGHT_MM = 297

/** Page margin in millimeters. */
export const PAGE_MARGIN_MM = 10

/**
 * Reference pagination parity (~/paddyprice/src/services/pdf.ts pagesToPdf):
 * each page is the FULL A4 area (210×297mm) drawn at (0,0). The templates
 * carry their own page margins (36px/44px voucher & reports, 32px/44px bag
 * weights, 10mm report skeleton), so the rasterizer adds NO extra margin and
 * scales NOTHING — text renders at exactly the intended physical size at
 * 100% viewing scale.
 */

/**
 * Minimum amount of trailing content (mm) folded back into the previous page
 * instead of emitting an extra page. Must stay ≤ the smallest template bottom
 * padding (32px ≈ 8.5mm in the bag-weights template), so a folded remainder
 * is ALWAYS blank padding — real content is never dropped. Large enough to
 * swallow the rounding remainder of a tight fit, preventing a blank/near-blank
 * trailing page.
 */
const MIN_TRAILING_PAGE_CONTENT_MM = 8

/**
 * Convert canvas pixels to content millimeters for a canvas rendered from an
 * element that is `A4_WIDTH_MM` wide. The px↔mm conversion MUST go through
 * the canvas WIDTH: the canvas height is the content height (variable), so
 * relating it to A4_HEIGHT_MM would stretch/squash any content whose height
 * is not exactly one A4 page (the old text-scale bug).
 */
export function canvasPxToMm(px: number, canvasWidthPx: number): number {
  return (px * A4_WIDTH_MM) / canvasWidthPx
}

export interface PageImage {
  /** A PNG data URL. */
  dataUrl: string
  /** Image height in millimeters (preserves aspect). */
  heightMm: number
}

export interface PageImageSlice {
  /** The image slice as a PNG data URL. */
  dataUrl: string
  /** Image height in mm this slice occupies on the page. */
  heightMm: number
}

/**
 * Plan A4 pages for a given content height (mm) WITHOUT actually slicing
 * the canvas. Exposed for tests; the production pipeline calls
 * `sliceCanvasForA4`, which calls into the same plan.
 *
 * Pagination rule (1 A4 page = 297mm of content; the templates carry their
 * own margins, so the full A4 height is usable):
 *   contentHeightMm <= A4_HEIGHT_MM + MIN_TRAILING_PAGE_CONTENT_MM -> 1 page
 *   contentHeightMm >  A4_HEIGHT_MM + MIN_TRAILING_PAGE_CONTENT_MM
 *       -> ceil(contentHeightMm / A4_HEIGHT_MM) pages
 */
export function planA4Pages(contentHeightMm: number): number {
  if (contentHeightMm <= 0) return 1
  if (contentHeightMm <= A4_HEIGHT_MM + MIN_TRAILING_PAGE_CONTENT_MM) return 1
  return Math.ceil(contentHeightMm / A4_HEIGHT_MM)
}

export interface RenderOptions {
  /** A unique class prefix applied to the root element (test isolation). */
  rootClass?: string
  /** When true, return the rendered HTML element instead of PDF bytes. */
  keepMounted?: boolean
}

/**
 * Render an HTML node to PDF bytes using the documented pipeline.
 * The node is rasterized at 1.4x (reference parity; see below) and sliced
 * into content-driven A4 pages.
 */
export async function htmlToPdf(
  node: HTMLElement,
  options: RenderOptions = {},
): Promise<Uint8Array> {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    // jsdom test environment: caller should mount the node themselves and
    // assert against the rendered HTML. Return an empty PDF.
    return new Uint8Array()
  }

  const rootClass = options.rootClass ?? 'paddy-pdf-root'
  node.classList.add(rootClass)
  // Minimal styles for the rasterization pass. Tailwind classes are NOT
  // applied because rasterized HTML is taken straight from the DOM tree.
  node.style.backgroundColor = '#ffffff'
  node.style.color = '#111827'
  // Do NOT strip the node's own padding: the templates carry the reference
  // page margins (36px/44px voucher & reports, 32px/44px bag weights, 10mm
  // report skeleton) which must survive rasterization.
  node.style.fontFamily = '"Noto Sans Myanmar", "Myanmar Text", system-ui, sans-serif'
  document.body.appendChild(node)

  try {
    // Use html2canvas via dynamic import so the test environment (jsdom) does
    // not need to load it. The dynamic import is also cached after the first
    // call.
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(node, {
      // 1.4x like the reference (~/paddyprice/src/services/pdf.ts
      // renderPageCanvas): a 2x scale on large multi-page reports inflated
      // the Capacitor bridge payload and crashed Android with
      // java.lang.OutOfMemoryError. 1.4x is crisp enough for print.
      scale: 1.4,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    })
    return composePdfFromCanvas(canvas)
  } finally {
    if (!options.keepMounted) node.remove()
  }
}

/**
 * Split a tall canvas into A4-page-sized PNG data URLs.
 *
 * Content-driven pagination: the canvas (rendered from an element
 * A4_WIDTH_MM wide) is cut into full-A4-height (297mm) slices, exactly like
 * the reference pagesToPdf renders one page-sized canvas per page. The
 * templates carry their own margins, so slices are placed at (0,0) at full
 * page width without extra margins or rescaling.
 *
 * A trailing slice representing very little content (below
 * MIN_TRAILING_PAGE_CONTENT_MM — always blank template bottom padding) is
 * folded into the previous page, so we never produce a blank or near-blank
 * trailing page.
 *
 * Exposed for tests and for templates that want to do their own assembly.
 */
export function sliceCanvasForA4(canvas: HTMLCanvasElement): PageImageSlice[] {
  // Pixels that correspond to one full A4 page height. The canvas comes from
  // an element A4_WIDTH_MM wide, so the px↔mm conversion goes through the
  // WIDTH (see canvasPxToMm) — never through canvas.height vs A4_HEIGHT_MM.
  const sliceHeightPx = Math.floor(
    (A4_HEIGHT_MM * canvas.width) / A4_WIDTH_MM,
  )
  if (sliceHeightPx <= 0) return []
  const slices: PageImageSlice[] = []
  let y = 0
  while (y < canvas.height) {
    const h = Math.min(sliceHeightPx, canvas.height - y)
    const slice = document.createElement('canvas')
    slice.width = canvas.width
    slice.height = h
    const ctx = slice.getContext('2d')
    if (!ctx) {
      throw new Error('Could not get 2D context for PDF slice')
    }
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, slice.width, slice.height)
    ctx.drawImage(
      canvas,
      0,
      y,
      canvas.width,
      h,
      0,
      0,
      canvas.width,
      h,
    )
    // Actual mm of content in this slice (width-based px↔mm conversion).
    const sliceContentMm = canvasPxToMm(h, canvas.width)
    // Fold near-blank trailing slices (always blank template padding, since
    // MIN_TRAILING_PAGE_CONTENT_MM ≤ the smallest template bottom padding)
    // into the previous page so we never emit a blank last page.
    if (
      slices.length > 0 &&
      slices[slices.length - 1].heightMm + sliceContentMm <=
        A4_HEIGHT_MM + MIN_TRAILING_PAGE_CONTENT_MM
    ) {
      // Merge into the previous slice (fold the remainder onto the last page).
      slices[slices.length - 1].heightMm += sliceContentMm
    } else {
      slices.push({ dataUrl: slice.toDataURL('image/png'), heightMm: sliceContentMm })
    }
    y += h
  }
  return slices
}

function composePdfFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const slices = sliceCanvasForA4(canvas)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  for (let i = 0; i < slices.length; i += 1) {
    if (i > 0) pdf.addPage()
    const slice = slices[i]
    // Reference pagesToPdf parity: full-width image at (0,0) — the template
    // carries its own margins, so no extra margin and no rescaling (which
    // previously shrank all text to 90.5%). Only the folded blank remainder
    // is clamped to the page height.
    pdf.addImage(
      slice.dataUrl,
      'PNG',
      0,
      0,
      A4_WIDTH_MM,
      Math.min(slice.heightMm, A4_HEIGHT_MM),
    )
  }
  return new Uint8Array(pdf.output('arraybuffer') as ArrayBuffer)
}

/**
 * Convert a list of label/value pairs to a row of <div>s with the documented
 * PDF typography. Used by the templates for header/footer composition.
 */
export function labeledValueRows(
  rows: LabeledValue[],
  options: { bold?: boolean } = {},
): HTMLElement[] {
  return rows.map((row) => {
    const el = document.createElement('div')
    el.style.display = 'flex'
    el.style.justifyContent = 'space-between'
    el.style.gap = '8px'
    el.style.fontSize = '12px'
    el.style.lineHeight = '1.4'

    const label = document.createElement('span')
    label.textContent = row.label
    label.style.color = '#6b7280'

    const value = document.createElement('span')
    value.textContent = row.value
    value.style.color = '#111827'
    if (options.bold) value.style.fontWeight = '600'

    el.appendChild(label)
    el.appendChild(value)
    return el
  })
}

export function footerLines(lines: FooterLine[]): HTMLElement {
  const el = document.createElement('div')
  el.style.borderTop = '1px solid #e5e7eb'
  el.style.paddingTop = '6px'
  el.style.marginTop = '12px'
  el.style.fontSize = '11px'
  el.style.color = '#6b7280'
  for (const line of lines) {
    const div = document.createElement('div')
    div.textContent = line.text
    div.style.textAlign = line.align ?? 'center'
    el.appendChild(div)
  }
  return el
}

/**
 * Build a standard A4-portrait PDF document skeleton. Returns a div that
 * is ready to receive header / body / footer content. The skeleton's width
 * matches the printable area, so the rasterizer slices correctly.
 */
export function buildDocumentSkeleton(title: string): HTMLElement {
  const root = document.createElement('div')
  root.style.width = `${A4_WIDTH_MM}mm`
  // NO minHeight: the canvas sizes to actual content, which lets the
  // pagination logic (planA4Pages / sliceCanvasForA4) produce exactly the
  // right page count without forcing a 297mm canvas and a spurious 2nd page.
  root.style.padding = `${PAGE_MARGIN_MM}mm`
  root.style.boxSizing = 'border-box'
  root.style.background = '#ffffff'
  root.style.color = '#111827'

  const heading = document.createElement('h1')
  heading.textContent = title
  heading.style.fontSize = '18px'
  heading.style.fontWeight = '600'
  heading.style.margin = '0 0 12px 0'
  root.appendChild(heading)

  return root
}
