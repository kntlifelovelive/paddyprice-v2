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

/** Maximum image height (mm) the rasterizer can render in one slice. */
const SLICE_HEIGHT_MM = 250

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

export interface RenderOptions {
  /** A unique class prefix applied to the root element (test isolation). */
  rootClass?: string
  /** When true, return the rendered HTML element instead of PDF bytes. */
  keepMounted?: boolean
}

/**
 * Render an HTML node to PDF bytes using the documented pipeline.
 * Each page is rasterized at 2x device pixel ratio for crisp output.
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
  node.style.padding = '0'
  node.style.fontFamily = '"Noto Sans Myanmar", "Myanmar Text", system-ui, sans-serif'
  document.body.appendChild(node)

  try {
    // Use html2canvas via dynamic import so the test environment (jsdom) does
    // not need to load it. The dynamic import is also cached after the first
    // call.
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(node, {
      scale: 2,
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
 * Exposed for tests and for templates that want to do their own assembly.
 */
export function sliceCanvasForA4(
  canvas: HTMLCanvasElement,
  maxSliceHeightMm: number = SLICE_HEIGHT_MM,
): PageImageSlice[] {
  const sliceHeightPx = Math.floor(
    (maxSliceHeightMm / A4_HEIGHT_MM) * canvas.height,
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
    slices.push({
      dataUrl: slice.toDataURL('image/png'),
      heightMm: (h / canvas.height) * A4_HEIGHT_MM,
    })
    y += h
  }
  return slices
}

function composePdfFromCanvas(canvas: HTMLCanvasElement): Uint8Array {
  const slices = sliceCanvasForA4(canvas)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  // Available content height per page (mm) accounting for the margin.
  const contentHeightMm = A4_HEIGHT_MM - 2 * PAGE_MARGIN_MM
  // Scale slices to the printable width.
  const sliceWidthMm = A4_WIDTH_MM - 2 * PAGE_MARGIN_MM
  const sliceScale = sliceWidthMm / A4_WIDTH_MM
  for (let i = 0; i < slices.length; i += 1) {
    if (i > 0) pdf.addPage()
    const slice = slices[i]
    const renderHeight = Math.min(slice.heightMm * sliceScale, contentHeightMm)
    pdf.addImage(
      slice.dataUrl,
      'PNG',
      PAGE_MARGIN_MM,
      PAGE_MARGIN_MM,
      sliceWidthMm,
      renderHeight,
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
  root.style.minHeight = `${A4_HEIGHT_MM}mm`
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
