/**
 * Moisture configuration feature page (Step 8) - PROJECT_SPEC §3.4.
 *
 * CRUD over the per-farmer × per-paddy-type moisture pre-fill rules
 * (PROJECT_SPEC §3.4: Pattern 1 default label that the New Purchase page
 * picks up at creation). The actual deduction RATE values for each label
 * (17/18/19/20) are managed in Settings; this page only stores the
 * per-pair label.
 */
import { useEffect, useMemo, useRef, useState } from 'react'

import { getDatabase } from '@/infrastructure/db'
import {
  listFarmers,
} from '@/infrastructure/db/dao/farmers'
import {
  deleteMoistureConfig,
  listMoistureConfigs,
  setMoistureConfig,
} from '@/infrastructure/db/dao/moistureConfigs'
import { listRiceTypes } from '@/infrastructure/db/dao/riceTypes'
import {
  MOISTURE_LABEL_OPTIONS,
  type MoistureLabel,
  type MoistureLabelValue,
} from '@/domain/paddy/moisture'
import type { MoistureConfig } from '@/types'
import { formatDateDMY } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { DeleteIcon, EditIcon, Text, ToggleSwitch, Select } from '@/shared/ui'

function labelText(label: MoistureLabelValue): string {
  return label == null ? 'None' : String(label)
}

