/**
 * Rice Prices feature page (Step 8) - PROJECT_SPEC §3.6.
 *
 * CRUD over the (date, paddy type) -> price rows. Each row is the canonical
 * price source for purchases on that date+type (DOMAIN_RULES §5.3): lookup
 * is exact, with no fallback. The UI exposes the documented A/B shorthand
 * (A×100,000+B; PROJECT_SPEC §3.6) so users do not enter 8-digit values.
 */
import { useEffect, useState } from 'react'

import { getDatabase } from '@/infrastructure/db'
import { listFarmers } from '@/infrastructure/db/dao/farmers'
import {
  createRicePrice,
  deleteRicePrice,
  getPriceForDateAndType,
  listRicePrices,
  updateRicePrice,
  type RicePriceInput,
  type RicePricePatch,
} from '@/infrastructure/db/dao/ricePrices'
import { listRiceTypes } from '@/infrastructure/db/dao/riceTypes'
import { formatPriceShorthand, parsePriceFormat } from '@/domain/paddy/price'
import { formatMMK, formatNumber } from '@/shared/format'
import type { RicePrice, RiceType } from '@/types'
import { useT } from '@/shared/hooks'
import { DeleteIcon, EditIcon, Text } from '@/shared/ui'

function priceFromShorthand(
  shorthand: string,
): { ok: true; price_100_tin: number; price_per_tin: number } | { ok: false; error: string } {
  const parsed = parsePriceFormat(shorthand)
  if (parsed === null) {
    return {
      ok: false,
      error: 'Invalid price format. Use A/BBBBB (e.g. 18/50000).',
    }
  }
  return { ok: true, price_100_tin: parsed.price_100_tin, price_per_tin: parsed.price_per_tin }
}

