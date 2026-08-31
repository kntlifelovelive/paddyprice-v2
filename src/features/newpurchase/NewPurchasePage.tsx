/**
 * New Purchase feature page (Step 8) - PROJECT_SPEC §3.3.
 *
 * Composes the documented purchase creation/entry flow:
 *  - §3.3 / §6.1 pick Farmer + Date + Paddy Type (auto-resolves the price
 *    row for that exact date+type; zero-bag creation is allowed, §6.2).
 *  - Pattern 1 (purchase-level) moisture label. Defaults from the per-farmer
 *    per-type configuration when present, else None.
 *  - Bag entry: numeric weight input + an optional per-bag Pattern 2 label
 *    override. Validation lives in `domain/paddy/weights`; this page only
 *    surfaces the error from the service.
 *  - Undo last bag, remove a specific bag (resequencing handled by the DAO).
 *  - Live totals + computed totals from the STORED snapshot, never re-derived
 *    here. Finalize (Step 7 service exists; PDF stamping is wired later).
 *
 * Display contracts preserved (DOMAIN_RULES):
 *  - Tin + Extra Lb decomposed from the STORED net pound via domain helper.
 *  - All numbers go through `shared/format`; no manual rounding.
 *  - Semantic theme tokens only (no hard-coded white/black).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAppStore } from '@/app/state'
import { MOISTURE_LABEL_OPTIONS, type MoistureLabel, type MoistureLabelValue } from '@/domain/paddy/moisture'
import { decomposeNetPound } from '@/domain/paddy/tinBreakdown'
import type { BagRow } from '@/domain/purchase/totals'
import { getDatabase } from '@/infrastructure/db'
import * as farmersDao from '@/infrastructure/db/dao/farmers'
import * as moistureConfigsDao from '@/infrastructure/db/dao/moistureConfigs'
import * as riceTypesDao from '@/infrastructure/db/dao/riceTypes'
import {
  addWeight,
  createPurchase,
  getPurchaseRecord,
  removeBag,
  setBagMoisture,
  setBagWeight,
  undoLast,
} from '@/services/purchase'
import { settingsService } from '@/services/settings'
import { formatMMK, formatNumber, formatTins, todayISO } from '@/shared/format'
import { useT } from '@/shared/hooks'
import { DeleteIcon, EditIcon, Text, cn } from '@/shared/ui'

interface BagDisplay {
  seq: number
  weight_lb: number
  moisture_label: MoistureLabelValue
}

interface PurchaseFormState {
  // Header
  farmerId: number | null
  date: string
  riceTypeId: number | null
  // Pattern 1 (purchase-level default moisture)
  defaultMoisture: MoistureLabelValue
  // Live bag list (mirrors what is stored)
  bags: BagDisplay[]
  // Final totals (from service after each mutation)
  totalBags: number
  totalPounds: number
  totalTins: number
  totalAmount: number
  grossPound: number
  moistureLoss: number
  netPound: number
  // Errors
  serviceError: string | null
}

function emptyForm(): PurchaseFormState {
  return {
    farmerId: null,
    date: todayISO(),
    riceTypeId: null,
    defaultMoisture: null,
    bags: [],
    totalBags: 0,
    totalPounds: 0,
    totalTins: 0,
    totalAmount: 0,
    grossPound: 0,
    moistureLoss: 0,
    netPound: 0,
    serviceError: null,
  }
}

function moistureLabelText(label: MoistureLabelValue): string {
  if (label == null) return 'None'
  return String(label)
}

export function NewPurchasePage(): JSX.Element {
  const t = useT()
  const navigate = useNavigate()
  const { id: purchaseIdParam } = useParams<{ id: string }>()
  const purchaseId = purchaseIdParam ? Number(purchaseIdParam) : null
  const dbReady = useAppStore((s) => s.dbReady)

  // Header dropdown sources.
  const [farmers, setFarmers] = useState<ReturnType<typeof farmersDao.listFarmers>>([])
  const [riceTypes, setRiceTypes] = useState<ReturnType<typeof riceTypesDao.listRiceTypes>>([])
  // Bag entry input.
  const [weightInput, setWeightInput] = useState('')
  const [bagMoisture, setBagMoistureInput] = useState<MoistureLabelValue>(null)
  /** Ref for the weight input so we can keep focus on repeated Enter entry. */
  const weightInputRef = useRef<HTMLInputElement | null>(null)

  // Form state.
  const [form, setForm] = useState<PurchaseFormState>(emptyForm)
  // Per-bag label override editor (Pattern 2).
  const [editingSeq, setEditingSeq] = useState<number | null>(null)
  // Per-bag weight editor — the Action column's Edit icon edits ONLY the
  // bag's pound value (never moisture, customer, or other fields).
  const [weightEditSeq, setWeightEditSeq] = useState<number | null>(null)

  // Load dropdowns once the DB is ready.
  useEffect(() => {
    if (!dbReady) return
    try {
      const db = getDatabase()
      setFarmers(farmersDao.listFarmers(db))
      setRiceTypes(riceTypesDao.listRiceTypes(db, true))
    } catch (e) {
      setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
    }
  }, [dbReady])

  // If editing an existing purchase, hydrate.
  useEffect(() => {
    if (!dbReady || purchaseId == null || Number.isNaN(purchaseId)) return
    try {
      const db = getDatabase()
      const record = getPurchaseRecord(db, purchaseId)
      if (!record) {
        setForm((f) => ({ ...f, serviceError: 'Purchase not found' }))
        return
      }
      const s = record.snapshot
      setForm({
        farmerId: s.farmer_id,
        date: s.date,
        riceTypeId: s.rice_type_id,
        defaultMoisture: s.moisture_label ?? null,
        bags: record.bags.map((b: BagRow, idx: number) => ({
          seq: idx + 1,
          weight_lb: b.weight_lb,
          moisture_label: b.moisture_label,
        })),
        totalBags: s.total_bags,
        totalPounds: s.total_pounds,
        totalTins: s.total_tins,
        totalAmount: s.total_amount,
        grossPound: s.gross_pound,
        moistureLoss: s.moisture_loss,
        netPound: s.net_pound,
        serviceError: null,
      })
    } catch (e) {
      setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
    }
  }, [dbReady, purchaseId])

  // Default the per-bag moisture editor to the Pattern 1 default when it changes.
  useEffect(() => {
    setBagMoistureInput(form.defaultMoisture)
  }, [form.defaultMoisture])

  const handleCreate = useCallback(() => {
    if (!dbReady) return
    if (form.farmerId == null || form.riceTypeId == null) {
      setForm((f) => ({ ...f, serviceError: 'Please select a farmer and a paddy type' }))
      return
    }
    try {
      const db = getDatabase()
      // Per-farmer per-type default moisture (PROJECT_SPEC §3.4).
      let defaultMoisture: MoistureLabelValue = null
      if (form.farmerId != null && form.riceTypeId != null) {
        const cfg = moistureConfigsDao.getMoistureConfig(db, form.farmerId, form.riceTypeId)
        if (cfg && cfg.status === 'active') defaultMoisture = cfg.label
      }
      const record = createPurchase(db, {
        farmer_id: form.farmerId,
        date: form.date,
        rice_type_id: form.riceTypeId,
        moisture_label: defaultMoisture,
      })
      navigate(`/purchase/${record.snapshot.id}`, { replace: true })
    } catch (e) {
      setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
    }
  }, [dbReady, form.farmerId, form.riceTypeId, form.date, navigate])

  /**
   * Add a bag weight. The `weight` param is passed explicitly so callers (Enter
   * key) can capture the current input value without stale-closure risk.
   * On success the `serviceError` is cleared (Step 10 §16: a valid Enter
   * submission must NOT leave the "Weight is Required" error visible).
   */
  const doAddWeight = useCallback((weight: string) => {
    if (purchaseId == null) return
    const trimmed = weight.trim()
    if (trimmed === '') {
      setForm((f) => ({ ...f, serviceError: 'Weight is required' }))
      return
    }
    try {
      const db = getDatabase()
      const { totals } = addWeight(db, purchaseId, trimmed, bagMoisture)
      setWeightInput('')
      // Reset per-bag moisture override back to "Use Pattern 1" so the next
      // bag is built from the purchase-level default unless the user
      // explicitly changes it again. (See Step 10 §16 — repeated entry UX.)
      setBagMoistureInput(null)
      const record = getPurchaseRecord(db, purchaseId)
      setForm((f) => ({
        ...f,
        serviceError: null,
        bags: (record?.bags ?? []).map((b, idx) => ({
          seq: idx + 1,
          weight_lb: b.weight_lb,
          moisture_label: b.moisture_label,
        })),
        totalBags: totals.total_bags,
        totalPounds: totals.total_pounds,
        totalTins: totals.total_tins,
        totalAmount: totals.total_amount,
        grossPound: totals.gross_pound,
        moistureLoss: totals.moisture_loss,
        netPound: totals.net_pound,
      }))
      // Keep focus on the weight input for repeated entry (Step 10 §16).
      setTimeout(() => weightInputRef.current?.focus(), 0)
    } catch (e) {
      setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
    }
  }, [purchaseId, bagMoisture])

  /** Button-triggered weight add (reads current weightInput state). */
  const handleAddWeight = useCallback(() => {
    doAddWeight(weightInput)
  }, [doAddWeight, weightInput])

  const handleUndo = useCallback(() => {
    if (purchaseId == null) return
    try {
      const db = getDatabase()
      const totals = undoLast(db, purchaseId)
      const record = getPurchaseRecord(db, purchaseId)
      setForm((f) => ({
        ...f,
        serviceError: null,
        bags: (record?.bags ?? []).map((b, idx) => ({
          seq: idx + 1,
          weight_lb: b.weight_lb,
          moisture_label: b.moisture_label,
        })),
        totalBags: totals?.total_bags ?? 0,
        totalPounds: totals?.total_pounds ?? 0,
        totalTins: totals?.total_tins ?? 0,
        totalAmount: totals?.total_amount ?? 0,
        grossPound: totals?.gross_pound ?? 0,
        moistureLoss: totals?.moisture_loss ?? 0,
        netPound: totals?.net_pound ?? 0,
      }))
    } catch (e) {
      setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
    }
  }, [purchaseId])

  const handleRemove = useCallback(
    (seq: number) => {
      if (purchaseId == null) return
      try {
        const db = getDatabase()
        const totals = removeBag(db, purchaseId, seq)
        const record = getPurchaseRecord(db, purchaseId)
        setForm((f) => ({
          ...f,
          serviceError: null,
          bags: (record?.bags ?? []).map((b, idx) => ({
            seq: idx + 1,
            weight_lb: b.weight_lb,
            moisture_label: b.moisture_label,
          })),
          totalBags: totals?.total_bags ?? 0,
          totalPounds: totals?.total_pounds ?? 0,
          totalTins: totals?.total_tins ?? 0,
          totalAmount: totals?.total_amount ?? 0,
          grossPound: totals?.gross_pound ?? 0,
          moistureLoss: totals?.moisture_loss ?? 0,
          netPound: totals?.net_pound ?? 0,
        }))
      } catch (e) {
        setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
      }
    },
    [purchaseId],
  )

  const handleEditWeight = useCallback(
    (seq: number, raw: string) => {
      if (purchaseId == null) return
      try {
        const db = getDatabase()
        const totals = setBagWeight(db, purchaseId, seq, raw)
        const record = getPurchaseRecord(db, purchaseId)
        setForm((f) => ({
          ...f,
          serviceError: null,
          bags: (record?.bags ?? []).map((b, idx) => ({
            seq: idx + 1,
            weight_lb: b.weight_lb,
            moisture_label: b.moisture_label,
          })),
          totalBags: totals.total_bags,
          totalPounds: totals.total_pounds,
          totalTins: totals.total_tins,
          totalAmount: totals.total_amount,
          grossPound: totals.gross_pound,
          moistureLoss: totals.moisture_loss,
          netPound: totals.net_pound,
        }))
      } catch (e) {
        setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
      }
    },
    [purchaseId],
  )

  const handleEditMoisture = useCallback(
    (seq: number, label: MoistureLabelValue) => {
      if (purchaseId == null) return
      try {
        const db = getDatabase()
        const totals = setBagMoisture(db, purchaseId, seq, label)
        const record = getPurchaseRecord(db, purchaseId)
        setForm((f) => ({
          ...f,
          serviceError: null,
          bags: (record?.bags ?? []).map((b, idx) => ({
            seq: idx + 1,
            weight_lb: b.weight_lb,
            moisture_label: b.moisture_label,
          })),
          totalBags: totals.total_bags,
          totalPounds: totals.total_pounds,
          totalTins: totals.total_tins,
          totalAmount: totals.total_amount,
          grossPound: totals.gross_pound,
          moistureLoss: totals.moisture_loss,
          netPound: totals.net_pound,
        }))
        setEditingSeq(null)
      } catch (e) {
        setForm((f) => ({ ...f, serviceError: e instanceof Error ? e.message : String(e) }))
      }
    },
    [purchaseId],
  )

  const handleSetHeader = useCallback(<K extends keyof PurchaseFormState>(key: K, value: PurchaseFormState[K]) => {
    setForm((f) => ({ ...f, [key]: value, serviceError: null }))
  }, [])

  const lbPerTin = useMemo(() => {
    if (!dbReady) return 50
    try {
      return settingsService.lbPerTin(getDatabase())
    } catch {
      return 50
    }
  }, [dbReady, form.bags.length]) // refresh when bags change so live tin decomposition stays current
  const tinBreakdown = useMemo(() => decomposeNetPound(form.netPound, lbPerTin), [form.netPound, lbPerTin])

  if (!dbReady) {
    return (
      <div className="p-4">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  // Creation form (no purchase yet).
  if (purchaseId == null) {
    return (
      <div className="space-y-4 p-3 sm:p-4" data-page="purchase-new">
        <Text as="h1" role="header" className="text-lg font-semibold text-accent">
          {t({ my: 'အသစ်ဝယ်ယူခြင်း', en: 'New Purchase' })}
        </Text>
        <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <Text role="secondary">{t({ my: 'အမည်', en: 'Name' })}</Text>
            <select
              className="rounded border border-border bg-background px-2 py-1.5"
              value={form.farmerId ?? ''}
              onChange={(e) =>
                handleSetHeader('farmerId', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">{t({ my: 'ရွေးပါ…', en: 'Select…' })}</option>
              {farmers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <Text role="secondary">{t({ my: 'ရက်စွဲ', en: 'Date' })}</Text>
            <input
              type="date"
              className="rounded border border-border bg-background px-2 py-1.5"
              value={form.date}
              onChange={(e) => handleSetHeader('date', e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <Text role="secondary">{t({ my: 'စပါးအမျိုးအစား', en: 'Paddy Type' })}</Text>
            <select
              className="rounded border border-border bg-background px-2 py-1.5"
              value={form.riceTypeId ?? ''}
              onChange={(e) =>
                handleSetHeader('riceTypeId', e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">{t({ my: 'ရွေးပါ…', en: 'Select…' })}</option>
              {riceTypes.map((rt) => (
                <option key={rt.id} value={rt.id}>
                  {rt.name}
                </option>
              ))}
            </select>
          </label>
        </section>
        {form.serviceError && (
          <p role="alert" className="text-sm">
            <Text role="primary">{form.serviceError}</Text>
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCreate}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
            disabled={form.farmerId == null || form.riceTypeId == null}
          >
            {t({ my: 'ဝယ်ယူမှု စတင်ရန်', en: 'Start Purchase' })}
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
          </button>
        </div>
      </div>
    )
  }

  // Editing an existing purchase: bag entry + live totals.
  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="purchase-edit">
      <Text as="h1" role="header" className="text-lg font-semibold text-accent">
        {t({ my: 'အိတ်ထည့်ခြင်း', en: 'Bag Entry' })}
      </Text>

      {/* Pattern 1 (purchase-level) default moisture UI removed — per-bag
          moisture label selection in the bag table is the single source of
          truth. The defaultMoisture state remains: it still seeds new bag
          rows from the per-farmer/per-type config (PROJECT_SPEC §3.4). */}
      <section className="rounded-lg border border-border bg-surface p-3">
        <Text role="header" className="text-sm font-semibold text-accent">
          {t({ my: 'အိတ်အသစ်ထည့်ရန်', en: 'Add Bag' })}
        </Text>
        <div className="mt-2 flex flex-wrap items-end gap-2 text-sm">
          <label className="flex flex-col gap-1">
            <Text role="secondary">{t({ my: 'အလေးချိန် (lb)', en: 'Weight (lb)' })}</Text>
            <input
              ref={weightInputRef}
              data-testid="weight-input"
              type="text"
              inputMode="decimal"
              value={weightInput}
              onChange={(e) => {
                setWeightInput(e.target.value)
                // Clear any prior validation error as soon as the user starts typing
                // a new weight (Step 10 §16 — invalid input still shows; valid
                // input never leaves a stale error visible).
                if (form.serviceError === 'Weight is required') {
                  setForm((f) => ({ ...f, serviceError: null }))
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  doAddWeight((e.target as HTMLInputElement).value)
                }
              }}
              className="w-32 rounded border border-border bg-background px-2 py-1.5"
            />
          </label>
          <button
            type="button"
            onClick={handleAddWeight}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
          >
            {t({ my: 'ထည့်မည်', en: 'Add' })}
          </button>
        </div>
      </section>

      {form.serviceError && (
        <p role="alert" className="rounded border border-border bg-surface p-2 text-sm">
          <Text role="primary">{form.serviceError}</Text>
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface">
        <div className="flex items-center justify-between border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold text-accent">
            {t({ my: 'အိတ်များ', en: 'Bags' })} ({form.bags.length})
          </Text>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleUndo}
              disabled={form.bags.length === 0}
              className="rounded border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-hover disabled:opacity-50"
            >
              {t({ my: 'နောက်ဆုံးအိတ် ပြန်ဖြုတ်မည်', en: 'Undo Last' })}
            </button>
          </div>
        </div>
        {form.bags.length === 0 ? (
          <div className="p-4 text-center">
            <Text role="muted">{t({ my: 'အိတ်မထည့်ရသေးပါ', en: 'No bags yet' })}</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'အိတ်', en: 'Bag' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'ပေါင်', en: 'Pound' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'အစိုဓာတ် အမှတ်', en: 'Moisture label' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {/* Display newest-first (highest bag number on top). The
                    underlying bags array order/seq logic is unchanged. */}
                {[...form.bags].reverse().map((bag) => (
                  <tr key={bag.seq} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                    <td className="px-2 py-1 text-right tabular-nums">
                      <Text role="secondary">{bag.seq}</Text>
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      <BagWeightCell
                        bag={bag}
                        editing={weightEditSeq === bag.seq}
                        onStartEdit={() => setWeightEditSeq(bag.seq)}
                        onDone={() => setWeightEditSeq(null)}
                        onCommit={(raw) => handleEditWeight(bag.seq, raw)}
                      />
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">
                      {editingSeq === bag.seq ? (
                        <select
                          value={bag.moisture_label ?? ''}
                          onChange={(e) =>
                            handleEditMoisture(
                              bag.seq,
                              e.target.value === '' ? null : (Number(e.target.value) as MoistureLabel),
                            )
                          }
                          onBlur={() => setEditingSeq(null)}
                          autoFocus
                          className="rounded border border-border bg-background px-1 py-0.5 text-xs"
                        >
                          <option value="">{t({ my: 'မရှိ', en: 'None' })}</option>
                          {MOISTURE_LABEL_OPTIONS.map((label: MoistureLabel) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingSeq(bag.seq)}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-xs',
                            'hover:bg-surface-hover',
                          )}
                        >
                          <Text role="primary" className="font-medium text-warning">{moistureLabelText(bag.moisture_label)}</Text>
                        </button>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setWeightEditSeq(bag.seq)}
                          aria-label={t({ my: 'အိတ်အလေးချိန် ပြင်ရန်', en: 'Edit bag weight' })}
                          title={t({ my: 'အိတ်အလေးချိန် ပြင်ရန်', en: 'Edit bag weight' })}
                          className="rounded p-1.5 text-content-secondary hover:bg-surface-hover hover:text-accent"
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(bag.seq)}
                          aria-label={t({ my: 'အိတ် ဖယ်ရှားရန်', en: 'Remove bag' })}
                          title={t({ my: 'အိတ် ဖယ်ရှားရန်', en: 'Remove bag' })}
                          className="rounded p-1.5 text-content-secondary hover:bg-surface-hover hover:text-danger"
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
        )}
      </section>

      {/* Summary — reference-style card grid, uniform styling (no highlight
          borders). Values come from the existing purchase totals logic. */}
      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold text-accent">
          {t({ my: 'စုစုပေါင်း', en: 'Totals' })}
        </Text>
        <dl className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
          <SummaryCard
            label={t({ my: 'အိတ်', en: 'Bags' })}
            value={formatNumber(form.totalBags)}
          />
          <SummaryCard
            label={t({ my: 'စုစုပေါင်းပေါင် (Gross)', en: 'Gross Pound' })}
            value={formatNumber(form.grossPound)}
          />
          <SummaryCard
            label={t({ my: 'အစိုဓာတ် နုတ်ယူမှု', en: 'Moisture Loss' })}
            value={`${formatNumber(form.moistureLoss)} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryCard
            label={t({ my: 'ပေါင် (အသစ်)', en: 'Net Pound' })}
            value={formatNumber(form.netPound)}
          />
          <SummaryCard
            label={t({ my: 'တင်း + ပိုပေါင်', en: 'Tin + Extra Lb' })}
            value={`${formatTins(tinBreakdown.tins)} ${t({ my: 'တင်း +', en: 'Tin +' })} ${formatNumber(
              tinBreakdown.extraLb,
            )} ${t({ my: 'ပေါင်', en: 'lb' })}`}
          />
          <SummaryCard
            label={t({ my: 'ငွေ', en: 'Amount' })}
            value={formatMMK(form.totalAmount)}
          />
        </dl>
      </section>
    </div>
  )
}

/** Reference-style summary card: muted uppercase label over a bold value. */
function SummaryCard({
  label,
  value,
}: {
  label: string
  value: string
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <Text role="muted" className="text-xs font-medium uppercase tracking-wide">
        {label}
      </Text>
      <Text role="primary" className="mt-1 block font-bold tabular-nums">
        {value}
      </Text>
    </div>
  )
}

interface BagWeightCellProps {
  bag: BagDisplay
  /** Controlled by the Action column's Edit icon (edits ONLY this bag's pound). */
  editing: boolean
  onStartEdit(): void
  onDone(): void
  onCommit(raw: string): void
}

function BagWeightCell({
  bag,
  editing,
  onStartEdit,
  onDone,
  onCommit,
}: BagWeightCellProps): JSX.Element {
  const [draft, setDraft] = useState(String(bag.weight_lb))
  useEffect(() => {
    setDraft(String(bag.weight_lb))
  }, [bag.weight_lb])
  if (!editing) {
    return (
      <button
        type="button"
        onClick={onStartEdit}
        className="rounded px-1.5 py-0.5 text-xs hover:bg-surface-hover"
      >
        <Text role="primary">{formatNumber(bag.weight_lb)}</Text>
      </button>
    )
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        onCommit(draft)
        onDone()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          onCommit(draft)
          onDone()
        }
      }}
      autoFocus
      className="w-20 rounded border border-border bg-background px-1 py-0.5 text-right text-xs"
    />
  )
}

export default NewPurchasePage
