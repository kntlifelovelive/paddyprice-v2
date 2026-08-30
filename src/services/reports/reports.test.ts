// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'

import { closeTestDatabase, createTestDatabase } from '@/infrastructure/db/test-support'
import { createFarmer } from '@/infrastructure/db/dao/farmers'
import { createRiceType } from '@/infrastructure/db/dao/riceTypes'
import { createRicePrice } from '@/infrastructure/db/dao/ricePrices'
import { addWeight, createPurchase } from '@/services/purchase'
import {
  getDashboard,
  getHistoryRecords,
  getMoistureDeductionReport,
  getMonthSummaries,
  getPnlReport,
  getRiceTypeSummaries,
} from './service'

describe('reportsService (dashboard/history/pnl/moisture deduction)', () => {
  let db: Database

  beforeAll(async () => {
    db = await createTestDatabase()

    const farmerA = createFarmer(db, { name: 'Ko Aung' })
    const typeA = createRiceType(db, { name: 'Emata' })
    createRicePrice(db, { date: '2026-08-01', rice_type_id: typeA.id, price_100_tin: 1_850_000, price_per_tin: 18_500 })

    const farmerB = createFarmer(db, { name: 'Daw Hla' })
    const typeB = createRiceType(db, { name: 'Paw San' })
    createRicePrice(db, { date: '2026-08-15', rice_type_id: typeB.id, price_100_tin: 1_600_000, price_per_tin: 16_000 })

    // Purchase A (2026-08-01, Ko Aung / Emata): gross 225, loss 8 (1+4+3), net 217,
    // tins 4.34, amount 4.34 × 18_500 = 80_290.
    const aId = createPurchase(db, {
      farmer_id: farmerA.id,
      date: '2026-08-01',
      rice_type_id: typeA.id,
      moisture_label: 17,
    }).snapshot.id
    for (const [w, m] of [
      ['50', 17],
      ['100', 18],
      ['50', 19],
      ['25', null],
    ] as const) {
      addWeight(db, aId, w, m)
    }

    // Purchase B (2026-08-15, Daw Hla / Paw San): gross 25, loss 1, net 24,
    // tins 0.48, amount 0.48 × 16_000 = 7_680.
    const bId = createPurchase(db, {
      farmer_id: farmerB.id,
      date: '2026-08-15',
      rice_type_id: typeB.id,
      moisture_label: null,
    }).snapshot.id
    addWeight(db, bId, '25', 18)
  })
  afterAll(() => closeTestDatabase())

  it('builds Dashboard Today/Month/Year summaries from stored snapshots', () => {
    const dash = getDashboard(db, '2026-08-20')
    expect(dash.summaries.today.purchase_count).toBe(0) // no purchase exactly on the 20th
    expect(dash.summaries.month.purchase_count).toBe(2)
    expect(dash.summaries.month.total_bags).toBe(5)
    expect(dash.summaries.month.total_amount).toBe(80_290 + 7_680)
    expect(dash.summaries.year.purchase_count).toBe(2)
  })

  it('exposes both total_pounds (gross) and total_net_pound (net) in summaries', () => {
    // Step 10 §2: Dashboard / History displays use NET POUND, not gross.
    // gross (total_pounds) = 225 + 25 = 250; net (total_net_pound) = 217 + 24 = 241.
    const dash = getDashboard(db, '2026-08-20')
    expect(dash.summaries.month.total_pounds).toBe(250)
    expect(dash.summaries.month.total_net_pound).toBe(241)
  })

  it('groups Dashboard rows by Farmer + Type + Price (never merged across prices)', () => {
    const { groups } = getDashboard(db, '2026-08-20')
    expect(groups).toHaveLength(2)
    const emata = groups.find((g) => g.rice_type_name === 'Emata')!
    expect(emata.farmer_name).toBe('Ko Aung')
    expect(emata.net_pound).toBe(217) // Dashboard uses NET pound
  })

  it('provides History records and month/type summaries', () => {
    const records = getHistoryRecords(db)
    expect(records).toHaveLength(2)
    expect(records[0].snapshot.date).toBe('2026-08-15') // newest first

    const months = getMonthSummaries(db)
    expect(months).toEqual([
      expect.objectContaining({ month: '2026-08', purchase_count: 2, total_bags: 5 }),
    ])

    const types = getRiceTypeSummaries(db)
    expect(types).toHaveLength(2)
    expect(types.find((t) => t.rice_type_name === 'Emata')?.total_pounds).toBe(225)
  })

  it('builds P&L rows and summary from stored snapshots', () => {
    const { rows, summary } = getPnlReport(db)
    expect(rows).toHaveLength(2)
    expect(rows[0].moisture_breakdown).toBe('18:1')
    expect(rows[1].moisture_breakdown).toBe('17:1, 18:1, 19:1')
    expect(summary).toEqual({
      purchase_count: 2,
      total_gross_pound: 250,
      total_moisture_loss: 9,
      total_net_pound: 241,
      total_amount: 87_970,
    })
  })

  it('moisture deduction report: deduction pounds aggregated by label/farmer/type', () => {
    const report = getMoistureDeductionReport(db)
    expect(report.entries).toHaveLength(2)

    const a = report.entries.find((e) => e.purchase_no.endsWith('-0001'))!
    expect(a.farmer_name).toBe('Ko Aung')
    expect(a.breakdown.labels).toEqual([
      { label: 17, deduction_lb: 1 },
      { label: 18, deduction_lb: 4 },
      { label: 19, deduction_lb: 3 },
    ])
    expect(a.breakdown.total_deduction_lb).toBe(8)

    // Only labels with data appear; ascending order.
    expect(report.byLabel).toEqual([
      { label: 17, deduction_lb: 1 },
      { label: 18, deduction_lb: 5 },
      { label: 19, deduction_lb: 3 },
    ])

    // §8.1 — the Total row value is deduction pound, NOT net pound.
    expect(report.total_deduction_lb).toBe(9)
    expect(report.total_deduction_lb).not.toBe(241)

    expect(report.byFarmer).toEqual([
      { name: 'Ko Aung', deduction_lb: 8 },
      { name: 'Daw Hla', deduction_lb: 1 },
    ])
    expect(report.byRiceType).toEqual([
      { name: 'Emata', deduction_lb: 8 },
      { name: 'Paw San', deduction_lb: 1 },
    ])
  })

  it('filters history/reports by farmer', () => {
    const filtered = getHistoryRecords(db, { farmer_id: 2 })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].snapshot.purchase_no).toBe('PSO-202608-0002')
  })
})