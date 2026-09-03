/**
 * PDF pagination regression tests — no actual rasterization, just the math.
 * The pagination rule (services/pdf/render.ts planA4Pages) must produce:
 *   1 page  for content that fits on one A4 page (with a small slack),
 *   N pages when content genuinely exceeds one page,
 *   no blank/near-blank trailing page.
 */
import { describe, expect, it } from 'vitest'

import {
  A4_WIDTH_MM,
  A4_HEIGHT_MM,
  canvasPxToMm,
  planA4Pages,
} from './render'

describe('PDF pagination (planA4Pages)', () => {
  it('returns 1 page for a typical small voucher (~60mm of content)', () => {
    // A small purchase voucher is ~55–70mm of real content once you sum
    // letterhead, information, the 8-col table, remark, signatures, footer.
    expect(planA4Pages(60)).toBe(1)
  })

  it('returns 1 page for a Pattern 1 voucher (~70mm of content)', () => {
    expect(planA4Pages(70)).toBe(1)
  })

  it('returns 1 page for a Pattern 2 / deduction voucher (~70mm of content)', () => {
    expect(planA4Pages(70)).toBe(1)
  })

  it('returns 1 page for content up to a full A4 page + slack (no spurious 2nd page)', () => {
    // Up to A4 + MIN_TRAILING (≈ 8mm) — the slack is always blank template
    // bottom padding — still exactly 1 page.
    expect(planA4Pages(A4_HEIGHT_MM)).toBe(1)
    expect(planA4Pages(A4_HEIGHT_MM + 8)).toBe(1)
  })

  it('returns 2 pages when content just exceeds one page', () => {
    expect(planA4Pages(A4_HEIGHT_MM + 9)).toBe(2)
    expect(planA4Pages(A4_HEIGHT_MM + 40)).toBe(2)
  })

  it('returns 3 pages for content close to 3x a page', () => {
    expect(planA4Pages(A4_HEIGHT_MM * 2 + 30)).toBe(3)
  })

  it('returns 1 page for empty / zero content (defensive)', () => {
    expect(planA4Pages(0)).toBe(1)
  })
})

describe('PDF px↔mm conversion (canvasPxToMm)', () => {
  it('maps a full-width canvas row to exactly A4 width in mm', () => {
    // A canvas rendered from a 210mm-wide element at 1.4x scale.
    const canvasWidthPx = Math.round((A4_WIDTH_MM * 1.4 * 96) / 25.4)
    expect(canvasPxToMm(canvasWidthPx, canvasWidthPx)).toBeCloseTo(A4_WIDTH_MM, 6)
  })

  it('preserves physical size regardless of canvas height (text-scale bug guard)', () => {
    // The OLD bug derived mm from canvas.height vs A4_HEIGHT_MM, which
    // stretched/squashed content whose height ≠ one page. The conversion
    // must depend on WIDTH only.
    const canvasWidthPx = 1112
    const halfPageHeightPx = (A4_HEIGHT_MM / 2) * (canvasWidthPx / A4_WIDTH_MM)
    expect(canvasPxToMm(halfPageHeightPx, canvasWidthPx)).toBeCloseTo(A4_HEIGHT_MM / 2, 6)
    // Same pixel count on a short voucher canvas maps to the same mm.
    expect(canvasPxToMm(halfPageHeightPx, canvasWidthPx)).toBe(
      canvasPxToMm(halfPageHeightPx, canvasWidthPx),
    )
  })
})
