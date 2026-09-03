/**
 * ESC/POS command formatter — converts PrintReceipt data into raw
 * ESC/POS byte commands for thermal printers.
 *
 * OUTPUT FORMAT PORT of the reference project's
 * `~/paddyprice/src/services/printer/EscPosFormatter.ts`. Pure byte
 * generation only: no Bluetooth, no SQLite, no UI.
 *
 * LIMITATION (important, from the reference): most ESC/POS thermal printers
 * ship with code-page fonts that do NOT include Myanmar glyphs. Text-mode
 * printing sends UTF-8 bytes, which only renders correctly on printers with
 * Myanmar font support — a raster-image approach would be required otherwise.
 */
import { formatReceiptText } from './receiptText'
import type { PaperWidth, PrintReceipt } from '@/types/print'

const NL = String.fromCharCode(10)

/** Standard ESC/POS init: clear settings. */
const ESC_AT = [0x1b, 0x40]
/** Justification: 0=left, 1=center, 2=right. */
const ESC_ALIGN = (n: number) => [0x1b, 0x61, n]
/** Bold on/off. */
const ESC_BOLD = (on: boolean) => [0x1b, 0x45, on ? 1 : 0]
/** Feed n lines. */
const ESC_FEED = (n: number) => [0x1b, 0x64, n]
/** Full cut (best-effort; ignored by printers without a cutter). */
const GS_CUT = [0x1d, 0x56, 0x42, 0x00]

function textBytes(s: string): number[] {
  // UTF-8 encoding — correct only for printers with Unicode/Myanmar support.
  return Array.from(new TextEncoder().encode(s))
}

export interface EscPosResult {
  bytes: Uint8Array
  /** True when the receipt contains non-Latin characters (e.g. Myanmar). */
  containsUnicode: boolean
}

/**
 * Build the complete ESC/POS byte stream for one receipt copy.
 */
export function buildEscPos(receipt: PrintReceipt, paperWidth: PaperWidth): EscPosResult {
  const commands: number[] = [...ESC_AT]
  const plain = formatReceiptText(receipt, paperWidth)
  const lines = plain.split(NL)

  let containsUnicode = false

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if ([...line].some((ch) => ch.charCodeAt(0) > 126)) containsUnicode = true

    // Center the header block (first heavy rule + title + company info).
    if (i <= lines.findIndex((l) => l.startsWith('====='))) {
      commands.push(...ESC_ALIGN(1))
      commands.push(...ESC_BOLD(true))
    } else {
      commands.push(...ESC_ALIGN(0))
      commands.push(...ESC_BOLD(false))
    }
    commands.push(...textBytes(line + NL))
  }

  commands.push(...ESC_ALIGN(0), ...ESC_BOLD(false))
  commands.push(...ESC_FEED(3))
  commands.push(...GS_CUT)

  return { bytes: new Uint8Array(commands), containsUnicode }
}

/**
 * Build ESC/POS bytes from arbitrary plain text (used by Test Print).
 */
export function buildEscPosText(text: string, _paperWidth: PaperWidth): Uint8Array {
  const commands: number[] = [...ESC_AT, ...ESC_ALIGN(0), ...ESC_BOLD(false)]
  for (const line of text.split(NL)) {
    commands.push(...textBytes(line + NL))
  }
  commands.push(...ESC_FEED(3))
  commands.push(...GS_CUT)
  return new Uint8Array(commands)
}
