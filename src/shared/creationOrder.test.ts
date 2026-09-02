import { describe, expect, it } from 'vitest'
import { creationOrderNos } from './creationOrder'

interface Rec {
  id: number
  created_at: string
}

/** f (id 1) created first, g (id 2) second, h (id 3) third — oldest → newest. */
const ABC: Rec[] = [
  { id: 1, created_at: '2026-09-01T10:00:00.000Z' },
  { id: 2, created_at: '2026-09-01T10:00:01.000Z' },
  { id: 3, created_at: '2026-09-01T10:00:02.000Z' },
]

describe('creationOrderNos', () => {
  it('assigns permanent creation ranks: No. 1 = first created, newest = highest', () => {
    const nos = creationOrderNos(ABC)
    expect(nos.get(1)).toBe(1)
    expect(nos.get(2)).toBe(2)
    expect(nos.get(3)).toBe(3)
  })

  it('keeps existing Nos unchanged when a new record is created', () => {
    const withD: Rec[] = [...ABC, { id: 4, created_at: '2026-09-01T10:00:03.000Z' }]
    const nos = creationOrderNos(withD)
    expect(nos.get(1)).toBe(1)
    expect(nos.get(2)).toBe(2)
    expect(nos.get(3)).toBe(3)
    expect(nos.get(4)).toBe(4)
  })

  it('breaks created_at ties by id (insertion identifier)', () => {
    const tied: Rec[] = [
      { id: 7, created_at: '2026-09-01T10:00:00.000Z' },
      { id: 5, created_at: '2026-09-01T10:00:00.000Z' },
      { id: 6, created_at: '2026-09-01T10:00:00.000Z' },
    ]
    const nos = creationOrderNos(tied)
    expect(nos.get(5)).toBe(1)
    expect(nos.get(6)).toBe(2)
    expect(nos.get(7)).toBe(3)
  })

  it('handles an empty list', () => {
    expect(creationOrderNos([]).size).toBe(0)
  })
})
