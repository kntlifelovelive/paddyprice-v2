/**
 * History feature page (Step 8) — PROJECT_SPEC §3.2.
 *
 * Read-only purchase history. Display contracts (PROJECT_SPEC §2/§3/§4):
 * - "Total Pound" column shows the stored NET pound (never gross/deduction).
 * - Tin + Extra Lb decompose that net pound via the domain helper.
 * - Newest purchase first (DAO order: date DESC, id DESC) with visible NO in
 *   descending order — a UI convention only; stored ids/seq are untouched.
 * - Rows are grouped by date with a per-day summary row; a reference-concept
 *   sort toggle flips newest/oldest first (view state only).
 * - Reference-concept toolbar/filter bar (~/paddyprice HistoryPage): customer
 *   filter (navigates to /history/:farmerId), paddy-type filter, Bag Weights
 *   PDF (existing P2 service), New Purchase link, date-range inputs, Clear,
 *   sort toggle. All filters are local view state over the loaded records.
 * - Per-row actions: Edit (open the existing New Purchase page pre-filled),
 *   PDF (generate the voucher PDF), Print (open the thermal receipt),
 *   Delete (delete-lock: when an App Lock credential exists the row is locked
 *   by default and the EXISTING security verification must succeed first —
 *   unlocks are tracked by the record's STABLE farmer_id, never by name —
 *   then the modal ConfirmDialog confirmation, as in the reference).
 * - Semantic theme text tokens only; no hard-coded colors.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Database } from 'sql.js'

import { getDatabase } from '@/infrastructure/db'
import { deletePurchase } from '@/infrastructure/db/dao/purchases'
import * as farmersDao from '@/infrastructure/db/dao/farmers'
import * as riceTypesDao from '@/infrastructure/db/dao/riceTypes'
import { getHistoryRecords } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { formatDateDMY, formatMMK, formatNumber, formatTins } from '@/shared/format'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import { useT } from '@/shared/hooks'
import {
  ConfirmDialog,
  CredentialUnlockDialog,
  DeleteIcon,
  EditIcon,
  GalleryIcon,
  LockIcon,
  PdfIcon,
  PlusIcon,
  PrintIcon,
  SpinnerIcon,
  Text,
  UnlockIcon,
} from '@/shared/ui'
import type { PurchaseRecord } from '@/types'
import {
  readCredentialAvailability,
  verifyAppLockCredential,
  type CredentialAvailability,
} from '@/services/security/credential-verify'
import { generateBagWeightDetailsPdf, generateVoucherPdf } from '@/services/pdf/service'
import { generateVoucherPng } from '@/services/png/service'
import { printerService } from '@/services/print/printerService'
import type { PrintReceipt } from '@/types/print'

interface HistoryData {
  records: PurchaseRecord[]
  lbPerTin: number
  /** Toolbar dropdown sources (reference HistoryPage concept). */
  farmers: ReturnType<typeof farmersDao.listFarmers>
  riceTypes: ReturnType<typeof riceTypesDao.listRiceTypes>
  /** Presence flags of the configured App Lock credentials (no secrets). */
  cred: ReturnType<typeof readCredentialAvailability>
}

function loadHistory(db: Database): HistoryData {
  return {
    records: getHistoryRecords(db),
    lbPerTin: settingsService.lbPerTin(db),
    farmers: farmersDao.listFarmers(db),
    riceTypes: riceTypesDao.listRiceTypes(db, false),
    cred: readCredentialAvailability(db),
  }
}

