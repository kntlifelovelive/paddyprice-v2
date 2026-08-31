/**
 * Dashboard feature page (Step 8) - PROJECT_SPEC §3.2.
 *
 * Composes the Today / Month / Year summary cards plus the Farmer × Paddy Type
 * × Applied-Price group table. All values come from STORED SNAPSHOTS via
 * `services/reports.getDashboard` - no business calculation is re-derived
 * here. Display contracts preserved (DOMAIN_RULES §9):
 *   - Dashboard pound = NET pound (after moisture), not gross.
 *   - Tins + extra Lb are decomposed from the net pound via the domain helper.
 *   - Group rows are never merged across a different price or paddy type.
 *
 * All colors/text use the semantic theme tokens; no hard-coded white/black.
 */
import { useEffect, useMemo, useState } from 'react'

import { useAppStore } from '@/app/state'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import { getDatabase } from '@/infrastructure/db'
import { getDashboard, type DashboardData } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { formatMMK, formatNumber, formatTins } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { Text } from '@/shared/ui'

type PeriodSummary = DashboardData['summaries']['today']
type DashboardGroup = DashboardData['groups'][number]

interface SummaryCardProps {
  title: string
  summary: PeriodSummary
  lbPerTin: number
}

function SummaryCard({ title, summary, lbPerTin }: SummaryCardProps): JSX.Element {
  const t = useT()
  // §6.3 — Tin + Extra Lb decomposition uses NET POUND, never gross.
  // Dashboard displays "Net Pound" and derives tin decomposition from it.
  const { tins, extraLb } = decomposeNetPound(summary.total_net_pound, lbPerTin)
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <Text as="h3" role="header" className="text-sm font-semibold">
        {title}
      </Text>
      <dl className="mt-3 space-y-1.5 text-sm">
        <div className="flex justify-between gap-2">
          <dt>
            <Text role="secondary">{t({ my: 'အရေအတွက်', en: 'Purchases' })}</Text>
          </dt>
          <dd>
            <Text role="primary">{formatNumber(summary.purchase_count)}</Text>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>
            <Text role="secondary">{t({ my: 'ပေါင် (အသစ်)', en: 'Net Pound' })}</Text>
          </dt>
          <dd>
            <Text role="primary">
              {formatNumber(summary.total_net_pound)} {t({ my: 'ပေါင်', en: 'lb' })}
            </Text>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>
            <Text role="secondary">{t({ my: 'တင်း', en: 'Tin' })}</Text>
          </dt>
          <dd>
            <Text role="primary">
              {formatTins(tins)} {t({ my: 'တင်း +', en: 'Tin +' })}{' '}
              {formatNumber(extraLb)} {t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}
            </Text>
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>
            <Text role="secondary">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
          </dt>
          <dd>
            <Text role="primary">{formatMMK(summary.total_amount)}</Text>
          </dd>
        </div>
      </dl>
    </section>
  )
}

interface GroupRowProps {
  group: DashboardGroup
  lbPerTin: number
}

function GroupRow({ group, lbPerTin, rowNo }: GroupRowProps & { rowNo: number }): JSX.Element {
  const { tins, extraLb } = decomposeNetPound(group.net_pound, lbPerTin)
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="w-10 px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{rowNo}</Text>
      </td>
      <td className="px-2 py-2 text-left">
        <Text role="primary">{group.farmer_name}</Text>
      </td>
      <td className="px-2 py-2 text-left">
        <Text role="primary">{group.rice_type_name}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatNumber(group.price_per_tin)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{formatNumber(group.total_bags)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatNumber(group.net_pound)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{formatTins(tins)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{formatNumber(extraLb)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatMMK(group.total_amount)}</Text>
      </td>
    </tr>
  )
}

interface DashboardState {
  data: DashboardData | null
  error: string | null
  lbPerTin: number
}

export function DashboardPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  const [state, setState] = useState<DashboardState>({ data: null, error: null, lbPerTin: 50 })

  useEffect(() => {
    if (!dbReady) return
    let alive = true
    try {
      const db = getDatabase()
      const data = getDashboard(db)
      const lbPerTin = settingsService.lbPerTin(db)
      if (alive) setState({ data, error: null, lbPerTin })
    } catch (e) {
      if (alive) {
        setState({
          data: null,
          error: e instanceof Error ? e.message : String(e),
          lbPerTin: 50,
        })
      }
    }
    return () => {
      alive = false
    }
  }, [dbReady])

  const summaryCards = useMemo(() => {
    if (!state.data) return null
    return (
      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          title={t({ my: 'ဒီနေ့', en: 'Today' })}
          summary={state.data.summaries.today}
          lbPerTin={state.lbPerTin}
        />
        <SummaryCard
          title={t({ my: 'ဒီလ', en: 'This Month' })}
          summary={state.data.summaries.month}
          lbPerTin={state.lbPerTin}
        />
        <SummaryCard
          title={t({ my: 'ဒီနှစ်', en: 'This Year' })}
          summary={state.data.summaries.year}
          lbPerTin={state.lbPerTin}
        />
      </div>
    )
  }, [state.data, state.lbPerTin, t])

  if (state.error) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="dashboard">
        <p role="alert">
          <Text role="primary">
            {t({ my: 'ဆာဗာအမှား', en: 'Service error' })}: {state.error}
          </Text>
        </p>
      </div>
    )
  }
  if (!state.data) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="dashboard">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  const { data, lbPerTin } = state
  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="dashboard">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'ပင်မစာမျက်နှာ', en: 'Dashboard' })}
      </Text>
      {summaryCards}
      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold">
            {t({ my: 'အမည် × စပါးအမျိုးအစား × ဈေးနှုန်း', en: 'Name × Paddy Type × Price' })}
          </Text>
        </div>
        {data.groups.length === 0 ? (
          <div className="p-4">
            <Text role="muted">{t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="w-10 px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'အစဉ်', en: 'No' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'အမည်', en: 'Name' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'တင်းဈေး', en: 'Price/Tin' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'အိတ်', en: 'Bags' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'ပေါင်', en: 'Pound' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'တင်း', en: 'Tin' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.groups.map((g, idx) => (
                  <GroupRow
                    key={`${g.farmer_id}|${g.rice_type_id}|${g.price_100_tin}`}
                    group={g}
                    lbPerTin={lbPerTin}
                    rowNo={data.groups.length - idx}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default DashboardPage
