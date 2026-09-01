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

/** Reference-style summary chip (Home totals strip). */
function SummaryChip({
  label,
  value,
  highlight = false,
}: {
  label: string
  value: string
  highlight?: boolean
}): JSX.Element {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-accent/20' : 'bg-background'}`}>
      <Text role="muted" className="block truncate text-[11px] font-medium uppercase tracking-wide">
        {label}
      </Text>
      <Text
        role="primary"
        className={`mt-0.5 block truncate text-base font-bold ${highlight ? 'text-accent' : ''}`}
      >
        {value}
      </Text>
    </div>
  )
}

/** Home totals strip for the selected period + paddy type (reference layout:
 *  six summary chips; Pound = NET pound, tin decomposes it). */
function SummaryStrip({
  title,
  summary,
  farmers,
  lbPerTin,
}: {
  title: string
  summary: PeriodSummary
  farmers: number
  lbPerTin: number
}): JSX.Element {
  const t = useT()
  // §6.3 — Tin + Extra Lb decomposition uses NET POUND, never gross.
  const { tins, extraLb } = decomposeNetPound(summary.total_net_pound, lbPerTin)
  return (
    <section className="rounded-lg border border-border bg-surface p-3">
      <Text as="h3" role="header" className="mb-2 text-sm font-semibold">
        {title}
      </Text>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <SummaryChip
          label={t({ my: 'လယ်သမား', en: 'Customers' })}
          value={formatNumber(farmers)}
        />
        <SummaryChip
          label={t({ my: 'ဝယ်ယူမှု', en: 'Purchases' })}
          value={formatNumber(summary.purchase_count)}
        />
        <SummaryChip
          label={t({ my: 'အိတ်', en: 'Bags' })}
          value={formatNumber(summary.total_bags)}
        />
        <SummaryChip
          label={t({ my: 'ပေါင်', en: 'Pound' })}
          value={`${formatNumber(summary.total_net_pound)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
        />
        <SummaryChip
          label={t({ my: 'တင်း', en: 'Tin' })}
          value={`${formatTins(tins)} ${t({ my: 'တင်း +', en: 'Tin +' })} ${formatNumber(
            extraLb,
          )} ${t({ my: 'ပေါင်', en: 'lb' })}`}
        />
        <SummaryChip
          highlight
          label={t({ my: 'စုစုပေါင်းငွေ', en: 'Total Amount' })}
          value={formatMMK(summary.total_amount)}
        />
      </div>
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
    <tr className="border-b border-border last:border-b-0 hover:bg-surface-hover">
      <td className="w-10 px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{rowNo}</Text>
      </td>
      <td className="px-2 py-2 text-left">
        <Text role="primary" className="font-medium text-accent">{group.farmer_name}</Text>
      </td>
      <td className="px-2 py-2 text-left">
        <Text role="primary" className="text-content-secondary">{group.rice_type_name}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatNumber(group.price_per_tin)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="secondary">{formatNumber(group.total_bags)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary" className="font-medium">{formatNumber(group.net_pound)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatTins(tins)}</Text>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">
        <Text role="primary">{formatNumber(extraLb)}</Text>
      </td>
      <td className="bg-accent/10 px-2 py-2 text-right tabular-nums">
        <Text role="primary" className="font-semibold text-accent">{formatMMK(group.total_amount)}</Text>
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
      <div className="border-b border-border bg-accent/10 px-3 py-2">
        <Text role="primary" className="text-sm font-semibold tabular-nums text-accent-hover">
          {formatDateDMY(date)}
        </Text>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
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
                <Text role="header" className="font-semibold text-accent">{t({ my: 'တင်းဈေး', en: 'Price/Tin' })}</Text>
              </th>
              <th className="px-2 py-2 text-right">
                <Text role="header" className="font-semibold text-accent">{t({ my: 'အိတ်', en: 'Bags' })}</Text>
              </th>
              <th className="px-2 py-2 text-right">
                <Text role="header" className="font-semibold text-accent">{t({ my: 'ပေါင်', en: 'Pound' })}</Text>
              </th>
              <th className="px-2 py-2 text-right">
                <Text role="header" className="font-semibold text-accent">{t({ my: 'တင်း', en: 'Tin' })}</Text>
              </th>
              <th className="px-2 py-2 text-right">
                <Text role="header" className="font-semibold text-accent">{t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}</Text>
              </th>
              <th className="px-2 py-2 text-right">
                <Text role="header" className="font-semibold text-accent">{t({ my: 'ငွေ', en: 'Amount' })}</Text>
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
            <tr className="border-t border-border bg-accent/10">
              <td colSpan={4} className="px-2 py-2 text-right">
                <Text role="primary" className="font-semibold text-accent">
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
                <Text role="primary" className="font-semibold text-accent">
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
      {/* Home motto — replaces the plain "Dashboard" title. Serif italic reads
          as a quote; centered, fluid text sizes + wrapping keep it screen-fit
          on Android portrait and web without any webfont dependency
          (offline-first — uses the system serif stack). */}
      <Text
        as="h1"
        role="header"
        className="text-center font-serif text-base italic leading-snug tracking-wide text-accent-hover sm:text-lg md:text-xl"
      >
        <span aria-hidden="true" className="text-accent">“</span>
        Love and wisdom are the greatest treasures of life.
        <span aria-hidden="true" className="text-accent">”</span>
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

      {/* Summary strip for the selected period (reference Home totals UI). */}
      <SummaryStrip
        title={summaryTitle}
        summary={view.summary}
        farmers={view.farmerCount}
        lbPerTin={lbPerTin}
      />
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
