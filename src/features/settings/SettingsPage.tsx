/**
 * Settings feature page (Step 8/11) — PROJECT_SPEC §3.6.
 *
 * Two-panel Android-style layout:
 *  - Left rail: grouped section navigation (GENERAL / COMPANY / CALCULATION /
 *    SECURITY) with SettingsNavItem rows (icon box + title + current value).
 *  - Right panel: detail content (SettingsSection + SettingsRow content).
 *
 * Sections: Language · Font Size · Themes · Company · Calculations ·
 * Moisture · Security.
 * All updates go through `services/settings` (single-writer rule, ARCHITECTURE §3.7).
 * Step 11 §1 — circular selection indicators on choice rows.
 * Step 11 §5 — theme choice immediately applies via `applyTheme`/`data-theme`.
 * Responsive (reference SettingsPage concept): below 520px the master-detail
 * panes collapse to a menu → detail flow with a back button; above it both
 * panes sit side-by-side and scroll internally, so nothing overflows on
 * Android portrait phones/tablets.
 */
import { useEffect, useRef, useState } from 'react'

import { useAppStore } from '@/app/state'
import { MOISTURE_LABEL_OPTIONS, type MoistureLabel, type MoistureRates } from '@/domain/paddy/moisture'
import { getDatabase } from '@/infrastructure/db'
import { settingsService } from '@/services/settings'
import { useSettingsStore } from '@/shared/state'
import { applyFontSize, applyTheme, FONT_SIZE_LABELS, FONT_SIZE_SCALE, type FontSizeId } from '@/shared/theme'
import { normalizeTheme, THEMES, type ThemeId } from '@/shared/theme/themes'
import { useT } from '@/shared/hooks'
import type { Settings } from '@/types'
import { BackIcon, Text, cn } from '@/shared/ui'
import { SecurityTab } from '@/features/security/SecurityTab'
import { PrinterTab } from './PrinterTab'
import { BackupTab } from './BackupTab'
import { SettingsNavItem, SettingsSection, SettingsRow } from '@/shared/ui/settings'
import {
  IconBuilding,
  IconCalculator,
  IconDroplet,
  IconGlobe,
  IconMapPin,
  IconPalette,
  IconPhone,
  IconPrinter,
  IconDatabase,
  IconShield,
  IconTextSize,
} from '@/shared/ui/settings/icons'


type Tab = 'company' | 'theme' | 'language' | 'font' | 'tin' | 'moisture' | 'security' | 'backup' | 'printer'

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
  printer_type: 'none' | 'mock' | 'bluetooth' | 'desktop'
  paper_width: '58' | '80'
  copies: number
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
    printer_type: s?.printer_type ?? 'none',
    paper_width: s?.paper_width ?? '58',
    copies: s?.copies ?? 1,
  }
}

/** Circular radio-dot indicator (Android-style choice row). */
function RadioDot({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      className={cn(
        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors',
        selected ? 'border-accent' : 'border-border',
      )}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  )
}

