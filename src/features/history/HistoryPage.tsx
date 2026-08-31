/**
 * History feature page (Step 8) — PROJECT_SPEC §3.2.
 *
 * Read-only purchase history. Display contracts (PROJECT_SPEC §2/§3/§4):
 * - "Total Pound" column shows the stored NET pound (never gross/deduction).
 * - Tin + Extra Lb decompose that net pound via the domain helper.
 * - Newest purchase first (DAO order: date DESC, id DESC) with visible NO in
 *   descending order — a UI convention only; stored ids/seq are untouched.
 * - Rows are grouped by date (newest date first) with a per-day summary row.
 * - Per-row actions: Edit (open the existing New Purchase page pre-filled),
 *   PDF (generate the voucher PDF), Print (open the thermal receipt).
 * - Semantic theme text tokens only; no hard-coded colors.
 */
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Database } from 'sql.js'

import { getDatabase } from '@/infrastructure/db'
import { deletePurchase } from '@/infrastructure/db/dao/purchases'
import { getHistoryRecords } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { formatDateDMY, formatMMK, formatNumber } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { DeleteIcon, EditIcon, PdfIcon, PrintIcon, SpinnerIcon, Text } from '@/shared/ui'
import type { PurchaseRecord } from '@/types'
import { generateVoucherPdf } from '@/services/pdf/service'
import { printReceipt } from '@/services/print/service'
import type { PrintReceipt } from '@/types/print'

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

function buildReceipt(record: PurchaseRecord, lbPerTin: number, company: { name: string; address: string; phone: string }): PrintReceipt {
  const s = record.snapshot
  // Each purchase is for a single paddy type at a single price (DOMAIN_RULES §3).
  // The receipt collapses all bags into one row using the snapshot values.
  const totalPounds = record.bags.reduce((sum, b) => sum + b.weight_lb, 0)
  return {
    company_name: company.name,
    company_address: company.address,
    company_phone: company.phone,
    invoice_no: s.purchase_no,
    date: s.date.split('T')[0] ?? '',
    time: '',
    generated_at: new Date().toISOString(),
    farmer_name: s.farmer_name,
    farmer_address: '',
    farmer_phone: '',
    rows: [{
      rice_type_name: s.rice_type_name,
      pounds: totalPounds || s.net_pound,
      tins: s.net_pound / lbPerTin,
      price_100_tin: s.price_100_tin,
      price_per_tin: s.price_per_tin,
      amount: s.total_amount,
    }],
    bags: record.bags.map((b, i) => ({ seq: i + 1, weight_lb: b.weight_lb })),
    total_pounds: s.net_pound,
    total_tins: s.net_pound / lbPerTin,
    total_amount: s.total_amount,
    remark: '',
  }
}

