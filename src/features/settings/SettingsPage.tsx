/**
 * Settings feature page (Step 8) - PROJECT_SPEC §3.6.
 *
 * Composes the documented settings tabs:
 *  - Company information (name, address, phone, footer text, PDF directory).
 *  - Theme + Language + Font size.
 *  - Tin formula (`lb per tin`).
 *  - Moisture deduction rates - V2 Settings-configurable (§4.1). Defaults are
 *    17->1, 18->2, 19->3, 20->4 lb per 50 lb and apply to purchases created
 *    AFTER the change; saved purchases keep their snapshotted rate.
 *
 * All updates go through `services/settings` (single-writer rule,
 * ARCHITECTURE §3.7). The page NEVER persists directly; it never reads
 * SQLite; it never recomputes domain rules. Resolution (invalid -> defaults)
 * lives in the domain layer and the service.
 *
 * Step 11 §1 — two-panel layout (left section list, right section content),
 * SVG section icons, and circular selection indicators on choice buttons.
 * Step 11 §5 — theme choice immediately applies the theme via
 * `applyTheme`/`data-theme`; default language is English.
 */
import { useEffect, useMemo, useState } from 'react'

import { useAppStore } from '@/app/state'
import { MOISTURE_LABEL_OPTIONS, type MoistureLabel, type MoistureRates } from '@/domain/paddy/moisture'
import { getDatabase } from '@/infrastructure/db'
import { settingsService } from '@/services/settings'
import { useSettingsStore } from '@/shared/state'
import { applyFontSize, applyTheme, FONT_SIZE_LABELS, FONT_SIZE_SCALE, type FontSizeId } from '@/shared/theme'
import { normalizeTheme, THEMES, type ThemeId } from '@/shared/theme/themes'
import { useT } from '@/shared/hooks'
import type { Settings } from '@/types'
import { Text, cn, ShieldIcon } from '@/shared/ui'
import { SecurityTab } from '@/features/security/SecurityTab'

type Tab = 'company' | 'theme' | 'tin' | 'moisture' | 'security'

/** Step 11 §1.1 — SVG section icons (no external icon package). */
function SectionIcon({ name }: { name: Tab }): JSX.Element {
  const common = 'h-5 w-5 shrink-0 text-content-secondary'
  switch (name) {
    case 'company':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-3 7 3v14M9 9h2M9 13h2M9 17h2M13 9h2M13 13h2M13 17h2" />
        </svg>
      )
    case 'theme':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={common}>
          <circle cx="12" cy="12" r="8" />
          <path strokeLinecap="round" d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4" />
        </svg>
      )
    case 'tin':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 7h14v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7z" />
          <path strokeLinecap="round" d="M5 7l1-2h12l1 2M9 11h6" />
        </svg>
      )
    case 'moisture':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className={common}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3s6 7 6 12a6 6 0 1 1-12 0c0-5 6-12 6-12z" />
          <path strokeLinecap="round" d="M9 14a3 3 0 0 0 3 3" />
        </svg>
      )
    case 'security':
      return <ShieldIcon size="h-5 w-5 shrink-0 text-content-secondary" aria-label="Security" />
  }
}

/** Step 11 §1.3 — circular radio indicator (empty / filled). */
function ChoiceIndicator({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
        selected ? 'border-accent' : 'border-border',
      )}
    >
      {selected ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
    </span>
  )
}

interface DraftState {
  company_name: string
  company_address: string
  company_phone: string
  company_footer_text: string
  pdf_dir: string
  tin_formula: string
  theme: ThemeId
  language: 'my' | 'en'
  font_size: FontSizeId
  moisture_rates: MoistureRates
}

function toDraft(s: Settings | null): DraftState {
  return {
    company_name: s?.company_name ?? 'Paddy',
    company_address: s?.company_address ?? '',
    company_phone: s?.company_phone ?? '',
    company_footer_text: s?.company_footer_text ?? '',
    pdf_dir: s?.pdf_dir ?? 'PSO/pdf',
    tin_formula: s?.tin_formula ?? '50',
    theme: normalizeTheme(s?.theme),
    language: s?.language ?? 'en',
    font_size: s?.font_size ?? 'normal',
    moisture_rates: s?.moisture_rates ?? { 17: 1, 18: 2, 19: 3, 20: 4 },
  }
}