export function MoisturePage(): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<MoistureConfig[]>([])
  const [farmerId, setFarmerId] = useState<number | null>(null)
  const [riceTypeId, setRiceTypeId] = useState<number | null>(null)
  const [label, setLabel] = useState<MoistureLabelValue>(null)
  // Reference parity (~/paddyprice MoisturePage): a fresh form starts as
  // 'default'. Starting at 'active' forced "Moisture Label is required" on
  // every first Save (active configs must carry a label), which made the
  // configuration appear unsavable on Android. Active is reached via the
  // toggle; a Default config needs no label.
  const [status, setStatus] = useState<'default' | 'active'>('default')
  const [error, setError] = useState<string | null>(null)
  // UI-only: which config row was loaded into the form via the Edit action.
  // Save still goes through the existing setMoistureConfig upsert — no new
  // edit logic, identity stays the (farmer × rice type) pair.
  const [editingId, setEditingId] = useState<number | null>(null)
  const [farmerOptions, setFarmerOptions] = useState<ReturnType<typeof listFarmers>>([])
  const [riceTypeOptions, setRiceTypeOptions] = useState<ReturnType<typeof listRiceTypes>>([])
  // Android-portrait interaction fix: the config form sits ABOVE the (long)
  // Moisture List, so loading a row via Edit must bring the form back into
  // view — otherwise the selected customer appears not to load at all.
  const formRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    try {
      const db = getDatabase()
      setItems(listMoistureConfigs(db))
      setFarmerOptions(listFarmers(db))
      setRiceTypeOptions(listRiceTypes(db, true))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const refresh = () => {
    try {
      setItems(listMoistureConfigs(getDatabase()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAdd = () => {
    if (farmerId == null) {
      setError('Please pick a farmer')
      return
    }
    if (status === 'active' && label == null) {
      // Reference rule (DOMAIN_RULES §4.4): an ACTIVE config must carry the
      // Pattern 1 default label; a label is only meaningful/kept for Active.
      setError(t({ my: 'Active အခြေအနေတွင် အစိုဓာတ် အမှတ် ရွေးရပါမည်', en: 'Moisture Label is required when status is Active.' }))
      return
    }
    try {
      const db = getDatabase()
      setMoistureConfig(db, { farmer_id: farmerId, rice_type_id: riceTypeId ?? 0, status, label: label ?? null })
      setError(null)
      refresh()
      // Return the form to its defaults after a successful save (including
      // an edit-save) so the next entry starts clean.
      setFarmerId(null)
      setRiceTypeId(null)
      setLabel(null)
      setStatus('default')
      setEditingId(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = (id: number) => {
    try {
      const db = getDatabase()
      deleteMoistureConfig(db, id)
      if (editingId === id) setEditingId(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Load an existing config's values into the form. Saving uses the
      existing setMoistureConfig upsert — no separate edit pathway. */
  const handleEdit = (row: MoistureConfig) => {
    setFarmerId(row.farmer_id)
    setRiceTypeId(row.rice_type_id)
    setLabel(row.label)
    setStatus(row.status)
    setEditingId(row.id)
    setError(null)
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const rows = useMemo(() => items, [items])

  /** Moisture List grouped by the config's own updated_at date (existing
      field — unchanged). Dates render newest-first; within a group rows are
      newest-first so the per-group `No` (group.length − idx) gives the
      oldest row of THIS group 1 — numbering resets per date. */
  const dateGroups = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => b.updated_at.localeCompare(a.updated_at) || b.id - a.id,
    )
    const groups = new Map<string, MoistureConfig[]>()
    for (const row of sorted) {
      const date = row.updated_at.split('T')[0]
      const bucket = groups.get(date)
      if (bucket) bucket.push(row)
      else groups.set(date, [row])
    }
    return [...groups.entries()]
  }, [items])

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="moisture">
      <Text as="h1" role="header" className="text-lg font-semibold text-accent-hover">
        {t({ my: 'အစိုဓာတ်', en: 'Moisture' })}
      </Text>

      <section ref={formRef} className="rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center justify-between">
          <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
            {t({ my: 'အစိုဓာတ် စနစ်ထားရန်', en: 'Moisture Configuration' })}
          </Text>
          {editingId != null && (
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="rounded px-2 py-0.5 text-xs hover:bg-surface-hover"
            >
              <Text role="secondary">{t({ my: 'ပြင်ဆင်ခြင်း ပယ်ဖျက်', en: 'Cancel edit' })}</Text>
            </button>
          )}
        </div>
        {/* Reference grid: two columns from `sm` (Android tablet portrait),
            four only on large screens — keeps each control wide enough to
            read and tap. */}
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'အမည်', en: 'Name' })}</Text>
            <Select
              value={String(farmerId ?? '')}
              onChange={(value) => setFarmerId(value === '' ? null : Number(value))}
              className="rounded border border-border bg-background px-2 py-2"
              options={[
                { value: '', label: t({ my: 'ရွေးပါ…', en: 'Select…' }) },
                ...farmerOptions.map((f) => ({ value: String(f.id), label: f.name })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
            <Select
              value={String(riceTypeId ?? '')}
              onChange={(value) => setRiceTypeId(value === '' ? null : Number(value))}
              className="rounded border border-border bg-background px-2 py-2"
              options={[
                { value: '', label: t({ my: 'မရွေးပါ (လယ်သမားတစ်ယောက်ချင်း)', en: 'All Types' }) },
                ...riceTypeOptions.map((rt) => ({ value: String(rt.id), label: rt.name })),
              ]}
            />
          </label>
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'အစိုဓာတ်', en: 'Label' })}</Text>
            <Select
              value={String(label ?? '')}
              disabled={status !== 'active'}
              onChange={(value) => setLabel(value === '' ? null : (Number(value) as MoistureLabel))}
              className="rounded border border-border bg-background px-2 py-2 disabled:opacity-50"
              options={[
                { value: '', label: t({ my: 'မရှိ', en: 'None' }) },
                ...MOISTURE_LABEL_OPTIONS.map((opt: MoistureLabel) => ({
                  value: String(opt),
                  label: String(opt),
                })),
              ]}
            />
          </label>
          {/* Active control — same structure as the select fields above
              (label on top, control underneath) so the toggle sits level with
              them instead of floating mid-cell (vertical alignment fix). */}
          <div className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'အသုံ်ပြုနိုင်', en: 'Active' })}</Text>
            <div className="flex items-center gap-2 py-2">
              <ToggleSwitch
                checked={status === 'active'}
                onChange={(on) => {
                  setStatus(on ? 'active' : 'default')
                  // Default configs carry no label (reference state machine);
                  // clear the draft so the disabled Label select is honest.
                  if (!on) setLabel(null)
                }}
                aria-label={t({ my: 'အခြေအနေ', en: 'Status' })}
              />
              <Text role={status === 'active' ? 'primary' : 'muted'}>
                {status === 'active'
                  ? t({ my: 'အသုံ်ပြုနိုင်', en: 'Active' })
                  : t({ my: 'မူလ', en: 'Default' })}
              </Text>
            </div>
          </div>
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

      {/* Moisture List — its own header bar, then one sibling card per date
          group (flat hierarchy, no card-in-card). */}
      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
          {t({ my: 'အစိုဓာတ် စာရင်း', en: 'Moisture List' })} ({rows.length})
        </Text>
      </section>
      {rows.length === 0 && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <Text role="muted">{t({ my: 'မသတ်မှတ်ရသေးပါ', en: 'No configurations' })}</Text>
        </section>
      )}
      {dateGroups.map(([date, groupRows]) => (
        <section key={date} className="overflow-hidden rounded-lg border border-border bg-surface">
          {/* Date group header — existing updated_at date, unchanged. */}
          <div className="border-b border-border bg-accent/10 px-3 py-2">
            <Text role="primary" className="text-sm font-semibold tabular-nums text-accent-hover">
              {formatDateDMY(date)}
            </Text>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
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
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'အစိုဓာတ် အမှတ်', en: 'Moisture Label' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    className="border-b border-border last:border-b-0 hover:bg-surface-hover"
                  >
                    <td className="w-10 px-2 py-2 text-right tabular-nums">
                      <Text role="secondary">{groupRows.length - idx}</Text>
                    </td>
                    <td className="px-2 py-2">
                      <Text role="primary" className="font-medium text-accent">{row.farmer_name}</Text>
                    </td>
                    <td className="px-2 py-2">
                      <Text role="secondary">{row.rice_type_name || '—'}</Text>
                    </td>
                    <td className="px-2 py-2">
                      <Text role="primary" className="font-medium text-warning">{labelText(row.label)}</Text>
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(row)}
                          aria-label={t({
                            my: 'အစိုဓာတ် မှတ်တမ်း ပြင်ရန်',
                            en: 'Edit moisture record',
                          })}
                          title={t({
                            my: 'အစိုဓာတ် မှတ်တမ်း ပြင်ရန်',
                            en: 'Edit moisture record',
                          })}
                          className="rounded p-1.5 text-warning hover:bg-surface-hover"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(row.id)}
                          aria-label={t({
                            my: 'အစိုဓာတ် မှတ်တမ်း ဖယ်ရှားရန်',
                            en: 'Remove moisture record',
                          })}
                          title={t({
                            my: 'အစိုဓာတ် မှတ်တမ်း ဖယ်ရှားရန်',
                            en: 'Remove moisture record',
                          })}
                          className="rounded p-1.5 text-danger hover:bg-surface-hover"
                        >
                          <DeleteIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

export default MoisturePage
