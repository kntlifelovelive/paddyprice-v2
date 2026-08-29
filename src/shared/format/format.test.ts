import { describe, expect, it } from 'vitest'
import {
  formatMMK,
  formatNumber,
  formatTins,
  formatDateDMY,
  formatTime12,
  formatTime12Short,
  splitDateTime,
  todayISO,
} from './format'

describe('formatNumber (max 2 fraction digits, en-US grouping)', () => {
  it('formats thousands separators', () => {
    expect(formatNumber(1850000)).toBe('1,850,000')
  })

  it('rounds display to at most 2 fraction digits', () => {
    expect(formatNumber(1234.567)).toBe('1,234.57')
    expect(formatNumber(5)).toBe('5')
  })
})

describe('formatMMK', () => {
  it('appends the MMK suffix', () => {
    expect(formatMMK(110445)).toBe('110,445 MMK')
  })
})

describe('formatTins (max 3 fraction digits)', () => {
  it('keeps up to 3 decimals and trims trailing zeros', () => {
    expect(formatTins(5.964)).toBe('5.964')
    expect(formatTins(5)).toBe('5')
  })
})

describe('date/time helpers (local time)', () => {
  it('todayISO returns local YYYY-MM-DD', () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('splitDateTime splits an ISO datetime', () => {
    expect(splitDateTime('2026-08-26T13:15:30')).toEqual({
      date: '2026-08-26',
      time: '13:15:30',
    })
  })

  it('formatTime12 renders 12-hour time with AM/PM', () => {
    expect(formatTime12('2026-08-26T13:15:30')).toBe('01:15:30 PM')
    expect(formatTime12('2026-08-26T00:00:00')).toBe('12:00:00 AM')
  })

  it('formatTime12Short omits seconds', () => {
    expect(formatTime12Short('2026-08-26T10:35:00')).toBe('10:35 AM')
  })

  it('formatDateDMY renders DD-MMM-YYYY and passes invalid input through', () => {
    expect(formatDateDMY('2026-08-26')).toBe('26-Aug-2026')
    expect(formatDateDMY('not-a-date')).toBe('not-a-date')
  })
})