export function SettingsPage(): JSX.Element {
  const t = useT()
  const dbReady = useAppStore((s) => s.dbReady)
  const settings = useSettingsStore((s) => s.settings)
  const [draft, setDraft] = useState<DraftState | null>(null)
  const [tab, setTab] = useState<Tab>('theme')
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  // Reference master-detail behavior (~/paddyprice SettingsPage): below the
  // 520px breakpoint only ONE pane shows at a time (menu ↔ detail, with a
  // back button); ≥520px both panes are always visible side-by-side.
  const [mobilePane, setMobilePane] = useState<'menu' | 'detail'>('menu')
  const detailRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!dbReady) return
    try {
      const db = getDatabase()
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
      if (key === 'theme') applyTheme(value as ThemeId)
      if (key === 'font_size') applyFontSize(value as FontSizeId)
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

  interface NavItem {
    id: Tab
    icon: JSX.Element
    title: string
    subtitle: string
  }

  const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
    {
      label: t({ my: 'အထွေထွေ', en: 'General' }),
      items: [
        {
          id: 'language',
          icon: <IconGlobe />,
          title: t({ my: 'ဘာသာစကား', en: 'Language' }),
          subtitle: draft.language === 'my' ? 'မြန်မာ' : 'English',
        },
        {
          id: 'font',
          icon: <IconTextSize />,
          title: t({ my: 'စာလုံးအရွယ်', en: 'Font Size' }),
          subtitle: `${t(FONT_SIZE_LABELS[draft.font_size])} (${Math.round(FONT_SIZE_SCALE[draft.font_size] * 100)}%)`,
        },
        {
          id: 'theme',
          icon: <IconPalette />,
          title: t({ my: 'အပြင်အဆင်', en: 'Themes' }),
          subtitle: THEMES.find((th) => th.id === draft.theme)?.name ?? draft.theme,
        },
        {
          id: 'printer',
          icon: <IconPrinter />,
          title: t({ my: 'ပရင်တာ', en: 'Printer' }),
          subtitle: draft.printer_type === 'none' ? t({ my: 'မရွေးထားပါ', en: 'None' }) : draft.printer_type,
        },
      ],
    },
    {
      label: t({ my: 'ကုမ္ပဏီ', en: 'Company' }),
      items: [
        {
          id: 'company',
          icon: <IconBuilding />,
          title: t({ my: 'ကုမ္ပဏီ', en: 'Company' }),
          subtitle: draft.company_name,
        },
      ],
    },
    {
      label: t({ my: 'တွက်ချက်မှု', en: 'Calculation' }),
      items: [
        {
          id: 'tin',
          icon: <IconCalculator />,
          title: t({ my: 'တွက်ချက်မှု', en: 'Calculations' }),
          subtitle: `${draft.tin_formula} lb`,
        },
        {
          id: 'moisture',
          icon: <IconDroplet />,
          title: t({ my: 'အစိုဓာတ်', en: 'Moisture' }),
          subtitle: `${MOISTURE_LABEL_OPTIONS[0]}–${MOISTURE_LABEL_OPTIONS[MOISTURE_LABEL_OPTIONS.length - 1]} lb`,
        },
      ],
    },
    {
      label: t({ my: 'လုံခြုံမှု', en: 'Security' }),
      items: [
        {
          id: 'security',
          icon: <IconShield />,
          title: t({ my: 'လုံခြုံမှု', en: 'Security' }),
          subtitle: t({ my: 'ပုံစံနှင့် PIN', en: 'Pattern & PIN' }),
        },
        {
          id: 'backup',
          icon: <IconDatabase />,
          title: t({ my: 'Backup & Restore', en: 'Backup & Restore' }),
          subtitle: t({ my: 'အရံအထောက် / ပြန်ထည့်ခြင်း', en: 'Backup and restore app data' }),
        },
      ],
    },
  ]

  return (
    <div className="flex min-h-0 flex-col min-[520px]:h-[calc(100dvh-5rem)]" data-page="settings">
      {saveMessage && (
        <div className="mx-4 mt-3 rounded border border-border bg-surface p-2">
          <Text role="primary">{saveMessage}</Text>
        </div>
      )}

      {/* Two-panel layout — pane switching below 520px (one pane at a time,
          page scrolls naturally); side-by-side internally-scrolling panes above
          it (reference master-detail concept). */}
      <div className="flex min-h-0 flex-1 min-[520px]:overflow-hidden">
        {/* Left nav rail — Android system settings style */}
        <nav
          aria-label={t({ my: 'ဆက်တင် အပိုင်းများ', en: 'Settings sections' })}
          className={cn(
            'w-full shrink-0 bg-surface px-3 py-4',
            mobilePane === 'menu' ? 'block' : 'hidden',
            'min-[520px]:block min-[520px]:w-[40%] min-[520px]:max-w-[21rem] min-[520px]:overflow-y-auto',
            'min-[520px]:border-r min-[520px]:border-border min-[520px]:pr-4',
            'lg:w-[36%] lg:max-w-[22rem]',
          )}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="mt-5 first:mt-1">
              <div className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                {group.label}
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <SettingsNavItem
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    subtitle={item.subtitle}
                    selected={tab === item.id}
                    onClick={() => {
                      setTab(item.id)
                      setMobilePane('detail')
                      detailRef.current?.scrollTo({ top: 0 })
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

                {/* Right detail panel */}
        <div
          ref={detailRef}
          className={cn(
            'min-h-0 min-w-0 flex-1 bg-surface px-4 py-4',
            mobilePane === 'detail' ? 'block' : 'hidden',
            'min-[520px]:block min-[520px]:overflow-y-auto',
          )}
        >
          {/* Mobile back button — reference detail-pane concept */}
          <button
            type="button"
            onClick={() => setMobilePane('menu')}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-accent min-[520px]:hidden"
          >
            <BackIcon size="h-4 w-4" aria-label={t({ my: 'နောက်သို့', en: 'Back' })} />
            {t({ my: 'ဆက်တင်စာရင်း', en: 'All settings' })}
          </button>
          {tab === 'company' && (
            <CompanyTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'theme' && (
            <ThemeTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'language' && (
            <LanguageTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
          )}
          {tab === 'font' && (
            <FontSizeTab draft={draft} setDraft={setDraft} commit={commit} t={t} />
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
          {tab === 'backup' && (
            <BackupTab t={t} />
          )}
          {tab === 'printer' && (
            <PrinterTab
              printerType={draft.printer_type}
              paperWidth={draft.paper_width}
              copies={draft.copies}
              onUpdate={(key, value) => commit(key, value as never)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

/* ----------------------- Tab content components ----------------------- */

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
    <>
      <SettingsSection
        hideHeader
        title={t({ my: 'ကုမ္ပဏီ အချက်အလက်', en: 'Company Information' })}
      >
        <SettingsRow
          title={t({ my: 'ကုမ္ပဏီအမည်', en: 'Company Name' })}
          control={
            <input
              type="text"
              value={draft.company_name}
              onChange={(e) => setDraft((d) => d && { ...d, company_name: e.target.value })}
              onBlur={() => commit('company_name', draft.company_name)}
              className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm text-content-primary"
            />
          }
        />
        <SettingsRow
          icon={<IconMapPin />}
          title={t({ my: 'လိပ်စာ', en: 'Address' })}
          control={
            <input
              type="text"
              value={draft.company_address}
              onChange={(e) => setDraft((d) => d && { ...d, company_address: e.target.value })}
              onBlur={() => commit('company_address', draft.company_address)}
              className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm text-content-primary"
            />
          }
        />
        <SettingsRow
          icon={<IconPhone />}
          title={t({ my: 'ဖုန်း', en: 'Phone' })}
          control={
            <input
              type="text"
              value={draft.company_phone}
              onChange={(e) => setDraft((d) => d && { ...d, company_phone: e.target.value })}
              onBlur={() => commit('company_phone', draft.company_phone)}
              className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm text-content-primary"
            />
          }
        />
        <SettingsRow
          title={t({ my: 'PDF Footer စာသား', en: 'PDF Footer Text' })}
          description={
            t({
              my: 'Voucher အောက်ခြေမှာ Thank you for your business အောက်တွင် ပေါ်မည့် မြန်မာစာ',
              en: 'Myanmar text shown under Thank you for your business in the voucher footer',
            })
          }
          control={
            <input
              type="text"
              value={draft.company_footer_text}
              onChange={(e) => setDraft((d) => d && { ...d, company_footer_text: e.target.value })}
              onBlur={() => commit('company_footer_text', draft.company_footer_text)}
              className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm text-content-primary"
            />
          }
        />
        <SettingsRow
          title={t({ my: 'PDF Directory', en: 'PDF Directory' })}
          description={
            t({
              my: 'PDF ဖိုင်များ သိမ်းဆည်းမည့် ဖိုင်တွဲ',
              en: 'Folder used for generated PDF files',
            })
          }
          control={
            <input
              type="text"
              value={draft.pdf_dir}
              onChange={(e) => setDraft((d) => d && { ...d, pdf_dir: e.target.value })}
              onBlur={() => commit('pdf_dir', draft.pdf_dir)}
              className="min-w-[140px] rounded border border-border bg-background px-2 py-1 text-sm text-content-primary"
            />
          }
        />
      </SettingsSection>
    </>
  )
}

/** Shared props for the simple choice tabs (Theme / Language / Font Size). */
interface ChoiceTabProps {
  draft: DraftState
  setDraft: React.Dispatch<React.SetStateAction<DraftState | null>>
  commit: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  t: ReturnType<typeof useT>
}

/** Colour preview chips under each theme name (settings theme list). */
function ThemeSwatches({ swatch }: { swatch: readonly string[] }): JSX.Element {
  return (
    <span className="flex gap-1.5" aria-hidden>
      {swatch.map((c, i) => (
        <span
          key={`${i}-${c}`}
          className="h-2.5 w-5 rounded-[3px] border border-border"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  )
}

function ThemeTab({ draft, setDraft, commit, t }: ChoiceTabProps): JSX.Element {
  return (
    <SettingsSection
      hideHeader
      title={t({ my: 'အကြောင်းအရာ', en: 'Theme' })}
    >
      {THEMES.map((th) => (
        <SettingsRow
          key={th.id}
          title={th.name}
          description={<ThemeSwatches swatch={th.swatch} />}
          onClick={() => {
            setDraft((d) => d && { ...d, theme: th.id })
            commit('theme', th.id)
          }}
          control={<RadioDot selected={draft.theme === th.id} />}
        />
      ))}
    </SettingsSection>
  )
}

function LanguageTab({ draft, setDraft, commit, t }: ChoiceTabProps): JSX.Element {
  return (
    <SettingsSection
      hideHeader
      title={t({ my: 'ဘာသာစကား', en: 'Language' })}
    >
      <SettingsRow
        title="မြန်မာ"
        description={t({ my: 'App ကို မြန်မာဘာသာဖြင့် ပြသမည်', en: 'Display the app in Myanmar' })}
        onClick={() => {
          setDraft((d) => d && { ...d, language: 'my' })
          commit('language', 'my')
        }}
        control={<RadioDot selected={draft.language === 'my'} />}
      />
      <SettingsRow
        title="English"
        description={t({ my: 'App ကို အင်္ဂလိပ်ဘာသာဖြင့် ပြသမည်', en: 'Display the app in English' })}
        onClick={() => {
          setDraft((d) => d && { ...d, language: 'en' })
          commit('language', 'en')
        }}
        control={<RadioDot selected={draft.language === 'en'} />}
      />
    </SettingsSection>
  )
}

function FontSizeTab({ draft, setDraft, commit, t }: ChoiceTabProps): JSX.Element {
  return (
    <SettingsSection
      hideHeader
      title={t({ my: 'စာလုံးအရွယ်', en: 'Font Size' })}
    >
      {(Object.keys(FONT_SIZE_LABELS) as FontSizeId[]).map((id) => (
        <SettingsRow
          key={id}
          title={
            <>
              {t(FONT_SIZE_LABELS[id])}
              <span className="ml-2 text-xs font-normal text-content-muted">
                ({Math.round(FONT_SIZE_SCALE[id] * 100)}%)
              </span>
            </>
          }
          onClick={() => {
            setDraft((d) => d && { ...d, font_size: id })
            commit('font_size', id)
          }}
          control={<RadioDot selected={draft.font_size === id} />}
        />
      ))}
    </SettingsSection>
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
    <SettingsSection
      hideHeader
      title={t({ my: 'အလေးချိန် တွက်ချက်ခြင်း', en: 'Weight Calculation' })}
    >
      <SettingsRow
        title="1 Tin = ? Pounds"
        description={
          t({
            my: 'စပါးအလေးချိန် တွက်ချက်ရာတွင် အသုံးပြုသည်',
            en: 'Used for paddy weight calculation',
          })
        }
        control={
          <input
            type="text"
            inputMode="decimal"
            value={draft.tin_formula}
            onChange={(e) => setDraft((d) => d && { ...d, tin_formula: e.target.value })}
            onBlur={() => commit('tin_formula', draft.tin_formula)}
            className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-content-primary tabular-nums"
          />
        }
      />
      <SettingsRow
        title={t({ my: 'Default', en: 'Default' })}
        description={
          t({
            my: 'ပျမ်းမျှ 50 ပေါင်/တင်း (မှားယွင်းပါက 50 ကို သုံးပါမည်)',
            en: 'Default 50 lb/tin. Invalid values resolve to 50.',
          })
        }
      />
    </SettingsSection>
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
  // Rate inputs keep their RAW TEXT while editing. A controlled numeric value
  // that snaps empty input back to 0 makes the zero impossible to clear —
  // typing "17" produced "017"/"01". Numbers are normalized only on blur/save.
  const ratesToText = (rates: MoistureRates): Record<MoistureLabel, string> =>
    Object.fromEntries(
      MOISTURE_LABEL_OPTIONS.map((label) => [label, String(rates[label] ?? 0)]),
    ) as Record<MoistureLabel, string>

  const [localRates, setLocalRates] = useState<Record<MoistureLabel, string>>(() =>
    ratesToText(draft.moisture_rates),
  )

  useEffect(() => {
    setLocalRates(ratesToText(draft.moisture_rates))
  }, [draft.moisture_rates])

  const parseRate = (text: string): number => {
    const n = Number(text)
    return Number.isFinite(n) && n >= 0 ? n : 0
  }

  const dirty = MOISTURE_LABEL_OPTIONS.some(
    (label) => parseRate(localRates[label]) !== draft.moisture_rates[label],
  )

  return (
    <SettingsSection
      hideHeader
      title={t({ my: 'အစိုဓာတ် နုတ်ယူမှု (lb per 50 lb)', en: 'Moisture Deduction (lb per 50 lb)' })}
    >
      {MOISTURE_LABEL_OPTIONS.map((label) => (
        <SettingsRow
          key={label}
          title={String(label)}
          description={t({ my: 'lb/50 lb', en: 'lb/50 lb' })}
          control={
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={localRates[label]}
              onChange={(e) => setLocalRates((r) => ({ ...r, [label]: e.target.value }))}
              onBlur={() => setLocalRates((r) => ({ ...r, [label]: String(parseRate(r[label])) }))}
              className="w-24 rounded border border-border bg-background px-2 py-1 text-sm text-content-primary tabular-nums"
            />
          }
        />
      ))}
      <SettingsRow
        title={t({
          my: 'ပြောင်းလဲမှုသည် ယခုနောက်ပိုင်း ဝယ်ယူမှုများသို့သာ အသက်ဝင်ပါသည်',
          en: 'Changes apply only to purchases saved after this point.',
        })}
        description=""
      />
      <SettingsRow
        title=""
        control={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                commitMoisture(
                  Object.fromEntries(
                    MOISTURE_LABEL_OPTIONS.map((label) => [label, parseRate(localRates[label])]),
                  ) as MoistureRates,
                )
              }
              disabled={!dirty}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
            >
              {t({ my: 'သိမ်းဆည်းမည်', en: 'Save' })}
            </button>
            <button
              type="button"
              onClick={() => setLocalRates(ratesToText(draft.moisture_rates))}
              disabled={!dirty}
              className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
            </button>
          </div>
        }
      />
    </SettingsSection>
  )
}

export default SettingsPage
