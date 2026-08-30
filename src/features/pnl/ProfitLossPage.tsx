/**
 * Profit & Loss feature page (Step 8/10) - PROJECT_SPEC §3.5.
 *
 * Composes:
 *  - One row per purchase (date DESC) from STORED SNAPSHOTS only.
 *  - Moisture deduction breakdown table (DOMAIN_RULES §8.1) - deduction
 *    pounds, NOT net pounds. Only labels with data appear as data rows; the
 *    Total row is always present and equals the sum of displayed rows.
 *  - P&L summary totals: Gross Pound / Moisture Deduction Pound / Net Pound /
 *    Tin + Extra Lb / Total Amount — all separate values (rule §7).
 *
 * Display contracts:
 *  - All numbers go through `shared/format`; no manual rounding.
 *  - Semantic theme tokens only (no hard-coded white/black).
 *  - Domain is the only place that derives deduction pounds; this page only
 *    reads pre-computed values from `services/reports`.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Database } from 'sql.js'

import { useAppStore } from '@/app/state'
import { getDatabase } from '@/infrastructure/db'
import { getMoistureDeductionReport, getPnlReport } from '@/services/reports'
import type { PnlReport, MoistureDeductionReport } from '@/services/reports'
import { formatDateDMY, formatMMK, formatNumber } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { Text } from '@/shared/ui'

interface PageState {
  pnl: PnlReport | null
  deduction: MoistureDeductionReport | null
  error: string | null
}

function load(): PageState {
  const db: Database = getDatabase()
  return {
    pnl: getPnlReport(db),
    deduction: getMoistureDeductionReport(db),
    error: null,
  }
}

export function ProfitLossPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  const [state, setState] = useState<PageState>({ pnl: null, deduction: null, error: null })

  useEffect(() => {
    if (!dbReady) return
    let alive = true
    try {
      const next = load()
      if (alive) setState({ ...next, error: null })
    } catch (e) {
      if (alive) {
        setState({
          pnl: null,
          deduction: null,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }
    return () => {
      alive = false
    }
  }, [dbReady])

  const purchaseRows = useMemo(() => state.pnl?.rows ?? [], [state.pnl])
  const summary = state.pnl?.summary
  const deductionEntries = useMemo(() => state.deduction?.entries ?? [], [state.deduction])

  if (state.error) {
    return (
      <div className="p-4">
        <p role="alert">
          <Text role="primary">
            {t({ my: 'ဆာဗာအမှား', en: 'Service error' })}: {state.error}
          </Text>
        </p>
      </div>
    )
  }
  if (!state.pnl || !state.deduction) {
    return (
      <div className="p-4">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="pnl">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'အမြတ်/အရှုံး', en: 'Profit & Loss' })}
      </Text>

      {/* Summary — all three pound concepts kept separate: Gross / Deduction / Net */}
      {summary && (
        <section className="grid gap-3 rounded-lg border border-border bg-surface p-3 sm:grid-cols-7">
          <SummaryCell
            label={t({ my: 'အရေအတွက်', en: 'Purchases' })}
            value={formatNumber(summary.purchase_count)}
          />
          <SummaryCell
            label={t({ my: 'ပေါင် (Gross)', en: 'Gross Pound' })}
            value={formatNumber(summary.total_gross_pound)}
          />
          <SummaryCell
            label={t({ my: 'အစိုဓာတ် နုတ်ယူမှု', en: 'Moisture Deduction' })}
            value={`${formatNumber(summary.total_moisture_loss)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryCell
            label={t({ my: 'ပေါင် (အသစ်)', en: 'Net Pound' })}
            value={formatNumber(summary.total_net_pound)}
          />
          <SummaryCell
            label={t({ my: 'တင်း', en: 'Tin' })}
            value={formatNumber(Math.floor(summary.total_net_pound / 50))}
          />
          <SummaryCell
            label={t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}
            value={formatNumber(summary.total_net_pound % 50)}
          />
          <SummaryCell
            label={t({ my: 'ငွေ', en: 'Amount' })}
            value={formatMMK(summary.total_amount)}
          />
        </section>
      )}

      {/* Per-purchase P&L rows */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold">
            {t({ my: 'ဝယ်ယူမှု အသီးသီး', en: 'Per Purchase' })}
          </Text>
        </div>
        {purchaseRows.length === 0 ? (
          <div className="p-4">
            <Text role="muted">{t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'လယ်သမား', en: 'Farmer' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'Gross lb', en: 'Gross lb' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">
                      {t({ my: 'အစိုဓာတ် နုတ်ယူမှု', en: 'Deduction' })}
                    </Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'Net lb', en: 'Net lb' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'Pattern 2', en: 'Pattern 2' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {purchaseRows.map((row) => (
                  <tr key={row.purchase_no} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1.5">
                      <Text role="secondary">{formatDateDMY(row.date)}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="primary">{row.farmer_name}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="primary">{row.rice_type_name}</Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary">{formatNumber(row.gross_pound)}</Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="secondary">{formatNumber(row.moisture_loss)}</Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary">{formatNumber(row.net_pound)}</Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary">{formatMMK(row.total_amount)}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="secondary">{row.moisture_breakdown || '—'}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Moisture DEDUCTION POUND breakdown (§8.1) — this table shows DEDUCTION pounds, NOT net pounds */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold">
            {t({ my: 'အစိုဓာတ် နုတ်ယူမှု အသေးစိတ် (lb)', en: 'Moisture Deduction Breakdown (lb)' })}
          </Text>
          <Text role="muted" className="text-xs">
            {t({ my: 'ဤဇယားသည် DEDUCTION POUND ကိုသာ ပြသည် — net pound မဟုတ်ပါ', en: 'This table shows DEDUCTION POUND only, not net pound' })}
          </Text>
        </div>
        {deductionEntries.length === 0 ? (
          <div className="p-4">
            <Text role="muted">
              {t({ my: 'နုတ်ယူမှု မှတ်တမ်း မရှိသေးပါ', en: 'No deduction records yet' })}
            </Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'အရောင်းနံပါတ်', en: 'Purchase No' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'လယ်သမား', en: 'Farmer' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                  </th>
                  {state.deduction!.byLabel.map((l) => (
                    <th key={l.label} className="px-2 py-2 text-right">
                      <Text role="header">{l.label}</Text>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'စုစုပေါင်း', en: 'Total' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {deductionEntries.map((entry) => (
                  <tr key={entry.purchase_no} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1.5">
                      <Text role="primary">{entry.purchase_no}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="secondary">{formatDateDMY(entry.date)}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="primary">{entry.farmer_name}</Text>
                    </td>
                    <td className="px-2 py-1.5">
                      <Text role="primary">{entry.rice_type_name}</Text>
                    </td>
                    {state.deduction!.byLabel.map((l) => {
                      const cell = entry.breakdown.labels.find((row) => row.label === l.label)
                      return (
                        <td key={l.label} className="px-2 py-1.5 text-right tabular-nums">
                          <Text role="secondary">
                            {cell ? formatNumber(cell.deduction_lb) : '—'}
                          </Text>
                        </td>
                      )
                    })}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary">
                        {formatNumber(entry.breakdown.total_deduction_lb)}
                      </Text>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-border bg-surface font-semibold">
                  <td className="px-2 py-2" colSpan={4}>
                    <Text role="header">
                      {t({ my: 'စုစုပေါင်း နုတ်ယူမှု', en: 'Total Deduction' })}
                    </Text>
                  </td>
                  {state.deduction!.byLabel.map((l) => (
                    <td key={`t-${l.label}`} className="px-2 py-2 text-right tabular-nums">
                      <Text role="primary">{formatNumber(l.deduction_lb)}</Text>
                    </td>
                  ))}
                  <td className="px-2 py-2 text-right tabular-nums">
                    <Text role="primary">{formatNumber(state.deduction!.total_deduction_lb)}</Text>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryCell({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <Text role="secondary">{label}</Text>
      <Text role="primary" className="tabular-nums">
        {value}
      </Text>
    </div>
  )
}

export default ProfitLossPage