export function RicePricesPage(): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<RicePrice[]>([])
  const [riceTypes, setRiceTypes] = useState<RiceType[]>([])
  const [date, setDate] = useState('')
  const [riceTypeId, setRiceTypeId] = useState<number | null>(null)
  const [priceShorthand, setPriceShorthand] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingShorthand, setEditingShorthand] = useState('')

  const refresh = () => {
    try {
      const db = getDatabase()
      setItems(listRicePrices(db))
      setRiceTypes(listRiceTypes(db, true))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  const handleAdd = () => {
    if (!date || riceTypeId == null) {
      setError('Date and paddy type are required')
      return
    }
    const parsed = priceFromShorthand(priceShorthand)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    try {
      const db = getDatabase()
      const existing = getPriceForDateAndType(db, date, riceTypeId)
      if (existing) {
        setError(t({ my: 'ထိုရက်စွဲ/စပါးအမျိုးအစား အတွက် ဈေးရှိပြီးသား', en: 'A price for that date/type already exists' }))
        return
      }
      const input: RicePriceInput = {
        date,
        rice_type_id: riceTypeId,
        price_100_tin: parsed.price_100_tin,
        price_per_tin: parsed.price_per_tin,
      }
      createRicePrice(db, input)
      setPriceShorthand('')
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleEdit = (id: number) => {
    const target = items.find((it) => it.id === id)
    if (!target) return
    setEditingId(id)
    setEditingShorthand(formatPriceShorthand(target.price_100_tin))
  }

  const handleSaveEdit = (id: number) => {
    const parsed = priceFromShorthand(editingShorthand)
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    try {
      const db = getDatabase()
      const patch: RicePricePatch = {
        price_100_tin: parsed.price_100_tin,
        price_per_tin: parsed.price_per_tin,
      }
      updateRicePrice(db, id, patch)
      setEditingId(null)
      setEditingShorthand('')
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = (id: number) => {
    try {
      const db = getDatabase()
      deleteRicePrice(db, id)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const riceTypeName = (id: number): string => riceTypes.find((rt) => rt.id === id)?.name ?? '—'

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="rice-prices">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'စပါးဈေးနှုန်း', en: 'Rice Prices' })}
      </Text>
      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold">
          {t({ my: 'အသစ်ထည့်ရန်', en: 'Add Price' })}
        </Text>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-border bg-background px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
            <select
              value={riceTypeId ?? ''}
              onChange={(e) => setRiceTypeId(e.target.value === '' ? null : Number(e.target.value))}
              className="rounded border border-border bg-background px-2 py-1.5"
            >
              <option value="">{t({ my: 'ရွေးပါ…', en: 'Select…' })}</option>
              {riceTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'ဈေးနှုန်း (A/B)', en: 'Price (A/B)' })}</Text>
            <input
              type="text"
              inputMode="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="18/50000"
              value={priceShorthand}
              onChange={(e) => setPriceShorthand(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAdd()
                }
              }}
              className="rounded border border-border bg-background px-2 py-1.5 tabular-nums"
            />
            <Text role="muted" className="text-xs">
              {t({
                my: 'ဥပမာ - 18/50000 ⇒ 100 တင်းလျှင် 1,850,000 ကျပ်',
                en: 'Example: 18/50000 = 1,850,000 MMK per 100 tin',
              })}
            </Text>
          </label>
        </div>
        <button
          type="button"
          onClick={handleAdd}
          className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
        >
          {t({ my: 'သိမ်းမည်', en: 'Save' })}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded border border-border bg-surface p-2 text-sm">
          <Text role="primary">{error}</Text>
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold">
            {t({ my: 'စာရင်း', en: 'List' })} ({items.length})
          </Text>
        </div>
        {items.length === 0 ? (
          <div className="p-4">
            <Text role="muted">{t({ my: 'ဈေးနှုန်း မရှိသေးပါ', en: 'No prices yet' })}</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="w-10 px-2 py-2 text-right">
                    <Text role="header" className="font-semibold">{t({ my: 'အစဉ်', en: 'No' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold">{t({ my: '၁၀၀ တင်း', en: 'Per 100 Tin' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold">{t({ my: '၁ တင်း', en: 'Per Tin' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, idx) => (
                  <tr key={p.id} className="border-b border-border last:border-b-0">
                    <td className="w-10 px-2 py-2 text-right tabular-nums">
                      <Text role="secondary">{items.length - idx}</Text>
                    </td>
                    <td className="px-2 py-2">
                      <Text role="primary">{p.date}</Text>
                    </td>
                    <td className="px-2 py-2">
                      <Text role="secondary">{riceTypeName(p.rice_type_id)}</Text>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {editingId === p.id ? (
                        <input
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={editingShorthand}
                          onChange={(e) => setEditingShorthand(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              handleSaveEdit(p.id)
                            }
                          }}
                          className="w-28 rounded border border-border bg-background px-1 py-0.5 text-right text-xs tabular-nums"
                        />
                      ) : (
                        <Text role="primary">{formatMMK(p.price_100_tin)}</Text>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      <Text role="secondary">{formatNumber(p.price_per_tin)}</Text>
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editingId === p.id ? (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleSaveEdit(p.id)}
                            className="rounded bg-accent px-2 py-0.5 text-xs text-accent-text hover:bg-accent-hover"
                          >
                            {t({ my: 'သိမ်းမည်', en: 'Save' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded border border-border bg-surface px-2 py-0.5 text-xs hover:bg-surface-hover"
                          >
                            {t({ my: 'ပယ်ဖျက်မည်', en: 'Cancel' })}
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEdit(p.id)}
                            aria-label={t({ my: 'စပါးဈေး ပြင်ရန်', en: 'Edit rice price' })}
                            title={t({ my: 'စပါးဈေး ပြင်ရန်', en: 'Edit rice price' })}
                            className="rounded p-1.5 text-warning hover:bg-surface-hover"
                          >
                            <EditIcon size="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(p.id)}
                            aria-label={t({ my: 'စပါးဈေး ဖျက်ရန်', en: 'Delete rice price' })}
                            title={t({ my: 'စပါးဈေး ဖျက်ရန်', en: 'Delete rice price' })}
                            className="rounded p-1.5 text-danger hover:bg-surface-hover"
                          >
                            <DeleteIcon size="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

// Note: listFarmers is imported indirectly via type list shape, no behavior dep.
void listFarmers

export default RicePricesPage
