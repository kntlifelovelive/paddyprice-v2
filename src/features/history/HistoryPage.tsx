/**
 * History feature page (Step 8) — PROJECT_SPEC §3.2.
 *
 * Read-only purchase history. Display contracts (PROJECT_SPEC §2/§3/§4):
 * - "Total Pound" column shows the stored NET pound (never gross/deduction).
 * - Tin + Extra Lb decompose that net pound via the domain helper.
 * - Newest purchase first (DAO order: date DESC, id DESC) with visible NO in
 *   descending order — a UI convention only; stored ids/seq are untouched.
 * - Semantic theme text tokens only; no hard-coded colors.
 */
import { useMemo } from 'react'
import type { Database } from 'sql.js'

import { getDatabase } from '@/infrastructure/db'
import { getHistoryRecords } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import { formatNumber, formatMMK, formatDateDMY } from '@/shared/format'
import { useT } from '@/shared/hooks'
import type { PurchaseRecord } from '@/types'

interface HistoryData {
  records: PurchaseRecord[]
  lbPerTin: number
}

function loadHistory(db: Database): HistoryData {
  return {
    records: getHistoryRecords(db),
    lbPerTin: settingsService.lbPerTin(db),
  }
}

export function HistoryPage() {
  const t = useT()
  const data = useMemo<{ data: HistoryData | null; error: string | null }>(() => {
    try {
      return { data: loadHistory(getDatabase()), error: null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Failed to load history' }
    }
  }, [])

  if (data.error) {
    return (
      <div className="p-3 sm:p-4" data-page="history">
        <p role="alert" className="text-content-secondary">{data.error}</p>
      </div>
    )
  }
  if (!data.data) {
    return (
      <div className="p-3 sm:p-4" data-page="history">
        <p className="text-content-muted">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</p>
      </div>
    )
  }

  const { records, lbPerTin } = data.data

  if (records.length === 0) {
    return (
      <div className="p-3 sm:p-4" data-page="history">
        <h1 className="mb-3 text-lg font-semibold text-content-header">
          {t({ my: 'အရောင်းမှတ်တမ်း', en: 'History' })}
        </h1>
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-content-muted">
          {t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}
        </div>
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-4" data-page="history">
      <h1 className="mb-3 text-lg font-semibold text-content-header">
        {t({ my: 'အရောင်းမှတ်တမ်း', en: 'History' })}
      </h1>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table data-testid="history-table" className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'အစဉ်', en: 'NO' })}</th>
              <th className="px-2 py-2 text-left font-medium text-content-header">{t({ my: 'အရောင်းနံပါတ်', en: 'Purchase No' })}</th>
              <th className="px-2 py-2 text-left font-medium text-content-header">{t({ my: 'ရက်စွဲ', en: 'Date' })}</th>
              <th className="px-2 py-2 text-left font-medium text-content-header">{t({ my: 'လယ်သမား', en: 'Farmer' })}</th>
              <th className="px-2 py-2 text-left font-medium text-content-header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</th>
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'အိတ်', en: 'Bags' })}</th>
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'ပေါင် (အသုံးချ)', en: 'Total Pound (Net)' })}</th>
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'တင်', en: 'Tin' })}</th>
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'အပို ပေါင်', en: 'Extra Lb' })}</th>
              <th className="px-2 py-2 text-right font-medium text-content-header">{t({ my: 'ငွေ', en: 'Amount' })}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record, index) => {
              const s = record.snapshot
              const { tins, extraLb } = decomposeNetPound(s.net_pound, lbPerTin)
              return (
                <tr key={s.id} className="border-b border-border last:border-b-0">
                  <td className="px-2 py-2 text-right tabular-nums text-content-secondary">
                    {records.length - index}
                  </td>
                  <td className="px-2 py-2 text-content-primary">{s.purchase_no}</td>
                  <td className="px-2 py-2 text-content-secondary">{formatDateDMY(s.date)}</td>
                  <td className="px-2 py-2 text-content-primary">{s.farmer_name}</td>
                  <td className="px-2 py-2 text-content-primary">{s.rice_type_name}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{s.total_bags}</td>
                  {/* Total Pound = NET pound (§3) — never gross or deduction. */}
                  <td className="px-2 py-2 text-right tabular-nums text-content-primary">{formatNumber(s.net_pound)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{tins}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{formatNumber(extraLb)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-content-primary">{formatMMK(s.total_amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default HistoryPage
