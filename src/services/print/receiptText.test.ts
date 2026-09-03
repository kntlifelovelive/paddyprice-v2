/**
 * Thermal receipt FORMAT-PARITY tests (reference:
 * ~/paddyprice/src/services/printer/ReceiptFormatter.ts).
 *
 * Fixtures: normal purchase, moisture Pattern 1, Pattern 2 / deduction.
 * The receipt layer consumes the ALREADY calculated snapshot values — the
 * tests verify those exact values appear in the reference line structure.
 */
import { describe, expect, it } from 'vitest'

import { formatMMK, formatNumber, formatTins } from '@/shared/format'
import type { PrintReceipt } from '@/types/print'
import { charsForWidth, formatReceiptText } from './receiptText'

const NORMAL: PrintReceipt = {
  company_name: 'PadDy Trading',
  company_address: 'No.12 Strand Rd, Yangon',
  company_phone: '09-123456789',
  invoice_no: 'PSO-202609-0001',
  date: '2026-09-01',
  time: '10:30 AM',
  generated_at: '2026-09-01T11:00:00.000Z',
  farmer_name: 'Mg Mg',
  farmer_address: 'Insein',
  farmer_phone: '09-555111',
  rows: [
    {
      rice_type_name: 'Shwe War Tun',
      pounds: 400,
      tins: 8,
      price_100_tin: 1850000,
      price_per_tin: 18500,
      amount: 148000,
    },
  ],
  bags: [
    { seq: 1, weight_lb: 100 },
    { seq: 2, weight_lb: 150 },
    { seq: 3, weight_lb: 150 },
  ],
  total_pounds: 400,
  total_tins: 8,
  total_amount: 148000,
  remark: '',
}

/** Pattern 1 purchase — label 17 deduction already applied by the domain. */
const PATTERN_1: PrintReceipt = {
  ...NORMAL,
  invoice_no: 'PSO-202609-0002',
  rows: [{ ...NORMAL.rows[0], pounds: 500, tins: 9.5, amount: 175750 }],
  total_pounds: 500,
  total_tins: 9.5,
  total_amount: 175750,
}

/** Pattern 2 / per-bag deduction purchase — same consumed-value rule. */
const PATTERN_2: PrintReceipt = {
  ...NORMAL,
  invoice_no: 'PSO-202609-0003',
  bags: [
    { seq: 1, weight_lb: 100 },
    { seq: 2, weight_lb: 100 },
    { seq: 3, weight_lb: 100 },
    { seq: 4, weight_lb: 95 },
  ],
  rows: [{ ...NORMAL.rows[0], pounds: 395, tins: 7.9, amount: 146150 }],
  total_pounds: 395,
  total_tins: 7.9,
  total_amount: 146150,
}

describe('formatReceiptText (reference thermal format)', () => {
  it('uses 32 chars for 58mm and 48 chars for 80mm paper', () => {
    expect(charsForWidth('58')).toBe(32)
    expect(charsForWidth('80')).toBe(48)
    for (const line of formatReceiptText(NORMAL, '58').split('\n')) {
      expect(line.length).toBeLessThanOrEqual(32)
    }
  })

  it('renders the reference structure in the reference order', () => {
    const lines = formatReceiptText(NORMAL, '58').split('\n')
    const w = 32
    expect(lines[0]).toBe('='.repeat(w))
    expect(lines[1]).toBe(' '.repeat(Math.floor((w - 14) / 2)) + 'PADDY PURCHASE')
    expect(lines).toContain('Invoice: PSO-202609-0001')
    expect(lines).toContain('Purchase Date: 01/09/2026')
    expect(lines).toContain('Purchase Time: 10:30 AM')
    expect(lines.some((l) => l.startsWith('Generated: 01/09/2026 '))).toBe(true)
    expect(lines).toContain('Customer:')
    expect(lines).toContain('Mg Mg')
    expect(lines).toContain('Insein')
    expect(lines).toContain('09-555111')
    expect(lines).toContain('Paddy Type'.padEnd(16) + 'Pound'.padStart(6) + 'Tin'.padStart(6))
    expect(lines).toContain(
      'Shwe War Tun'.padEnd(16) + formatNumber(400).padStart(6) + formatTins(8).padStart(6),
    )
    expect(lines).toContain('  ' + '18/50000'.padEnd(12) + formatMMK(148000).padStart(16))
    expect(lines).toContain('Bags: 3')
    expect(lines).toContain('#1 100lb'.padEnd(16) + '#2 150lb'.padEnd(16))
    expect(lines).toContain(`Total Pound: ${formatNumber(400)}`)
    expect(lines).toContain(`Total Tin:   ${formatTins(8)}`)
    expect(lines).toContain(`Total Amount: ${formatMMK(148000)}`)
    expect(lines[lines.length - 1]).toBe('='.repeat(w))
    expect(lines).toContain(' '.repeat(Math.floor((w - 9) / 2)) + 'Thank you')
  })

  it('keeps the same structure for Pattern 1 values (consumed, not recomputed)', () => {
    const lines = formatReceiptText(PATTERN_1, '58').split('\n')
    expect(lines).toContain(`Total Pound: ${formatNumber(500)}`)
    expect(lines).toContain(`Total Tin:   ${formatTins(9.5)}`)
    expect(lines).toContain(`Total Amount: ${formatMMK(175750)}`)
    expect(lines).toContain('Invoice: PSO-202609-0002')
  })

  it('keeps the same structure for Pattern 2 / deduction values', () => {
    const lines = formatReceiptText(PATTERN_2, '58').split('\n')
    expect(lines).toContain('Bags: 4')
    expect(lines).toContain(`Total Pound: ${formatNumber(395)}`)
    expect(lines).toContain(`Total Tin:   ${formatTins(7.9)}`)
    expect(lines).toContain(`Total Amount: ${formatMMK(146150)}`)
  })

  it('adapts the item-table columns to 80mm paper', () => {
    const lines = formatReceiptText(NORMAL, '80').split('\n')
    expect(lines[0]).toBe('='.repeat(48))
    expect(lines).toContain('Paddy Type'.padEnd(32) + 'Pound'.padStart(6) + 'Tin'.padStart(6))
    expect(lines).toContain(
      '#1 100lb'.padEnd(16) + '#2 150lb'.padEnd(16) + '#3 150lb'.padEnd(16),
    )
  })

  it('omits optional blocks when empty and prints the remark when present', () => {
    const bare: PrintReceipt = {
      ...NORMAL,
      company_address: '',
      company_phone: '',
      farmer_address: '',
      farmer_phone: '',
      bags: [],
    }
    expect(formatReceiptText(bare, '58').split('\n')).not.toContain('Bags: 0')
    expect(formatReceiptText({ ...NORMAL, remark: 'test remark' }, '58')).toContain(
      'Remark: test remark',
    )
  })
})
