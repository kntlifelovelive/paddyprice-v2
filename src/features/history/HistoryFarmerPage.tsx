/**
 * Per-farmer History drilldown (Step 8) - PROJECT_SPEC §3.2.
 *
 * Routes from the History page when a user picks a farmer. Shows every
 * purchase for that farmer (newest first) plus a per-farmer summary card.
 * Same display contracts as the main History page (NET pound, Tin + Extra Lb).
 * Per-row actions: PDF (voucher) and Print (thermal receipt).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { getDatabase } from '@/infrastructure/db'
import { getFarmer } from '@/infrastructure/db/dao/farmers'
import { getHistoryRecords } from '@/services/reports'
import { settingsService } from '@/services/settings'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import { formatDateDMY, formatMMK, formatNumber, formatTins } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { BackIcon, PdfIcon, PrintIcon, SpinnerIcon, Text } from '@/shared/ui'
import { generateVoucherPdf } from '@/services/pdf/service'
import { printReceipt } from '@/services/print/service'
import type { PrintReceipt } from '@/types/print'
import type { PurchaseRecord } from '@/types'

interface PageData {
  farmerName: string
  rows: ReturnType<typeof getHistoryRecords>
  lbPerTin: number
  totalAmount: number
  totalNetPound: number
  totalBags: number
  purchaseCount: number
}

function buildReceipt(record: PurchaseRecord, lbPerTin: number, company: { name: string; address: string; phone: string }): PrintReceipt {
  const s = record.snapshot
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

export function HistoryFarmerPage(): JSX.Element {
  const t = useT()
  const { farmerId: farmerIdParam } = useParams<{ farmerId: string }>()
  const farmerId = farmerIdParam ? Number(farmerIdParam) : NaN
  const navigate = useNavigate()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  useEffect(() => {
    if (Number.isNaN(farmerId)) { setError('Invalid farmer id'); return }
    try {
      const db = getDatabase()
      const farmer = getFarmer(db, farmerId)
      if (!farmer) { setError('Farmer not found'); return }
      const records = getHistoryRecords(db, { farmer_id: farmerId })
      const lbPerTin = settingsService.lbPerTin(db)
      const totalAmount = records.reduce((sum, r) => sum + r.snapshot.total_amount, 0)
      const totalNetPound = records.reduce((sum, r) => sum + r.snapshot.net_pound, 0)
      const totalBags = records.reduce((sum, r) => sum + r.snapshot.total_bags, 0)
      setData({ farmerName: farmer.name, rows: records, lbPerTin, totalAmount, totalNetPound, totalBags, purchaseCount: records.length })
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
  }, [farmerId])

  const breakdown = useMemo(() => {
    if (!data) return []
    return data.rows.map((r) => {
      const { tins, extraLb } = decomposeNetPound(r.snapshot.net_pound, data.lbPerTin)
      return { no: r.snapshot.purchase_no, date: r.snapshot.date, tins, extraLb }
    })
  }, [data])

  async function handlePdf(purchaseId: number): Promise<void> {
    setBusyId(purchaseId)
    try {
      await generateVoucherPdf(purchaseId)
      setFlash({ kind: 'ok', text: t({ my: 'PDF ထုတ်ပြီးပါပြီ', en: 'PDF generated' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'PDF failed' })
    } finally { setBusyId(null) }
  }

  async function handlePrint(record: PurchaseRecord): Promise<void> {
    if (!data) return
    setBusyId(record.snapshot.id)
    try {
      const db = getDatabase()
      const s = settingsService.load(db)
      const receipt = buildReceipt(record, data.lbPerTin, { name: s.company_name, address: s.company_address, phone: s.company_phone })
      printReceipt(receipt)
      setFlash({ kind: 'ok', text: t({ my: 'ပရင့်ထုတ်နေသည်', en: 'Printing' }) })
    } catch (err) {
      setFlash({ kind: 'err', text: err instanceof Error ? err.message : 'Print failed' })
    } finally { setBusyId(null) }
  }

  if (error) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="history-farmer">
        <p role="alert"><Text role="primary">{t({ my: 'ဆာဗာအမှား', en: 'Service error' })}: {error}</Text></p>
        <button type="button" onClick={() => navigate('/history')} className="rounded border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-hover">
          {t({ my: 'မှတ်တမ်းသို့', en: 'Back to History' })}
        </button>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="history-farmer">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="history-farmer">
      <div className="flex items-center justify-between gap-2">
        <Text as="h1" role="header" className="text-lg font-semibold">
          {t({ my: 'မှတ်တမ်း — ', en: 'History — ' })}{data.farmerName}
        </Text>
        <button type="button" onClick={() => navigate('/history')}
          className="flex items-center gap-1 rounded border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-hover">
          <BackIcon size="h-3 w-3" aria-label="Back" />
          {t({ my: 'နောက်သို့', en: 'Back' })}
        </button>
      </div>

      {flash && (
        <div role="status" className={`rounded border px-3 py-1.5 text-sm ${flash.kind === 'ok' ? 'border-success/40 bg-success/10 text-success' : 'border-danger/40 bg-danger/10 text-danger'}`}>
          {flash.text}
        </div>
      )}

      <section className="grid gap-2 rounded-lg border border-border bg-surface p-3 text-sm sm:grid-cols-2">
        <SumRow label={t({ my: 'အရေအတွက်', en: 'Purchases' })} value={formatNumber(data.purchaseCount)} />
        <SumRow label={t({ my: 'အိတ်', en: 'Bags' })} value={formatNumber(data.totalBags)} />
        <SumRow label={t({ my: 'ပေါင်', en: 'Pound' })} value={formatNumber(data.totalNetPound)} />
        <SumRow label={t({ my: 'ငွေ', en: 'Amount' })} value={formatMMK(data.totalAmount)} />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'အစဉ်', en: 'No' })}</Text></th>
                <th className="px-2 py-2 text-left"><Text role="header">{t({ my: 'အရောင်းနံပါတ်', en: 'Purchase No' })}</Text></th>
                <th className="px-2 py-2 text-left"><Text role="header">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text></th>
                <th className="px-2 py-2 text-left"><Text role="header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text></th>
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'ပေါင်', en: 'Pound' })}</Text></th>
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'တင်း', en: 'Tin' })}</Text></th>
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'ပိုပေါင်', en: 'Extra Lb' })}</Text></th>
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'ငွေ', en: 'Amount' })}</Text></th>
                <th className="px-2 py-2 text-right"><Text role="header">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.length === 0 ? (
                <tr><td colSpan={9} className="p-4 text-center"><Text role="muted">{t({ my: 'မှတ်တမ်းမရှိသေးပါ', en: 'No records' })}</Text></td></tr>
              ) : data.rows.map((r, idx) => {
                const tinRow = breakdown[idx]
                return (
                  <tr key={r.snapshot.purchase_no} className="border-b border-border last:border-b-0 hover:bg-surface-hover/40">
                    <td className="w-10 px-2 py-1.5 text-right tabular-nums text-content-muted">{data.rows.length - idx}</td>
                    <td className="px-2 py-1.5"><Text role="primary" className="font-medium tabular-nums">{r.snapshot.purchase_no}</Text></td>
                    <td className="px-2 py-1.5 text-content-secondary tabular-nums">{formatDateDMY(r.snapshot.date)}</td>
                    <td className="px-2 py-1.5 text-content-secondary">{r.snapshot.rice_type_name}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-content-primary font-medium">{formatNumber(r.snapshot.net_pound)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-content-secondary">{formatTins(tinRow.tins)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-content-secondary">{formatNumber(tinRow.extraLb)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-content-primary font-semibold">{formatMMK(r.snapshot.total_amount)}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => { void handlePdf(r.snapshot.id) }} disabled={busyId === r.snapshot.id}
                          aria-label={t({ my: 'PDF ထုတ်မည်', en: 'Export PDF' })}
                          className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50">
                          {busyId === r.snapshot.id ? <SpinnerIcon size="h-4 w-4 animate-spin" /> : <PdfIcon size="h-4 w-4" />}
                        </button>
                        <button type="button" onClick={() => { void handlePrint(r) }} disabled={busyId === r.snapshot.id}
                          aria-label={t({ my: 'ပရင့်ထုတ်မည်', en: 'Print Receipt' })}
                          className="rounded p-1 text-content-secondary hover:bg-surface-hover hover:text-content-primary disabled:opacity-50">
                          <PrintIcon size="h-4 w-4" />
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
    </div>
  )
}

function SumRow({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <Text role="secondary">{label}</Text>
      <Text role="primary" className="tabular-nums">{value}</Text>
    </div>
  )
}

export default HistoryFarmerPage
