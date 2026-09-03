/**
 * Printer Settings tab — ports the reference project's Printer Settings
 * functionality into P2's existing Settings UI pattern.
 *
 * Uses P2's existing SettingsSection / SettingsRow / RadioDot components and
 * the project's existing SVG icon set. No new settings architecture — printer
 * config is persisted through the existing settings service (key/value store).
 *
 * Reference: `~/paddyprice/src/components/PrinterSettings.tsx`
 */
import { useEffect, useState } from 'react'
import { useT } from '@/shared/hooks'
import { SettingsRow } from '@/shared/ui/settings'
import type { PaperWidth, PrinterType } from '@/types/print'

const PRINTER_TYPES: { value: PrinterType; my: string; en: string }[] = [
  { value: 'none', my: 'မရွေးထားပါ', en: 'None' },
  { value: 'desktop', my: 'ဒက်စ်တော့ပ် (ဘရောက်ဇာ)', en: 'Desktop (Browser)' },
  { value: 'mock', my: 'မော့ခ် (စမ်းသပ်)', en: 'Mock (Test)' },
  { value: 'bluetooth', my: 'ဘလူးသုး (အန်ဒရွိုက်)', en: 'Bluetooth (Android)' },
]

const PAPER_WIDTHS: { value: PaperWidth; label: string }[] = [
  { value: '58', label: '58mm (32)' },
  { value: '80', label: '80mm (48)' },
]

/** Circular radio-dot indicator (Android-style choice row). */
function RadioDot({ selected }: { selected: boolean }): JSX.Element {
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors ${
        selected ? 'border-accent' : 'border-border'
      }`}
    >
      {selected && <span className="h-2 w-2 rounded-full bg-accent" />}
    </span>
  )
}

export interface PrinterTabProps {
  printerType: PrinterType
  paperWidth: PaperWidth
  copies: number
  onUpdate: (key: 'printer_type' | 'paper_width' | 'copies', value: string | number) => void
}

export function PrinterTab({ printerType, paperWidth, copies, onUpdate }: PrinterTabProps): JSX.Element {
  const t = useT()
  const [localCopies, setLocalCopies] = useState(String(copies))

  useEffect(() => {
    setLocalCopies(String(copies))
  }, [copies])

  const commitCopies = (raw: string) => {
    const n = Number(raw)
    if (Number.isFinite(n) && n >= 1 && n <= 5) {
      onUpdate('copies', Math.trunc(n))
    } else {
      setLocalCopies(String(copies))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Printer type selection */}
      <div className="flex flex-col gap-1">
        <span className="px-1 text-sm font-medium text-content-primary">
          {t({ my: 'ပရင်တာ အမျိုးအစား', en: 'Printer Type' })}
        </span>
        <div className="flex flex-col rounded-lg border border-border bg-surface">
          {PRINTER_TYPES.map((opt, i) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate('printer_type', opt.value)}
              className={`flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                i > 0 ? 'border-t border-border' : ''
              } ${printerType === opt.value ? 'bg-surface-hover' : 'hover:bg-surface-hover'}`}
            >
              <RadioDot selected={printerType === opt.value} />
              <span className="text-content-primary">{t({ my: opt.my, en: opt.en })}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Paper width selection */}
      <div className="flex flex-col gap-1">
        <span className="px-1 text-sm font-medium text-content-primary">
          {t({ my: 'စက္ကူအကျယ်', en: 'Paper Width' })}
        </span>
        <div className="flex gap-3">
          {PAPER_WIDTHS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onUpdate('paper_width', opt.value)}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                paperWidth === opt.value
                  ? 'border-accent bg-surface-hover'
                  : 'border-border bg-surface hover:bg-surface-hover'
              }`}
            >
              <RadioDot selected={paperWidth === opt.value} />
              <span className="text-content-primary">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Copies */}
      <SettingsRow
        title={t({ my: 'မိတ္တူအရေအတွက်', en: 'Copies' })}
        description={t({
          my: '၁ မှ ၅ အထိ',
          en: 'Between 1 and 5.',
        })}
        control={
          <input
            type="number"
            min={1}
            max={5}
            step={1}
            value={localCopies}
            onChange={(e) => setLocalCopies(e.target.value)}
            onBlur={(e) => commitCopies(e.target.value)}
            className="w-20 rounded border border-border bg-background px-2 py-1 text-sm text-content-primary tabular-nums"
          />
        }
      />

      {/* Status / info */}
      <SettingsRow
        title={t({ my: 'လက်ရှိအခြေအနေ', en: 'Current Status' })}
        description={
          printerType === 'bluetooth'
            ? t({
                my: 'ဘလူးသုး ပရင်တာသည် ဖုန်းစက်ပလပ်အင် လိုအပ်ပါသည်',
                en: 'Bluetooth printer requires the native Capacitor plugin.',
              })
            : printerType === 'none'
              ? t({ my: 'ပရင်တာ မရွေးထားပါ', en: 'No printer selected.' })
              : t({ my: 'အသင့်တော်သည်', en: 'Ready.' })
        }
      />
    </div>
  )
}
