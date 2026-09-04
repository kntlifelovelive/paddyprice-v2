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
import { useEffect, useRef, useState } from 'react'

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
import { generateHomeSummaryPdf } from '@/services/pdf/service'
import { printerService } from '@/services/print/printerService'
import {
  formatDateDMY,
  formatMMK,
  formatNumber,
  formatTime12Short,
  formatTins,
  todayISO,
} from '@/shared/format'
import { useT } from '@/shared/hooks'
import { PdfIcon, PrintIcon, Text } from '@/shared/ui'
import type { PrintReceipt } from '@/types/print'
import type { RiceType } from '@/types'

/** Format YYYY-MM-DD as DD/MM/YYYY — the reference Home report's period line. */
function formatDateDisplay(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  return `${d}/${m}/${y}`
}

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

/** One date group: date header + group table. */
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
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!flash) return
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 3000)
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [flash])

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

  /** Reference Home period label/file-tag for the current view (today-based). */
  const reportMeta = () => {
    const now = todayISO()
    if (period === 'today') {
      return {
        title: 'DAILY REPORT',
        periodLabel: `Period: ${formatDateDisplay(now)}`,
        fileTag: `daily_${now}`,
        label: `DAILY ${now}`,
      }
    }
    if (period === 'month') {
      const ym = now.slice(0, 7)
      return {
        title: 'MONTHLY REPORT',
        periodLabel: `Period: ${ym}`,
        fileTag: `monthly_${ym}`,
        label: `MONTHLY ${ym}`,
      }
    }
    const y = now.slice(0, 4)
    return {
      title: 'YEARLY REPORT',
      periodLabel: `Period: ${y}`,
      fileTag: `yearly_${y}`,
      label: `YEARLY ${y}`,
    }
  }

  /** Export PDF — reference summary-PDF of the CURRENT period + filter. */
  const handlePdfClick = async (): Promise<void> => {
    if (!state.view) return
    setBusy(true)
    try {
      const view = state.view
      const { title, periodLabel, fileTag } = reportMeta()
      const typeName =
        riceTypeId != null ? riceTypes.find((rt) => rt.id === riceTypeId)?.name : undefined
      await generateHomeSummaryPdf({
        title,
        period_label: typeName ? `${periodLabel} · ${typeName}` : periodLabel,
        file_tag: typeName ? `${fileTag}_type${riceTypeId!}` : fileTag,
        // Same stored-snapshot group rows the Home table renders (never merged),
        // with Tin + Extra Lb decomposed from each row's net pound exactly as
        // the Home table shows it (`decomposeNetPound`).
        rows: view.groups.map((r) => {
          const { tins, extraLb } = decomposeNetPound(r.net_pound, state.lbPerTin)
          return {
            rice_type_name: r.rice_type_name,
            total_bags: r.total_bags,
            total_pound: r.net_pound,
            total_tin: tins,
            total_extra_lb: extraLb,
            price_100_tin: r.price_100_tin,
            total_amount: r.total_amount,
          }
        }),
        // Same summary source the Home totals strip consumes; the total Tin +
        // Extra Lb are the single decomposition of the total net pound (the
        // same values the Home strip displays).
        totals: (() => {
          const { tins, extraLb } = decomposeNetPound(view.summary.total_net_pound, state.lbPerTin)
          return {
            bags: view.summary.total_bags,
            pound: view.summary.total_net_pound,
            tin: tins,
            extra_lb: extraLb,
            amount: view.summary.total_amount,
          }
        })(),
      })
      setFlash({ kind: 'ok', text: t({ my: 'PDF ထုတ်ပြီးပါပြီ', en: 'PDF generated' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'PDF failed' })
    } finally {
      setBusy(false)
    }
  }

  /** 80mm thermal print — reference Home summary receipt, forced to 80mm. */
  const handlePrintClick = async (): Promise<void> => {
    if (!state.view) return
    setBusy(true)
    try {
      const view = state.view
      const db = getDatabase()
      const s = settingsService.load(db)
      const { label } = reportMeta()
      const now = new Date().toISOString()
      const typeName =
        riceTypeId != null ? riceTypes.find((rt) => rt.id === riceTypeId)?.name : undefined
      const receipt: PrintReceipt = {
        company_name: s.company_name,
        company_address: s.company_address,
        company_phone: s.company_phone,
        invoice_no: label,
        date: todayISO(),
        time: formatTime12Short(now),
        generated_at: now,
        farmer_name: '— ALL CUSTOMERS —',
        farmer_address: '',
        farmer_phone: '',
        rows: view.groups.map((r) => ({
          rice_type_name: r.rice_type_name,
          pounds: r.net_pound,
          tins: r.total_tins,
          price_100_tin: r.price_100_tin,
          price_per_tin: r.price_per_tin,
          amount: r.total_amount,
        })),
        bags: [],
        total_pounds: view.summary.total_net_pound,
        total_tins: view.summary.total_tins,
        total_amount: view.summary.total_amount,
        remark: typeName
          ? `Type: ${typeName}`
          : period === 'today'
            ? `Date: ${todayISO()}`
            : period === 'month'
              ? `Month: ${todayISO().slice(0, 7)}`
              : `Year: ${todayISO().slice(0, 4)}`,
      }
      // Reference forces the wide 80mm layout for the summary without changing
      // the saved printer setting (PrinterService.configure({...cfg, paperWidth:'80'})).
      await printerService.print(receipt, { paperWidth: '80' })
      setFlash({ kind: 'ok', text: t({ my: 'ပရင့်ထုတ်နေသည်', en: 'Printing' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Print failed' })
    } finally {
      setBusy(false)
    }
  }

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

      {/* Export / print — reference Home toolbar (filter-aware; disabled when no data). */}
      <div className="flex flex-wrap gap-2 sm:grid sm:max-w-md sm:grid-cols-2">
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
          disabled={busy || view.groups.length === 0}
          onClick={() => void handlePdfClick()}
        >
          <span className="inline-flex items-center gap-1.5">
            <PdfIcon className="h-4 w-4" />
            <span>{t({ my: 'PDF ထုတ်', en: 'Export PDF' })}</span>
          </span>
        </button>
        <button
          type="button"
          className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
          disabled={busy || view.groups.length === 0}
          onClick={() => void handlePrintClick()}
        >
          <span className="inline-flex items-center gap-1.5">
            <PrintIcon className="h-4 w-4" />
            <span>{t({ my: 'ပရင့် (80mm)', en: 'Print (80mm)' })}</span>
          </span>
        </button>
      </div>

      {flash && (
        <div
          role="status"
          className={`rounded border px-3 py-1.5 text-sm ${flash.kind === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}
        >
          {flash.text}
        </div>
      )}

      {/* Summary strip for the selected period (reference Home totals UI). */}
      <SummaryStrip
        title={summaryTitle}
        summary={view.summary}
        farmers={view.farmerCount}
        lbPerTin={lbPerTin}
      />
      {/* Per-date grouped tables (newest date first). */}
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
