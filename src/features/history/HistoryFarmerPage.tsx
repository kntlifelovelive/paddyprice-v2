/**
 * Per-farmer History drilldown (Step 8) - PROJECT_SPEC §3.2.
 *
 * Routes from the History page when a user picks a farmer. Shows every
 * purchase for that farmer (newest first) plus a per-farmer summary card.
 * Same display contracts as the main History page (NET pound, Tin + Extra Lb).
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
import { Text } from '@/shared/ui'

interface PageData {
  farmerName: string
  rows: ReturnType<typeof getHistoryRecords>
  lbPerTin: number
  totalAmount: number
  totalNetPound: number
  totalBags: number
  purchaseCount: number
}

export function HistoryFarmerPage(): JSX.Element {
  const t = useT()
  const { farmerId: farmerIdParam } = useParams<{ farmerId: string }>()
  const farmerId = farmerIdParam ? Number(farmerIdParam) : NaN
  const navigate = useNavigate()
  const [data, setData] = useState<PageData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (Number.isNaN(farmerId)) {
      setError('Invalid farmer id')
      return
    }
    try {
      const db = getDatabase()
      const farmer = getFarmer(db, farmerId)
      if (!farmer) {
        setError('Farmer not found')
        return
      }
      const records = getHistoryRecords(db, { farmer_id: farmerId })
      const lbPerTin = settingsService.lbPerTin(db)
      const totalAmount = records.reduce((sum, r) => sum + r.snapshot.total_amount, 0)
      const totalNetPound = records.reduce((sum, r) => sum + r.snapshot.net_pound, 0)
      const totalBags = records.reduce((sum, r) => sum + r.snapshot.total_bags, 0)
      setData({
        farmerName: farmer.name,
        rows: records,
        lbPerTin,
        totalAmount,
        totalNetPound,
        totalBags,
        purchaseCount: records.length,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [farmerId])

  const breakdown = useMemo(() => {
    if (!data) return []
    return data.rows.map((r) => {
      const { tins, extraLb } = decomposeNetPound(r.snapshot.net_pound, data.lbPerTin)
      return { no: r.snapshot.purchase_no, date: r.snapshot.date, tins, extraLb }
    })
  }, [data])

  if (error) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="history-farmer">
        <p role="alert">
          <Text role="primary">
            {t({ my: 'ဆာဗာအမှား', en: 'Service error' })}: {error}
          </Text>
        </p>
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="rounded border border-border bg-surface px-3 py-1 text-sm hover:bg-surface-hover"
        >
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
          {t({ my: 'မှတ်တမ်း — ', en: 'History — ' })}
          {data.farmerName}
        </Text>
        <button
          type="button"
          onClick={() => navigate('/history')}
          className="rounded border border-border bg-surface px-3 py-1 text-xs hover:bg-surface-hover"
        >
          {t({ my: 'နောက်သို့', en: 'Back' })}
        </button>
      </div>

      <section className="grid gap-2 rounded-lg border border-border bg-surface p-3 text-sm sm:grid-cols-2">
        <SumRow label={t({ my: 'အရေအတွက်', en: 'Purchases' })} value={formatNumber(data.purchaseCount)} />
        <SumRow label={t({ my: 'အိတ်', en: 'Bags' })} value={formatNumber(data.totalBags)} />
        <SumRow label={t({ my: 'ပေါင် (အသစ်)', en: 'Net Pound' })} value={formatNumber(data.totalNetPound)} />
        <SumRow label={t({ my: 'ငွေ', en: 'Amount' })} value={formatMMK(data.totalAmount)} />
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface">
                <th className="px-2 py-2 text-left">
                  <Text role="header">NO</Text>
                </th>
                <th className="px-2 py-2 text-left">
                  <Text role="header">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
                </th>
                <th className="px-2 py-2 text-left">
                  <Text role="header">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                </th>
                <th className="px-2 py-2 text-right">
                  <Text role="header">{t({ my: 'ပေါင် (အသစ်)', en: 'Net Pound' })}</Text>
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
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-4 text-center">
                    <Text role="muted">{t({ my: 'မှတ်တမ်းမရှိသေးပါ', en: 'No records' })}</Text>
                  </td>
                </tr>
              ) : (
                data.rows.map((r, idx) => {
                  const tinRow = breakdown[idx]
                  return (
                    <tr key={r.snapshot.purchase_no} className="border-b border-border last:border-b-0">
                      <td className="px-2 py-1.5">
                        <Text role="primary">{r.snapshot.purchase_no}</Text>
                      </td>
                      <td className="px-2 py-1.5">
                        <Text role="primary">{formatDateDMY(r.snapshot.date)}</Text>
                      </td>
                      <td className="px-2 py-1.5">
                        <Text role="secondary">{r.snapshot.rice_type_name}</Text>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Text role="primary">{formatNumber(r.snapshot.net_pound)}</Text>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Text role="secondary">{formatTins(tinRow.tins)}</Text>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Text role="secondary">{formatNumber(tinRow.extraLb)}</Text>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        <Text role="primary">{formatMMK(r.snapshot.total_amount)}</Text>
                      </td>
                    </tr>
                  )
                })
              )}
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
      <Text role="primary" className="tabular-nums">
        {value}
      </Text>
    </div>
  )
}

export default HistoryFarmerPage