export function SettingsPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  const settings = useSettingsStore((s) => s.settings)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [tab, setTab] = useState<Tab>('company')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!dbReady) return
    try {
      const db = getDatabase()
      // Ensure the store is hydrated (idempotent).
      settingsService.load(db)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : String(e))
    }
  }, [dbReady])

  useEffect(() => {
    setDraft(toDraft(settings))
  }, [settings])

  const commit = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    if (!dbReady) return
    try {
      const db = getDatabase()
      settingsService.update(db, key, value)
      // Apply live preview side-effects (theme + font size + language).
      if (key === 'theme') applyTheme(value as ThemeId)
      if (key === 'font_size') applyFontSize(value as FontSizeId)
      if (key === 'language') {
        // Language change is reflected through useT; nothing else to apply.
      }
      setSaveMessage(null)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const commitMoisture = (rates: MoistureRates) => {
    if (!dbReady) return
    try {
      const db = getDatabase()
      settingsService.updateMoistureRates(db, rates)
      setSaveMessage(null)
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : String(e))
    }
  }

  if (!draft) {
    return (
      <div className="p-4">
        <Text role="secondary">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</Text>
      </div>
    )
  }

  const tabs: { id: Tab; label: { my: string; en: string } }[] = [
    { id: 'company', label: { my: 'ကုမ္ပဏီ', en: 'Company' } },
    { id: 'theme', label: { my: 'အပြင်အဆင်', en: 'Appearance' } },
    { id: 'tin', label: { my: 'တင်းဖော်မြူလာ', en: 'Tin Formula' } },
    { id: 'moisture', label: { my: 'အစိုဓာတ်', en: 'Moisture' } },
    { id: 'security', label: { my: 'လုံခြုံမှု', en: 'Security' } },
  ]

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="settings">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'ဆက်တင်', en: 'Settings' })}
      </Text>

      {saveMessage && (
        <p role="alert" className="rounded border border-border bg-surface p-2 text-sm">
          <Text role="primary">{saveMessage}</Text>
        </p>
      )}

      {/*
        Step 11 §1.2 — two-panel layout. Desktop/tablet uses a left rail of
        section cards (icon + label) and a right content area; on small
        screens the rail stacks above the content so nothing breaks.
      */}
      <div className="grid gap-4 md:grid-cols-[14rem_1fr]">
        <nav
          aria-label={t({ my: 'ဆက်တင် အပိုင်းများ', en: 'Settings sections' })}
          className="flex flex-row gap-2 overflow-x-auto md:flex-col md:gap-1 md:overflow-visible"
        >
          {tabs.map((tt) => {
            const active = tab === tt.id
            return (
              <button
                key={tt.id}
                type="button"
                onClick={() => setTab(tt.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  active
                    ? 'border-accent bg-accent-muted text-content-primary'
                    : 'border-transparent text-content-secondary hover:bg-surface-hover hover:text-content-primary',
                )}
              >
                <SectionIcon name={tt.id} />
                <span className="whitespace-nowrap">{t(tt.label)}</span>
              </button>
            )
          })}
        </nav>

        <div className="min-w-0">
          {tab === 'company' && (
            <CompanyTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'theme' && (
            <ThemeTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'tin' && (
            <TinTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'moisture' && (
            <MoistureTab draft={draft} commitMoisture={commitMoisture} t={t} />
          )}
          {tab === 'security' && (
            <SecurityTab t={t} />
          )}
        </div>
      </div>
    </div>
  )
}

function CompanyTab({
  draft,
  setDraft,
  commit,
  t,
}: {
  draft: DraftState
  setDraft: React.Dispatch<React.SetStateAction<DraftState | null>>
  commit: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  t: ReturnType<typeof useT>
}): JSX.Element {
  return (
    <section className="grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2">
      <Field
        label={t({ my: 'ကုမ္ပဏီအမည်', en: 'Company Name' })}
        value={draft.company_name}
        onChange={(v) => setDraft((d) => d && { ...d, company_name: v })}
        onBlur={() => commit('company_name', draft.company_name)}
      />
      <Field
        label={t({ my: 'ဖုန်းနံပါတ်', en: 'Phone' })}
        value={draft.company_phone}
        onChange={(v) => setDraft((d) => d && { ...d, company_phone: v })}
        onBlur={() => commit('company_phone', draft.company_phone)}
      />
      <Field
        label={t({ my: 'လိပ်စာ', en: 'Address' })}
        value={draft.company_address}
        onChange={(v) => setDraft((d) => d && { ...d, company_address: v })}
        onBlur={() => commit('company_address', draft.company_address)}
        fullWidth
      />
      <Field
        label={t({ my: 'ပေါ်ဆောင်စာသား', en: 'Footer Text' })}
        value={draft.company_footer_text}
        onChange={(v) => setDraft((d) => d && { ...d, company_footer_text: v })}
        onBlur={() => commit('company_footer_text', draft.company_footer_text)}
        fullWidth
      />
      <Field
        label={t({ my: 'PDF ဖိုင်တွဲ', en: 'PDF Directory' })}
        value={draft.pdf_dir}
        onChange={(v) => setDraft((d) => d && { ...d, pdf_dir: v })}
        onBlur={() => commit('pdf_dir', draft.pdf_dir)}
      />
    </section>
  )
}

function ThemeTab({
  draft,
  setDraft,
  commit,
  t,
}: {
  draft: DraftState
  setDraft: React.Dispatch<React.SetStateAction<DraftState | null>>
  commit: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  t: ReturnType<typeof useT>
}): JSX.Element {
  return (
    <section className="space-y-4 rounded-lg border border-border bg-surface p-4">
      <div>
        <Text role="secondary" className="text-sm">
          {t({ my: 'အကြောင်းအရာ', en: 'Theme' })}
        </Text>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {THEMES.map((tt) => (
            <label
              key={tt.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded border p-2 text-sm transition-colors',
                draft.theme === tt.id
                  ? 'border-accent bg-accent-muted text-content-primary'
                  : 'border-border hover:bg-surface-hover',
              )}
            >
              <ChoiceIndicator selected={draft.theme === tt.id} />
              <input
                type="radio"
                name="theme"
                value={tt.id}
                checked={draft.theme === tt.id}
                onChange={() => {
                  setDraft((d) => d && { ...d, theme: tt.id })
                  commit('theme', tt.id)
                }}
                className="sr-only"
              />
              <span>{tt.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Text role="secondary" className="text-sm">
          {t({ my: 'ဘာသာစကား', en: 'Language' })}
        </Text>
        <div className="mt-2 flex gap-2">
          {(['my', 'en'] as const).map((lng) => (
            <label
              key={lng}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors',
                draft.language === lng
                  ? 'border-accent bg-accent-muted text-content-primary'
                  : 'border-border hover:bg-surface-hover',
              )}
            >
              <ChoiceIndicator selected={draft.language === lng} />
              <input
                type="radio"
                name="language"
                value={lng}
                checked={draft.language === lng}
                onChange={() => {
                  setDraft((d) => d && { ...d, language: lng })
                  commit('language', lng)
                }}
                className="sr-only"
              />
              <span>{lng === 'my' ? 'မြန်မာ' : 'English'}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <Text role="secondary" className="text-sm">
          {t({ my: 'စာလုံးအရွယ်အစား', en: 'Font Size' })}
        </Text>
        <div className="mt-2 flex flex-wrap gap-2">
          {(Object.keys(FONT_SIZE_LABELS) as FontSizeId[]).map((id) => (
            <label
              key={id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-sm transition-colors',
                draft.font_size === id
                  ? 'border-accent bg-accent-muted text-content-primary'
                  : 'border-border hover:bg-surface-hover',
              )}
            >
              <ChoiceIndicator selected={draft.font_size === id} />
              <input
                type="radio"
                name="font-size"
                value={id}
                checked={draft.font_size === id}
                onChange={() => {
                  setDraft((d) => d && { ...d, font_size: id })
                  commit('font_size', id)
                }}
                className="sr-only"
              />
              <span>
                {t(FONT_SIZE_LABELS[id])} ({Math.round(FONT_SIZE_SCALE[id] * 100)}%)
              </span>
            </label>
          ))}
        </div>
      </div>
    </section>
  )
}

function TinTab({
  draft,
  setDraft,
  commit,
  t,
}: {
  draft: DraftState
  setDraft: React.Dispatch<React.SetStateAction<DraftState | null>>
  commit: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  t: ReturnType<typeof useT>
}): JSX.Element {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <Text role="secondary" className="text-sm">
        {t({ my: 'တင်းတစ်တင်းလျှင် ပေါင်', en: 'Pounds per Tin' })}
      </Text>
      <input
        type="text"
        inputMode="decimal"
        value={draft.tin_formula}
        onChange={(e) => setDraft((d) => d && { ...d, tin_formula: e.target.value })}
        onBlur={() => commit('tin_formula', draft.tin_formula)}
        className="w-32 rounded border border-border bg-background px-2 py-1.5 text-sm"
      />
      <Text role="muted" className="text-xs">
        {t({
          my: 'ပျမ်းမျှ 50 ပေါင်/တင်း (မှားယွင်းပါက 50 ကို သုံးပါမည်)',
          en: 'Default 50 lb/tin. Invalid values resolve to 50.',
        })}
      </Text>
    </section>
  )
}

function MoistureTab({
  draft,
  commitMoisture,
  t,
}: {
  draft: DraftState
  commitMoisture: (rates: MoistureRates) => void
  t: ReturnType<typeof useT>
}): JSX.Element {
  const [localRates, setLocalRates] = useState<MoistureRates>(draft.moisture_rates)
  useEffect(() => {
    setLocalRates(draft.moisture_rates)
  }, [draft.moisture_rates])

  const updateRate = (label: MoistureLabel, value: number) => {
    setLocalRates((r) => ({ ...r, [label]: Number.isFinite(value) && value >= 0 ? value : 0 }))
  }

  const dirty = useMemo(
    () =>
      MOISTURE_LABEL_OPTIONS.some(
        (label) => localRates[label] !== draft.moisture_rates[label],
      ),
    [localRates, draft.moisture_rates],
  )

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <Text role="secondary" className="text-sm">
        {t({
          my: 'အစိုဓာတ် နုတ်ယူမှု (lb per 50 lb)',
          en: 'Moisture Deduction (lb per 50 lb)',
        })}
      </Text>

      <div className="grid gap-3 sm:grid-cols-2">
        {MOISTURE_LABEL_OPTIONS.map((label) => (
          <label key={label} className="flex flex-col gap-1 text-sm">
            <Text role="secondary">{label}</Text>
            <input
              type="number"
              min={0}
              step={1}
              value={localRates[label]}
              onChange={(e) => updateRate(label, Number(e.target.value))}
              className="w-32 rounded border border-border bg-background px-2 py-1.5"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => commitMoisture(localRates)}
          disabled={!dirty}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {t({ my: 'သိမ်းဆည်းမည်', en: 'Save' })}
        </button>
        <button
          type="button"
          onClick={() => setLocalRates(draft.moisture_rates)}
          disabled={!dirty}
          className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
        >
          {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
        </button>
        <Text role="muted" className="text-xs">
          {t({
            my: 'ပြောင်းလဲမှုသည် ယခုနောက်ပိုင်း ဝယ်ယူမှုများသို့သာ အသက်ဝင်ပါသည်',
            en: 'Changes apply only to purchases saved after this point.',
          })}
        </Text>
      </div>
    </section>
  )
}

function Field({
  label,
  value,
  onChange,
  onBlur,
  fullWidth,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  onBlur: () => void
  fullWidth?: boolean
}): JSX.Element {
  return (
    <label className={'flex flex-col gap-1 text-sm ' + (fullWidth ? 'sm:col-span-2' : '')}>
      <Text role="secondary">{label}</Text>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="rounded border border-border bg-background px-2 py-1.5"
      />
    </label>
  )
}

export default SettingsPage
