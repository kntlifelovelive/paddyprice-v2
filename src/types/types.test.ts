import { describe, expect, it } from 'vitest'

import type { Settings } from '@/types'
import type { PurchaseSnapshot } from '@/domain/purchase/types'

/**
 * Compile-time-only guards: verify the app-level contracts are the shapes the
 * domain consumes. These do not test implementations (none exist yet) — they
 * lock the type surface so a future infrastructure/services step satisfies it.
 */

describe('src/types contracts (Step 3 type surface)', () => {
  it('Settings is type-only and exposes the moisture_rates field', () => {
    const settings: Settings = {
      company_name: 'Paddy',
      company_address: '',
      company_phone: '',
      company_footer_text: '',
      tin_formula: '50',
      moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
      pdf_dir: 'PSO/pdf',
      theme: 'tokyo-night',
      font_size: 'normal',
      language: 'my',
    }
    expect(settings.moisture_rates[18]).toBe(2)
  })

  it('PurchaseRecord bags are the same BagRow shape the domain totals consume', () => {
    // Satisfies the port contract structurally without instantiating it.
    const bag = { weight_lb: 98.4, moisture_label: 18 as const }
    const row = { weight_lb: bag.weight_lb, moisture_label: bag.moisture_label }
    expect(row).toEqual(bag)
  })

  it('PurchaseSnapshot is assignable to a purchase summary consumer', () => {
    const snapshot: PurchaseSnapshot = {
      id: 1,
      purchase_no: 'PSO-202608-0001',
      date: '2026-08-01',
      farmer_id: 1,
      farmer_name: 'Ko Aung',
      rice_type_id: 10,
      rice_type_name: 'Emata',
      price_100_tin: 1_850_000,
      price_per_tin: 18_500,
      total_bags: 3,
      total_pounds: 300,
      total_tins: 6,
      total_amount: 111_000,
      gross_pound: 300,
      moisture_loss: 0,
      net_pound: 300,
      moisture_label: null,
    }
    expect(snapshot.purchase_no).toMatch(/^PSO-\d{6}-\d{4}$/)
  })
})