function buildReceipt(
  record: PurchaseRecord,
  company: { name: string; address: string; phone: string },
  farmer: { address: string; phone: string },
): PrintReceipt {
  const s = record.snapshot
  // Reference receiptBuilder mapping (~/paddyprice): the receipt's row pounds
  // and Total Pound come from the purchase's STORED totals (gross pound) and
  // tins from the STORED total tins. All values are the snapshot's own —
  // nothing is recomputed at output time.
  return {
    company_name: company.name,
    company_address: company.address,
    company_phone: company.phone,
    invoice_no: s.purchase_no,
    date: s.date.split('T')[0] ?? '',
    // The snapshot does not store the creation time; the reference prints a
    // dash in the same situation (created_at unavailable).
    time: '—',
    generated_at: new Date().toISOString(),
    farmer_name: s.farmer_name,
    farmer_address: farmer.address,
    farmer_phone: farmer.phone,
    rows: [{
      rice_type_name: s.rice_type_name,
      pounds: s.gross_pound,
      tins: s.total_tins,
      price_100_tin: s.price_100_tin,
      price_per_tin: s.price_per_tin,
      amount: s.total_amount,
    }],
    bags: record.bags.map((b, i) => ({ seq: i + 1, weight_lb: b.weight_lb })),
    total_pounds: s.gross_pound,
    total_tins: s.total_tins,
    total_amount: s.total_amount,
    remark: '',
  }
}

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Toast auto-dismisses after 3s (reference `show()` behavior). Fixes the
  // reported bug where the PDF-export banner (e.g. share-sheet dismissal)
  // never disappears from the UI.
  useEffect(() => {
    if (!flash) return
    if (flashTimer.current) clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 3000)
    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current)
    }
  }, [flash])
  // Bumped after a delete so the data memo re-reads from the database.
  const [reloadKey, setReloadKey] = useState(0)
  // Reference-concept view state — purely local UI filtering/sorting over the
  // already-loaded records. No DAO, service, or business-logic change.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [paddyTypeFilter, setPaddyTypeFilter] = useState('')
  const [sortDesc, setSortDesc] = useState(true)
  /** Toolbar customer filter — selecting one navigates to the per-farmer
   * History drilldown (`/history/:farmerId`), as in the reference project. */
  const [farmerSelect, setFarmerSelect] = useState('')
  const [bagPdfBusy, setBagPdfBusy] = useState(false)
  // Reference UI concept: deletes are confirmed with a modal ConfirmDialog.
  const [deleteTarget, setDeleteTarget] = useState<PurchaseRecord | null>(null)
  // Delete-protection for customer-owned history records (same concept as the
  // Customer page): locked by default when an App Lock credential exists.
  // Unlocks are tracked by the record's STABLE farmer_id — never by name — so
  // two customers with identical names unlock/delete independently.
  const [unlockedFarmerIds, setUnlockedFarmerIds] = useState<Set<number>>(new Set())
  const [unlockTarget, setUnlockTarget] = useState<PurchaseRecord | null>(null)
  const [credAvail, setCredAvail] = useState<CredentialAvailability>({ hasPattern: false, hasPin: false })
  const data = useMemo<{ data: HistoryData | null; error: string | null }>(() => {
    try {
      return { data: loadHistory(getDatabase()), error: null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Failed to load history' }
    }
  }, [reloadKey])

  /** Delete via the existing purchase DAO — confirmed by ConfirmDialog. */
  function handleDelete(record: PurchaseRecord): void {
    try {
      deletePurchase(getDatabase(), record.snapshot.id)
      setReloadKey((k) => k + 1)
      setFlash({ kind: 'ok', text: t({ my: 'ဖျက်ပြီးပါပြီ', en: 'Purchase deleted' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' })
    } finally {
      setDeleteTarget(null)
      // Return the deleted record's customer to the locked state.
      setUnlockedFarmerIds((prev) => {
        const next = new Set(prev)
        next.delete(record.snapshot.farmer_id)
        return next
      })
    }
  }

  /** Open the credential dialog for a record — reads configured App Lock
      credentials fresh so the dialog offers exactly the right method(s). */
  function openUnlock(record: PurchaseRecord): void {
    try {
      setCredAvail(readCredentialAvailability(getDatabase()))
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Security check failed' })
      return
    }
    setUnlockTarget(record)
  }

  function handleUnlock(record: PurchaseRecord): void {
    setUnlockedFarmerIds((prev) => new Set(prev).add(record.snapshot.farmer_id))
    setUnlockTarget(null)
  }

  function handleRelock(record: PurchaseRecord): void {
    setUnlockedFarmerIds((prev) => {
      const next = new Set(prev)
      next.delete(record.snapshot.farmer_id)
      return next
    })
  }

  /**
   * Reference-concept "Bag Weights PDF" toolbar action, backed by P2's
   * existing bag-weights PDF service. Requires a selected customer (as in
   * the reference); the current date-range and paddy-type filters narrow it.
   */
  async function handleBagWeightsPdf(): Promise<void> {
    if (farmerSelect === '') {
      setFlash({ kind: 'err', text: t({ my: 'ကျေးဇူးပြု၍ ဝယ်ယူသည့်သူ ရွေးပါ', en: 'Please select a customer first.' }) })
      return
    }
    setBagPdfBusy(true)
    try {
      await generateBagWeightDetailsPdf(
        Number(farmerSelect),
        paddyTypeFilter === '' ? null : Number(paddyTypeFilter),
        dateFrom,
        dateTo,
        0,
      )
      setFlash({ kind: 'ok', text: t({ my: 'PDF ထုတ်ပြီးပါပြီ', en: 'PDF generated' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'PDF failed' })
    } finally {
      setBagPdfBusy(false)
    }
  }

  async function handlePdf(purchaseId: number): Promise<void> {
    setBusyId(purchaseId)
    try {
      await generateVoucherPdf(purchaseId)
      setFlash({ kind: 'ok', text: t({ my: 'PDF ထုတ်ပြီးပါပြီ', en: 'PDF generated' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'PDF failed' })
    } finally {
      setBusyId(null)
    }
  }

  async function handlePng(purchaseId: number): Promise<void> {
    setBusyId(purchaseId)
    try {
      const result = await generateVoucherPng(purchaseId)
      setFlash({
        kind: 'ok',
        text: t({
          my: `PNG ထုတ်ပြီးပါပြီ (${result.pageCount} မျက်နှာ)`,
          en: `PNG exported (${result.pageCount} page${result.pageCount > 1 ? 's' : ''})`,
        }),
      })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'PNG failed' })
    } finally {
      setBusyId(null)
    }
  }

  async function handlePrint(record: PurchaseRecord): Promise<void> {
    if (!data?.data) return
    setBusyId(record.snapshot.id)
    try {
      const db = getDatabase()
      const s = settingsService.load(db)
      const farmer = data.data.farmers.find((f) => f.id === record.snapshot.farmer_id)
      const receipt = buildReceipt(
        record,
        { name: s.company_name, address: s.company_address, phone: s.company_phone },
        { address: farmer?.address ?? '', phone: farmer?.phone ?? '' },
      )
      await printerService.print(receipt)
      setFlash({ kind: 'ok', text: t({ my: 'ပရင့်ထုတ်နေသည်', en: 'Printing' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Print failed' })
    } finally {
      setBusyId(null)
    }
  }

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
        <Text role="muted">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  const { records, lbPerTin } = data.data
  // Tin + Extra Lb per record — ONE decomposition from the EXISTING domain
  // result (`decomposeNetPound`, the same source the per-farmer drilldown and
  // the PDF voucher consume). The Tins column shows the whole-tin floor and
  // the Extra Lb column shows its remainder — never two different calcs.
  const breakdownById = useMemo(() => {
    const m = new Map<number, ReturnType<typeof decomposeNetPound>>()
    for (const r of records) {
      m.set(r.snapshot.id, decomposeNetPound(r.snapshot.net_pound, lbPerTin))
    }
    return m
  }, [records, lbPerTin])
  // Delete-lock is active when any App Lock credential is configured.
  const securityEnabled = data.data.cred.hasPattern || data.data.cred.hasPin

  /** Purchase date (YYYY-MM-DD part) of a record. */
  const dateOf = (r: PurchaseRecord): string => r.snapshot.date.split('T')[0] ?? r.snapshot.date

  // Reference-concept local filtering: date range + paddy type. Applied to
  // the already-loaded records only — view state, never persistence.
  const filtered = records.filter((r) => {
    const d = dateOf(r)
    if (dateFrom && d < dateFrom) return false
    if (dateTo && d > dateTo) return false
    if (paddyTypeFilter !== '' && r.snapshot.rice_type_id !== Number(paddyTypeFilter)) return false
    return true
  })

  // Group records by `date` (YYYY-MM-DD). The date is already a sortable
  // YYYY-MM-DD string, so group keys sort lexically; the reference-concept
  // sort toggle flips newest/oldest first.
  const groups = new Map<string, PurchaseRecord[]>()
  for (const record of filtered) {
    const date = dateOf(record)
    const list = groups.get(date) ?? []
    list.push(record)
    groups.set(date, list)
  }
  const sortedDates = Array.from(groups.keys()).sort((a, b) => {
    if (a === b) return 0
    return a < b ? (sortDesc ? 1 : -1) : sortDesc ? -1 : 1
  })

  return (
    <div className="space-y-3 p-3 sm:p-4" data-page="history">
      {/* Title + toolbar (reference HistoryPage concept) */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Text as="h1" role="header" className="text-lg font-semibold text-accent-hover">
          {t({ my: 'အရောင်းမှတ်တမ်း', en: 'History' })}
        </Text>
        <div className="flex flex-wrap items-center gap-2">
          {/* Customer filter — navigates to the per-farmer drilldown */}
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={farmerSelect}
            aria-label={t({ my: 'ဝယ်ယူသည့်သူ', en: 'Filter by customer' })}
            onChange={(e) => {
              const value = e.target.value
              setFarmerSelect(value)
              if (value !== '') navigate(`/history/${value}`)
            }}
          >
            <option value="">{t({ my: '— ဝယ်ယူသည့်သူ —', en: '— Customers —' })}</option>
            {data.data.farmers.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {/* Paddy type filter — narrows the table and the Bag Weights PDF */}
          <select
            className="rounded border border-border bg-background px-2 py-1.5 text-sm"
            value={paddyTypeFilter}
            aria-label={t({ my: 'စပါးအမျိုးအစား', en: 'Filter by paddy type' })}
            onChange={(e) => setPaddyTypeFilter(e.target.value)}
          >
            <option value="">{t({ my: '— အမျိုးအစား အားလုံး —', en: '— All Paddy Types —' })}</option>
            {data.data.riceTypes.map((rt) => (
              <option key={rt.id} value={rt.id}>
                {rt.name}
              </option>
            ))}
          </select>
          {/* Bag Weights PDF — P2's existing bag-weights PDF service */}
          <button
            type="button"
            disabled={farmerSelect === '' || bagPdfBusy}
            title={
              farmerSelect === ''
                ? t({ my: 'ဝယ်ယူသည့်သူ ရွေးပါ', en: 'Select a customer first' })
                : t({ my: 'အိတ် အလေးချိန် PDF', en: 'Bag Weights PDF' })
            }
            onClick={() => void handleBagWeightsPdf()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover disabled:opacity-50"
          >
            {bagPdfBusy ? <SpinnerIcon size="h-4 w-4 animate-spin" /> : <PdfIcon size="h-4 w-4" />}
            {t({ my: 'အိတ် အလေးချိန် PDF', en: 'Bag Weights PDF' })}
          </button>
          {/* New Purchase (reference toolbar link, plus icon) */}
          <Link
            to="/purchase/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            <PlusIcon size="h-4 w-4" />
            {t({ my: 'အသစ်ဝယ်', en: 'New Purchase' })}
          </Link>
        </div>
      </div>
      {flash && (
        <div role="status" className={`rounded border px-3 py-1.5 text-sm ${flash.kind === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {flash.text}
        </div>
      )}
      {/* Filter bar: date range + sort order (reference concept) */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
        <label className="flex items-center gap-2">
          <Text role="secondary">{t({ my: 'ရက်စွဲ အစ', en: 'Date From' })}</Text>
          <input
            type="date"
            className="rounded border border-border bg-background px-2 py-1 font-mono"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <Text role="secondary">{t({ my: 'ရက်စွဲ အဆုံး', en: 'Date To' })}</Text>
          <input
            type="date"
            className="rounded border border-border bg-background px-2 py-1 font-mono"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
            className="rounded px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
          >
            {t({ my: 'ဖျက်သုတ်', en: 'Clear' })}
          </button>
        )}
        <button
          type="button"
          onClick={() => setSortDesc((d) => !d)}
          className="ml-auto rounded-lg border border-border bg-surface px-3 py-1.5 text-xs hover:bg-surface-hover"
        >
          {sortDesc
            ? t({ my: 'နောက်ဆုံး အရင် ↓', en: 'Newest first ↓' })
            : t({ my: 'အသည်း အရင် ↑', en: 'Oldest first ↑' })}
        </button>
      </section>

      {sortedDates.map((date) => {
        const group = groups.get(date) ?? []
        const gBags = group.reduce((s, r) => s + r.snapshot.total_bags, 0)
        const gPound = group.reduce((s, r) => s + r.snapshot.net_pound, 0)
        const gAmount = group.reduce((s, r) => s + r.snapshot.total_amount, 0)
        const gTins = group.reduce((s, r) => s + r.snapshot.total_tins, 0)
        return (
          <section key={date} className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-accent/10 px-3 py-2">
              <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
                {formatDateDMY(date)}
              </Text>
              <div className="flex items-center gap-3 text-xs tabular-nums text-content-muted">
                <span>{group.length} × {t({ my: 'အရောင်း', en: 'sales' })}</span>
                <span>{formatNumber(gBags)} {t({ my: 'အိတ်', en: 'bags' })}</span>
                <span>{formatNumber(gPound)} {t({ my: 'ပေါင်', en: 'lb' })}</span>
                <span>{formatTins(gTins)} {t({ my: 'တင်း', en: 'tins' })}</span>
                <span className="font-semibold text-content-secondary">{formatMMK(gAmount)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table data-testid="history-table" className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'အစဉ်', en: 'NO' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'အရောင်းနံပါတ်', en: 'Purchase No' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'အမည်', en: 'Name' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'စျေးနှုန်း', en: 'Price' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'အိတ်', en: 'Bags' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'ပေါင်', en: 'Pound' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'တင်း', en: 'Tin' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'ငွေ', en: 'Amount' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</th>
                  </tr>
                </thead>
                <tbody>
                  {group.map((record, index) => {
                    const s = record.snapshot
                    return (
                      <tr key={s.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                        <td className="px-2 py-2 text-right tabular-nums text-content-muted">
                          {group.length - index}
                        </td>
                        <td className="px-2 py-2">
                          <Text role="primary" className="font-medium tabular-nums">{s.purchase_no}</Text>
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/history/${s.farmer_id}`)}
                            className="font-medium text-accent hover:underline"
                          >
                            {s.farmer_name}
                          </button>
                        </td>
                        <td className="px-2 py-2 text-content-secondary">{s.rice_type_name}</td>
                        {/* Price snapshot (reference column): 100-tin price with per-tin hint. */}
                        <td className="px-2 py-2 text-right font-mono text-xs tabular-nums">
                          {formatMMK(s.price_100_tin)}
                          <span className="ml-1 text-content-muted">
                            ({formatMMK(s.price_per_tin)}/{t({ my: 'တင်း', en: 'tin' })})
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{s.total_bags}</td>
                        {/* NET pound (§3) — never gross or deduction. */}
                        <td className="px-2 py-2 text-right tabular-nums text-content-primary font-medium">{formatNumber(s.net_pound)}</td>
                        {/* Whole Tin + Extra Lb — both from the same domain
                            decomposition (never the stored exact tins alone). */}
                        <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{formatTins(breakdownById.get(s.id)?.tins ?? 0)}</td>
                        <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{formatNumber(breakdownById.get(s.id)?.extraLb ?? 0)}</td>
                        <td className="bg-accent/10 px-2 py-2 text-right tabular-nums text-accent font-semibold">{formatMMK(s.total_amount)}</td>
                        <td className="px-2 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => navigate(`/purchase/${s.id}`)}
                              title={t({ my: 'ပြင်ဆင်', en: 'Edit' })}
                              aria-label={t({ my: 'ဝယ်ယူမှု ပြင်ရန်', en: 'Edit purchase' })}
                              className="rounded p-1 text-warning hover:bg-surface-hover"
                            >
                              <EditIcon size="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handlePdf(s.id) }}
                              disabled={busyId === s.id}
                              title={t({ my: 'PDF', en: 'PDF' })}
                              aria-label={t({ my: 'PDF ထုတ်မည်', en: 'Export PDF' })}
                              className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50"
                            >
                              {busyId === s.id ? <SpinnerIcon size="h-4 w-4 animate-spin" /> : <PdfIcon size="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handlePng(s.id) }}
                              disabled={busyId === s.id}
                              title={t({ my: 'PNG', en: 'PNG' })}
                              aria-label={t({ my: 'PNG ထုတ်မည်', en: 'Export PNG' })}
                              className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50"
                            >
                              <GalleryIcon size="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => { void handlePrint(record) }}
                              disabled={busyId === s.id}
                              title={t({ my: 'ပရင့်', en: 'Print' })}
                              aria-label={t({ my: 'ပရင့်ထုတ်မည်', en: 'Print Receipt' })}
                              className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50"
                            >
                              <PrintIcon size="h-4 w-4" />
                            </button>
                            {securityEnabled ? (
                              unlockedFarmerIds.has(s.farmer_id) ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleRelock(record)}
                                    title={t({ my: 'သော့ခတ်ရန်', en: 'Re-lock delete' })}
                                    aria-label={t({ my: 'သော့ခတ်ရန်', en: 'Re-lock delete' })}
                                    className="rounded p-1 text-success hover:bg-surface-hover"
                                  >
                                    <UnlockIcon size="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setDeleteTarget(record)}
                                    title={t({ my: 'ဖျက်', en: 'Delete' })}
                                    aria-label={t({ my: 'ဝယ်ယူမှု ဖျက်ရန်', en: 'Delete purchase' })}
                                    className="rounded p-1 text-danger hover:bg-surface-hover"
                                  >
                                    <DeleteIcon size="h-4 w-4" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openUnlock(record)}
                                  title={t({ my: 'ဖျက်ရန် သော့ဖွင့်ပါ', en: 'Unlock to delete' })}
                                  aria-label={t({ my: 'ဖျက်ရန် သော့ဖွင့်ပါ', en: 'Unlock to delete' })}
                                  className="rounded p-1 text-danger hover:bg-surface-hover"
                                >
                                  <LockIcon size="h-4 w-4" aria-label="Locked" />
                                </button>
                              )
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDeleteTarget(record)}
                                title={t({ my: 'ဖျက်', en: 'Delete' })}
                                aria-label={t({ my: 'ဝယ်ယူမှု ဖျက်ရန်', en: 'Delete purchase' })}
                                className="rounded p-1 text-danger hover:bg-surface-hover"
                              >
                                <DeleteIcon size="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )
      })}

      {/* Reference-concept empty state — shown when no records match. */}
      {sortedDates.length === 0 && (
        <section className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-content-muted">
          {t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}
        </section>
      )}

      {/* Reference UI concept: delete confirmation via modal dialog. */}
      <ConfirmDialog
        open={deleteTarget != null}
        title={t({ my: 'ဝယ်ယူမှု ဖျက်ရန်', en: 'Delete purchase' })}
        message={`${t({ my: 'ဤဝယ်ယူမှုအား ဖျက်မှာလား?', en: 'Delete this purchase?' })} (${deleteTarget?.snapshot.purchase_no ?? ''}) — ${t({ my: 'ပြန်ပြင်၍ မရနိုင်ပါ', en: 'this cannot be undone.' })}`}
        confirmLabel={t({ my: 'ဖျက်', en: 'Delete' })}
        cancelLabel={t({ my: 'ပယ်ဖျက်', en: 'Cancel' })}
        danger
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget)
        }}
      />

      {/* Delete-lock credential dialog — verifies the EXISTING App Lock
          credential (pattern/PIN). Keyed to the record's farmer_id by the
          unlock handlers; wrong credential simply keeps the row locked. */}
      {unlockTarget && (
        <CredentialUnlockDialog
          title={t({ my: 'ဝယ်ယူမှု ဖျက်ရန်', en: 'Delete purchase' })}
          message={`${unlockTarget.snapshot.purchase_no} — ${unlockTarget.snapshot.farmer_name}`}
          hasPattern={credAvail.hasPattern}
          hasPin={credAvail.hasPin}
          onVerify={(attempt) => verifyAppLockCredential(getDatabase(), attempt)}
          onSuccess={() => handleUnlock(unlockTarget)}
          onClose={() => setUnlockTarget(null)}
        />
      )}
    </div>
  )
}

export default HistoryPage
