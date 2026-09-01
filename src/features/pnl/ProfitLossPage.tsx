/**
 * Profit & Loss feature page (Step 8/10) - PROJECT_SPEC §3.5.
 *
 * Composes:
 *  - One row per purchase (date DESC) from STORED SNAPSHOTS only, grouped by
 *    date (newest first) with a date header row per group.
 *  - "Moisture" table: No / Name / Paddy Type / Gross Pound / Label /
 *    Deduction (lb) / Moisture Breakdown / Net Pound / Amount, grouped under
 *    a date header per group (newest first).
 *    Contract §4.3: NetPound = GrossPound − DeductionLb (stored values).
 *  - "Moisture Deduction" table (DOMAIN_RULES §8.1) - deduction pounds, NOT
 *    net pounds, one customer row per purchase, plus a styled Total row.
 *    Tin / Extra Lb decompose from the DEDUCTION pound; Amount values that
 *    tin+extra at the stored price (never the customer's purchase amount).
 *  - P&L summary totals: Purchases / Gross / Moisture Deduction / Net / Amount.
 *
 * Display contracts:
 *  - All numbers go through `shared/format`; no manual rounding.
 *  - Semantic theme tokens only (no hard-coded white/black).
 *  - Domain is the only place that derives deduction pounds; this page only
 *    reads pre-computed values from `services/reports`.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import type { Database } from 'sql.js'

import { useAppStore } from '@/app/state'
import { decomposeDeductionPound, totalDeductionTinBreakdown } from '@/domain/paddy/tinBreakdown'
import { computeDeductionAmount } from '@/domain/pnl/report'
import { getDatabase } from '@/infrastructure/db'
import { getMoistureDeductionReport, getPnlReport } from '@/services/reports'
import type { PnlReport, MoistureDeductionReport } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { formatDateDMY, formatMMK, formatNumber } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { Text } from '@/shared/ui'

interface PageState {
  pnl: PnlReport | null
  deduction: MoistureDeductionReport | null
  lbPerTin: number
  error: string | null
}

function load(): PageState {
  const db: Database = getDatabase()
  return {
    pnl: getPnlReport(db),
    deduction: getMoistureDeductionReport(db),
    lbPerTin: settingsService.lbPerTin(db),
    error: null,
  }
}

export function ProfitLossPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  const [state, setState] = useState<PageState>({ pnl: null, deduction: null, lbPerTin: 50, error: null })

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
          lbPerTin: 50,
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

  // Consecutive date grouping (rows arrive date-DESC). The No column is
  // PER-DATE: numbering resets in every date group — the newest row within
  // each group gets that group's size, the oldest row in the group gets 1.
  interface DateGroup<T> {
    date: string
    items: { item: T; no: number }[]
  }

  function groupByDate<T extends { date: string }>(items: readonly T[]): DateGroup<T>[] {
    const groups: DateGroup<T>[] = []
    for (const item of items) {
      const last = groups[groups.length - 1]
      if (last && last.date === item.date) {
        last.items.push({ item, no: 0 })
      } else {
        groups.push({ date: item.date, items: [{ item, no: 0 }] })
      }
    }
    // Numbering is calculated from the CURRENT date group's rows only:
    // no = groupRows.length - idx. Never from the whole dataset.
    for (const group of groups) {
      group.items.forEach((entry, idx) => {
        entry.no = group.items.length - idx
      })
    }
    return groups
  }

  const purchaseGroups = useMemo(() => groupByDate(purchaseRows), [purchaseRows])
  const deductionGroups = useMemo(() => groupByDate(deductionEntries), [deductionEntries])

  // P&L rows by purchase_no — lets the deduction table show the stored price,
  // breakdown text and amount alongside the deduction.
  const pnlByNo = useMemo(
    () => new Map(purchaseRows.map((row) => [row.purchase_no, row])),
    [purchaseRows],
  )

  // Total row (Moisture Deduction) — plain sums of the displayed column values.
  // Deduction total comes from the domain report; Tin + Extra Lb are derived
  // from the SUM of the underlying deduction pounds via the shared P2
  // decomposition rule (aggregate first, decompose once — NOT summing each
  // row's individually-decomposed tins/extra); amount = Σ deduction amounts
  // (tin + extra valued at the stored price) — never the customers' purchase
  // amounts.
  const totals = useMemo(() => {
    const deductionLbs = deductionEntries.map((e) => e.breakdown.total_deduction_lb)
    const { tins, extraLb } = totalDeductionTinBreakdown(deductionLbs, state.lbPerTin)
    let amount = 0
    for (const entry of deductionEntries) {
      const row = pnlByNo.get(entry.purchase_no)
      if (row) {
        amount += computeDeductionAmount(
          entry.breakdown.total_deduction_lb,
          row.price_per_tin,
          state.lbPerTin,
        )
      }
    }
    return {
      deductionLb: state.deduction?.total_deduction_lb ?? 0,
      tins,
      extraLb,
      amount,
    }
  }, [deductionEntries, pnlByNo, state.deduction, state.lbPerTin])

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
      <Text as="h1" role="header" className="text-lg font-semibold text-accent-hover">
        {t({ my: 'အမြတ်/အရှုံး', en: 'Profit & Loss' })}
      </Text>

      {/* Summary — reference layout: Purchases / Gross / Moisture Deduction / Net / Amount */}
      {summary && (
        <section className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryStat
            label={t({ my: 'ဝယ်ယူမှုအရေအတွက်', en: 'Purchases' })}
            value={formatNumber(summary.purchase_count)}
          />
          <SummaryStat
            label={t({ my: 'စုစုပေါင်း Gross ပေါင်', en: 'Total Gross Pound' })}
            value={`${formatNumber(summary.total_gross_pound)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryStat
            label={t({ my: 'စုစုပေါင်း အစိုဓာတ်ဖြတ်', en: 'Total Moisture Deduction' })}
            value={`${formatNumber(summary.total_moisture_loss)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryStat
            label={t({ my: 'စုစုပေါင်း Net ပေါင်', en: 'Total Net Pound' })}
            value={`${formatNumber(summary.total_net_pound)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryStat
            label={t({ my: 'စုစုပေါင်းငွေ', en: 'Total Amount' })}
            value={formatMMK(summary.total_amount)}
          />
        </section>
      )}

      {/* Moisture table — date-grouped (newest first). Contract §4.3:
          NetPound = GrossPound − DeductionLb (stored snapshot values). */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
            {t({ my: 'အစိုဓာတ်', en: 'Moisture' })}
          </Text>
        </div>
        {purchaseGroups.length === 0 ? (
          <div className="p-4">
            <Text role="muted">{t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}</Text>
          </div>
        ) : (
          purchaseGroups.map((group) => (
            <Fragment key={group.date}>
              {/* Date group header */}
              <div className="border-b border-border bg-accent/10 px-3 py-1.5">
                <Text as="h3" role="header" className="text-sm font-semibold text-accent-hover">
                  {formatDateDMY(group.date)}
                </Text>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead>
                    <tr className="border-b border-border bg-surface">
                      <th className="w-10 px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'အစဉ်', en: 'No' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-left">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'အမည်', en: 'Name' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-left">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'Gross ပေါင်', en: 'Gross Pound' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'အညွှန်း', en: 'Label' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'နုတ်ယူမှု (lb)', en: 'Deduction (lb)' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-left">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'အစိုဓာတ် အသေးစိတ်', en: 'Moisture Breakdown' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'Net ပေါင်', en: 'Net Pound' })}</Text>
                      </th>
                      <th className="px-2 py-2 text-right">
                        <Text role="header" className="font-semibold text-accent">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.items.map(({ item: row, no }) => (
                      <tr key={row.purchase_no} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                        <td className="w-10 px-2 py-2 text-right tabular-nums">
                          <Text role="secondary">{no}</Text>
                        </td>
                        <td className="px-2 py-2">
                          <Text role="primary" className="font-medium text-accent">{row.farmer_name}</Text>
                        </td>
                        <td className="px-2 py-2">
                          <Text role="primary" className="text-content-secondary">{row.rice_type_name}</Text>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <Text role="primary">{formatNumber(row.gross_pound)}</Text>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <Text role="primary" className="font-medium text-warning">{row.moisture_label ?? '—'}</Text>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <Text role="primary">{formatNumber(row.moisture_loss)}</Text>
                        </td>
                        <td className="px-2 py-2">
                          <Text role="primary" className="font-medium text-warning">{row.moisture_breakdown || '—'}</Text>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">
                          <Text role="primary">{formatNumber(row.net_pound)}</Text>
                        </td>
                        <td className="bg-accent/10 px-2 py-2 text-right tabular-nums">
                          <Text role="primary" className="font-semibold text-accent">{formatMMK(row.total_amount)}</Text>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Fragment>
          ))
        )}
      </section>

      {/* Moisture Deduction table (§8.1) — DEDUCTION pounds, NOT net pounds.
          One customer row per purchase, grouped by date, with a global Total
          footer. Price comes from the stored snapshot; Tin/Extra Lb decompose
          the DEDUCTION pound and Amount values that tin+extra at the stored
          price — never the customer's purchase amount. */}
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
            {t({ my: 'အစိုဓာတ် နုတ်ယူမှု', en: 'Moisture Deduction' })}
          </Text>
        </div>
        {deductionGroups.length === 0 ? (
          <div className="p-4">
            <Text role="muted">
              {t({ my: 'နုတ်ယူမှု မှတ်တမ်း မရှိသေးပါ', en: 'No deduction records yet' })}
            </Text>
          </div>
        ) : (
          <>
            {deductionGroups.map((group) => (
              <Fragment key={group.date}>
                {/* Date group header */}
                <div className="border-b border-border bg-accent/10 px-3 py-1.5">
                  <Text as="h3" role="header" className="text-sm font-semibold text-accent-hover">
                    {formatDateDMY(group.date)}
                  </Text>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[880px] text-sm">
                    <thead>
                      <tr className="border-b border-border bg-surface">
                        <th className="w-10 px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'အစဉ်', en: 'No' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-left">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'အမည်', en: 'Name' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-left">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'တင်းဈေး', en: 'Price' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-left">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'အစိုဓာတ် အသေးစိတ်', en: 'Moisture Breakdown' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'နုတ်ယူမှု ပေါင်', en: 'Deduction Pound' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'တင်း', en: 'Tin' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'ပိုပေါင်', en: 'Extra lb' })}</Text>
                        </th>
                        <th className="px-2 py-2 text-right">
                          <Text role="header" className="font-semibold text-accent">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map(({ item: entry, no }) => {
                        const row = pnlByNo.get(entry.purchase_no)
                        const parts = decomposeDeductionPound(
                          entry.breakdown.total_deduction_lb,
                          state.lbPerTin,
                        )
                        return (
                          <tr key={entry.purchase_no} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                            <td className="w-10 px-2 py-2 text-right tabular-nums">
                              <Text role="secondary">{no}</Text>
                            </td>
                            <td className="px-2 py-2">
                              <Text role="primary" className="font-medium text-accent">{entry.farmer_name}</Text>
                            </td>
                            <td className="px-2 py-2">
                              <Text role="primary" className="text-content-secondary">{entry.rice_type_name}</Text>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <Text role="primary">{row ? formatNumber(row.price_per_tin) : '—'}</Text>
                            </td>
                            <td className="px-2 py-2">
                              <Text role="primary" className="font-medium text-warning">
                                {row?.moisture_breakdown || '—'}
                              </Text>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <Text role="primary">
                                {formatNumber(entry.breakdown.total_deduction_lb)}
                              </Text>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <Text role="primary">{formatNumber(parts.tins)}</Text>
                            </td>
                            <td className="px-2 py-2 text-right tabular-nums">
                              <Text role="primary">{formatNumber(parts.extraLb)}</Text>
                            </td>
                            <td className="bg-accent/10 px-2 py-2 text-right tabular-nums">
                              <Text role="primary" className="font-semibold text-accent">
                                {row
                                  ? formatMMK(
                                      computeDeductionAmount(
                                        entry.breakdown.total_deduction_lb,
                                        row.price_per_tin,
                                        state.lbPerTin,
                                      ),
                                    )
                                  : '—'}
                              </Text>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Fragment>
            ))}
                        {/* Global Total footer (§8.1) — aggregate-first sums: Deduction
                total from the domain report; Tin + Extra Lb derived from the
                SUM of the underlying deduction pounds via the shared P2 rule;
                Amount = Σ row deduction amounts. The aligned table footer
                keeps the totals under their columns, and a responsive summary
                block below stays readable on Android portrait (no overflow). */}
            <div className="border-t-2 border-border bg-accent/10 px-3 py-1.5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[880px] text-sm">
                <tbody>
                  <tr>
                    <td className="w-10 px-2 py-1.5" />
                    <td className="px-2 py-1.5">
                      <Text role="header" className="font-semibold text-accent">
                        {t({ my: 'စုစုပေါင်း', en: 'Total' })}
                      </Text>
                    </td>
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5" />
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary" className="font-semibold text-accent">
                        {formatNumber(totals.deductionLb)}
                      </Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary" className="font-semibold text-accent">
                        {formatNumber(totals.tins)}
                      </Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary" className="font-semibold text-accent">
                        {formatNumber(totals.extraLb)}
                      </Text>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <Text role="primary" className="font-semibold text-accent">
                        {formatMMK(totals.amount)}
                      </Text>
                    </td>
                  </tr>
                                </tbody>
              </table>
                            </div>
              {/* Responsive total summary — portable, portrait-safe. */}
              <div className="grid grid-cols-2 gap-2 px-1 sm:grid-cols-4">
                <SummaryStat
                  label={t({ my: 'စုစုပေါင်း နုတ်ယူမှု ပေါင်', en: 'Total Deduction Lb' })}
                  value={formatNumber(totals.deductionLb)}
                />
                <SummaryStat
                  label={t({ my: 'စုစုပေါင်း တင်း', en: 'Total Tin' })}
                  value={formatNumber(totals.tins)}
                />
                <SummaryStat
                  label={t({ my: 'စုစုပေါင်း ပိုပေါင်', en: 'Total Extra lb' })}
                  value={formatNumber(totals.extraLb)}
                />
                <SummaryStat
                  label={t({ my: 'စုစုပေါင်း ငွေ', en: 'Total Amount' })}
                  value={formatMMK(totals.amount)}
                />
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <Text role="secondary" className="text-[11px] uppercase tracking-wide">
        {label}
      </Text>
      <Text role="primary" className="text-base font-semibold tabular-nums">
        {value}
      </Text>
    </div>
  )
}

export default ProfitLossPage
