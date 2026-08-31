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
import { useEffect, useState } from 'react'

import { useAppStore } from '@/app/state'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import type { DashboardGroupRow } from '@/domain/summaries/summaries'
import { getDatabase } from '@/infrastructure/db'
import { listRiceTypes } from '@/infrastructure/db/dao/riceTypes'
import {
  getDashboardView,
  type DashboardData,
  type DashboardPeriod,
  type DashboardView,
} from '@/services/reports'
import { settingsService } from '@/services/settings'
import { formatDateDMY, formatMMK, formatNumber, formatTins } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { Text } from '@/shared/ui'
import type { RiceType } from '@/types'

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

/** One date group: date header + group table with a column-wise Total row
 *  (plain sums of the displayed values — tin/extra decompose each group's
 *  net pound, exactly as the rows do; no other calculation). */
function DateGroupSection({
  date,
  groups,
  lbPerTin,
}: {
  date: string
  groups: DashboardGroupRow[]
  lbPerTin: number
}): JSX.Element {
  const t = useT()
  let bags = 0
  let pound = 0
  let tins = 0
  let extraLb = 0
  let amount = 0
  for (const g of groups) {
    bags += g.total_bags
    pound += g.net_pound
    const d = decomposeNetPound(g.net_pound, lbPerTin)
    tins += d.tins
    extraLb += d.extraLb
    amount += g.total_amount
  }
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      {/* Date group header — existing snapshot date, unchanged. */}
      <div className="border-b border-border bg-surface px-3 py-2">
        <Text role="primary" className="text-sm font-semibold tabular-nums">
          {formatDateDMY(date)}
        </Text>
      </div>
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
            {groups.map((g, idx) => (
              <GroupRow
                key={`${g.farmer_id}|${g.rice_type_id}|${g.price_100_tin}`}
                group={g}
                lbPerTin={lbPerTin}
                rowNo={groups.length - idx}
              />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-surface">
              <td colSpan={4} className="px-2 py-2 text-right">
                <Text role="primary" className="font-semibold">
                  {t({ my: 'စုစုပေါင်း', en: 'Total' })}
                </Text>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Text role="primary" className="font-semibold">
                  {formatNumber(bags)}
                </Text>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Text role="primary" className="font-semibold">
                  {formatNumber(pound)}
                </Text>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Text role="primary" className="font-semibold">
                  {formatTins(tins)}
                </Text>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Text role="primary" className="font-semibold">
                  {formatNumber(extraLb)}
                </Text>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                <Text role="primary" className="font-semibold">
                  {formatMMK(amount)}
                </Text>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}

interface DashboardState {
  view: DashboardView | null
  riceTypes: RiceType[]
  error: string | null
  lbPerTin: number
}

/** §3.2 — Home period choices (mutually exclusive; default = Today). */
const PERIODS: ReadonlyArray<{ id: DashboardPeriod; my: string; en: string }> = [
  { id: 'today', my: 'ဒီနေ့', en: 'Today' },
  { id: 'month', my: 'လစဉ်', en: 'Monthly' },
  { id: 'year', my: 'နှစ်စု', en: 'Yearly' },
]

export function DashboardPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  // Period + paddy-type selection (reference Home control row).
  const [period, setPeriod] = useState<DashboardPeriod>('today')
  const [riceTypeId, setRiceTypeId] = useState<number | null>(null)
  const [state, setState] = useState<DashboardState>({
    view: null,
    riceTypes: [],
    error: null,
    lbPerTin: 50,
  })

  useEffect(() => {
    if (!dbReady) return
    let alive = true
    try {
      const db = getDatabase()
      // Filter options + display scale.
      const riceTypes = listRiceTypes(db, true)
      const lbPerTin = settingsService.lbPerTin(db)
      // §3.2 — view data for the selected calendar period + paddy type.
      // Reuses the stored-snapshot aggregators; nothing re-derived here.
      const view = getDashboardView(db, period, riceTypeId)
      if (alive) setState({ view, riceTypes, error: null, lbPerTin })
    } catch (e) {
      if (alive) {
        setState({
          view: null,
          riceTypes: [],
          error: e instanceof Error ? e.message : String(e),
          lbPerTin: 50,
        })
      }
    }
    return () => {
      alive = false
    }
  }, [dbReady, period, riceTypeId])

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
  if (!state.view) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="dashboard">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  const { view, riceTypes, lbPerTin } = state
  const summaryTitle =
    period === 'today'
      ? t({ my: 'ဒီနေ့', en: 'Today' })
      : period === 'month'
        ? t({ my: 'ဒီလ', en: 'This Month' })
        : t({ my: 'ဒီနှစ်', en: 'This Year' })
  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="dashboard">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'ပင်မစာမျက်နှာ', en: 'Dashboard' })}
      </Text>

      {/* Period toggle + paddy-type filter — reference Home control row
          (mutually exclusive segments; active = accent). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex overflow-hidden rounded-lg border border-border sm:col-span-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              aria-pressed={period === p.id}
              className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                period === p.id
                  ? 'bg-accent text-accent-text'
                  : 'text-content-muted hover:bg-surface-hover'
              }`}
            >
              {t({ my: p.my, en: p.en })}
            </button>
          ))}
        </div>
        <select
          value={riceTypeId ?? ''}
          onChange={(e) => setRiceTypeId(e.target.value === '' ? null : Number(e.target.value))}
          aria-label={t({ my: 'စပါးအမျိုးအစား ရွေးချယ်ရန်', en: 'Filter by paddy type' })}
          className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
        >
          <option value="">{t({ my: 'အမျိုးအစား အားလုံး', en: 'All Paddy Types' })}</option>
          {riceTypes.map((rt) => (
            <option key={rt.id} value={rt.id}>
              {rt.name}
            </option>
          ))}
        </select>
      </div>

      {/* Summary for the selected period (single card, not a fixed row). */}
      <SummaryCard title={summaryTitle} summary={view.summary} lbPerTin={lbPerTin} />
      {/* Per-date grouped tables (newest date first), each with a
          column-wise Total row. */}
      {view.dateGroups.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <Text role="muted">{t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}</Text>
        </section>
      ) : (
        view.dateGroups.map((dg) => (
          <DateGroupSection key={dg.date} date={dg.date} groups={dg.groups} lbPerTin={lbPerTin} />
        ))
      )}
    </div>
  )
}

export default DashboardPage