export function HistoryPage() {
  const t = useT()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)
  // Bumped after a delete so the data memo re-reads from the database.
  const [reloadKey, setReloadKey] = useState(0)
  const data = useMemo<{ data: HistoryData | null; error: string | null }>(() => {
    try {
      return { data: loadHistory(getDatabase()), error: null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error.message : 'Failed to load history' }
    }
  }, [reloadKey])

  /** Delete via the existing purchase DAO, guarded by a confirmation. */
  function handleDelete(record: PurchaseRecord): void {
    const s = record.snapshot
    const message = `${t({ my: 'ဤဝယ်ယူမှုအား ဖျက်မှာလား?', en: 'Delete this purchase?' })} (${s.purchase_no})`
    if (!window.confirm(message)) return
    try {
      deletePurchase(getDatabase(), s.id)
      setReloadKey((k) => k + 1)
      setFlash({ kind: 'ok', text: t({ my: 'ဖျက်ပြီးပါပြီ', en: 'Purchase deleted' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed' })
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

  async function handlePrint(record: PurchaseRecord, lbPerTin: number): Promise<void> {
    setBusyId(record.snapshot.id)
    try {
      const db = getDatabase()
      const s = settingsService.load(db)
      const receipt = buildReceipt(record, lbPerTin, {
        name: s.company_name,
        address: s.company_address,
        phone: s.company_phone,
      })
      printReceipt(receipt)
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

  if (records.length === 0) {
    return (
      <div className="p-3 sm:p-4" data-page="history">
        <Text as="h1" role="header" className="mb-3 text-lg font-semibold">
          {t({ my: 'အရောင်းမှတ်တမ်း', en: 'History' })}
        </Text>
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-content-muted">
          {t({ my: 'အရောင်းမှတ်တမ်း မရှိသေးပါ', en: 'No purchases yet' })}
        </div>
      </div>
    )
  }

  // Group records by `date` (YYYY-MM-DD), newest date first. The date is
  // already a sortable YYYY-MM-DD string, so group keys sort lexically.
  const groups = new Map<string, PurchaseRecord[]>()
  for (const record of records) {
    const date = record.snapshot.date.split('T')[0] ?? record.snapshot.date
    const list = groups.get(date) ?? []
    list.push(record)
    groups.set(date, list)
  }
  const sortedDates = Array.from(groups.keys()).sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

  return (
    <div className="space-y-3 p-3 sm:p-4" data-page="history">
      <Text as="h1" role="header" className="text-lg font-semibold text-accent">
        {t({ my: 'အရောင်းမှတ်တမ်း', en: 'History' })}
      </Text>
      {flash && (
        <div role="status" className={`rounded border px-3 py-1.5 text-sm ${flash.kind === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {flash.text}
        </div>
      )}
      {sortedDates.map((date) => {
        const group = groups.get(date) ?? []
        const gBags = group.reduce((s, r) => s + r.snapshot.total_bags, 0)
        const gPound = group.reduce((s, r) => s + r.snapshot.net_pound, 0)
        const gAmount = group.reduce((s, r) => s + r.snapshot.total_amount, 0)
        return (
          <section key={date} className="overflow-hidden rounded-lg border border-border bg-surface">
            <div className="flex items-center justify-between border-b border-border bg-accent/10 px-3 py-2">
              <Text as="h2" role="header" className="text-sm font-semibold text-accent">
                {formatDateDMY(date)}
              </Text>
              <div className="flex items-center gap-3 text-xs tabular-nums text-content-muted">
                <span>{group.length} × {t({ my: 'အရောင်း', en: 'sales' })}</span>
                <span>{formatNumber(gBags)} {t({ my: 'အိတ်', en: 'bags' })}</span>
                <span>{formatNumber(gPound)} {t({ my: 'ပေါင်', en: 'lb' })}</span>
                <span className="font-semibold text-content-secondary">{formatMMK(gAmount)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table data-testid="history-table" className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'အစဉ်', en: 'NO' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'အရောင်းနံပါတ်', en: 'Purchase No' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'အမည်', en: 'Name' })}</th>
                    <th className="px-2 py-2 text-left font-semibold text-content-header text-accent">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'အိတ်', en: 'Bags' })}</th>
                    <th className="px-2 py-2 text-right font-semibold text-content-header text-accent">{t({ my: 'ပေါင်', en: 'Pound' })}</th>
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
                        <td className="px-2 py-2 text-right tabular-nums text-content-secondary">{s.total_bags}</td>
                        {/* NET pound (§3) — never gross or deduction. */}
                        <td className="px-2 py-2 text-right tabular-nums text-content-primary font-medium">{formatNumber(s.net_pound)}</td>
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
                              onClick={() => { void handlePrint(record, lbPerTin) }}
                              disabled={busyId === s.id}
                              title={t({ my: 'ပရင့်', en: 'Print' })}
                              aria-label={t({ my: 'ပရင့်ထုတ်မည်', en: 'Print Receipt' })}
                              className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50"
                            >
                              <PrintIcon size="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              title={t({ my: 'ဖျက်', en: 'Delete' })}
                              aria-label={t({ my: 'ဝယ်ယူမှု ဖျက်ရန်', en: 'Delete purchase' })}
                              className="rounded p-1 text-danger hover:bg-surface-hover"
                            >
                              <DeleteIcon size="h-4 w-4" />
                            </button>
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
    </div>
  )
}

export default HistoryPage
