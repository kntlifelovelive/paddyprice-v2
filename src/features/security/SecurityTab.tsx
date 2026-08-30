/**
 * SecurityTab — the Security section shown in the Settings page.
 * Lets users enable/disable App Lock and configure Pattern / PIN credentials.
 * All persistence goes through the App Lock service; no direct DB access here.
 */
import { useEffect, useState } from 'react'
import { useT } from '@/shared/hooks'
import { Text, cn, LockIcon, ShieldIcon, CheckIcon } from '@/shared/ui'
import { PatternPad } from './PatternPad'
import { getDatabase } from '@/infrastructure/db'
import {
  readSecurityConfig,
  setSecurityEnabled,
  savePattern,
  clearPattern,
  savePin,
  clearPin,
} from '@/services/security/app-lock'
import { isValidPin } from '@/services/security/verifier'
import type { SecurityConfig } from '@/types/security'

/** Phase: which screen to show. */
type Phase = 'main' | 'pattern-set' | 'pin-set' | 'pin-confirm' | 'clearing-pattern' | 'clearing-pin'

interface Props {
  t: ReturnType<typeof useT>
}

export function SecurityTab({ t }: Props): JSX.Element {
  const [config, setConfig] = useState<SecurityConfig | null>(null)
  const [phase, setPhase] = useState<Phase>('main')
  const [pendingPattern, setPendingPattern] = useState<number[] | null>(null)
  const [pendingPin, setPendingPin] = useState<string>('')
  const [pinDraft, setPinDraft] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  function load(): void {
    setConfig(readSecurityConfig(getDatabase()))
  }

  useEffect(() => { load() }, [])

  function toggleEnabled(): void {
    if (!config) return
    setSecurityEnabled(getDatabase(), !config.enabled)
    load()
  }

  // Pattern setup
  async function handlePatternSubmit(points: number[]): Promise<void> {
    if (phase === 'clearing-pattern') {
      setSaving(true)
      await clearPattern(getDatabase())
      setSaving(false)
      setPhase('main')
      setMessage(t({ my: 'ပုံစံ ဖယ်ရှားပြီးပါပြီ', en: 'Pattern removed' }))
      load()
      return
    }
    if (phase === 'pattern-set') {
      setPendingPattern(points)
      setPhase('pin-confirm')
      return
    }
    // pin-confirm → save both
    if (phase === 'pin-confirm' && pendingPattern) {
      setSaving(true)
      await savePattern(getDatabase(), pendingPattern)
      await savePin(getDatabase(), pendingPin)
      setSaving(false)
      setPhase('main')
      setPendingPattern(null)
      setPendingPin('')
      setMessage(t({ my: 'လုံခြုံမှု သိမ်းဆည်းပြီးပါပြီ', en: 'Security saved' }))
      load()
    }
  }

  // PIN setup
  function handlePinChange(val: string): void {
    const digits = val.replace(/[^0-9]/g, '').slice(0, 8)
    if (phase === 'pin-set') {
      setPinDraft(digits)
      if (digits.length >= 4) {
        setPendingPin(digits)
        setPhase('pin-confirm')
        setPinDraft('')
      }
    }
  }

  async function handleClearPattern(): Promise<void> {
    setSaving(true)
    await clearPattern(getDatabase())
    setSaving(false)
    setMessage(t({ my: 'ပုံစံ ဖယ်ရှားပြီးပါပြီ', en: 'Pattern removed' }))
    load()
  }

  async function handleClearPin(): Promise<void> {
    setSaving(true)
    await clearPin(getDatabase())
    setSaving(false)
    setMessage(t({ my: 'PIN ဖယ်ရှားပြီးပါပြီ', en: 'PIN removed' }))
    load()
  }

  if (!config) {
    return <div className="text-sm text-content-muted">{t({ my: 'ဖွင့်နေသည်…', en: 'Loading…' })}</div>
  }

  // ---- Sub-views ----
  if (phase === 'pattern-set' || phase === 'clearing-pattern') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <Text role="primary" className="text-sm font-medium">
          {phase === 'pattern-set'
            ? t({ my: 'ပုံစံ သတ်မှတ်ပါ', en: 'Set Pattern' })
            : t({ my: 'ပုံစံ ဖယ်ရှားမည်', en: 'Remove Pattern' })}
        </Text>
        <PatternPad onSubmit={handlePatternSubmit} disabled={saving} size={220} />
        <button
          type="button"
          onClick={() => setPhase('main')}
          className="rounded border border-border bg-surface px-4 py-1.5 text-sm hover:bg-surface-hover"
        >
          {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
        </button>
      </div>
    )
  }

  if (phase === 'pin-set') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <Text role="primary" className="text-sm font-medium">
          {t({ my: 'PIN သတ်မှတ်ပါ', en: 'Set PIN' })}
        </Text>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pinDraft}
          onChange={(e) => handlePinChange(e.target.value)}
          className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-center text-xl tracking-widest"
          placeholder="••••"
          maxLength={8}
          aria-label="PIN"
        />
        <Text role="muted" className="text-xs">
          {t({ my: '4-8 ဂဏန်း', en: '4–8 digits' })}
        </Text>
        <button
          type="button"
          onClick={() => setPhase('main')}
          className="rounded border border-border bg-surface px-4 py-1.5 text-sm hover:bg-surface-hover"
        >
          {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
        </button>
      </div>
    )
  }

  if (phase === 'pin-confirm') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <Text role="primary" className="text-sm font-medium">
          {pendingPattern
            ? t({ my: 'PIN ထပ်သတ်မှတ်ပါ', en: 'Also set a PIN (4–8 digits)' })
            : t({ my: 'PIN အတည်ပြုပါ', en: 'Confirm PIN' })}
        </Text>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={pinDraft}
          onChange={(e) => setPinDraft(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
          className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-center text-xl tracking-widest"
          placeholder="••••"
          aria-label="Confirm PIN"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              if (!isValidPin(pinDraft)) return
              setSaving(true)
              if (pendingPattern) {
                await savePattern(getDatabase(), pendingPattern)
              }
              await savePin(getDatabase(), pinDraft)
              setSaving(false)
              setPhase('main')
              setPendingPattern(null)
              setPendingPin('')
              setMessage(t({ my: 'လုံခြုံမှု သိမ်းဆည်းပြီးပါပြီ', en: 'Security saved' }))
              load()
            }}
            disabled={saving || !isValidPin(pinDraft)}
            className="rounded bg-accent px-4 py-1.5 text-sm text-accent-text hover:bg-accent-hover disabled:opacity-50"
          >
            {t({ my: 'သိမ်းမည်', en: 'Save' })}
          </button>
          <button
            type="button"
            onClick={() => { setPhase('main'); setPendingPattern(null); setPinDraft('') }}
            className="rounded border border-border bg-surface px-4 py-1.5 text-sm hover:bg-surface-hover"
          >
            {t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
          </button>
        </div>
      </div>
    )
  }

  // ---- Main view ----
  return (
    <div className="space-y-4">
      {message && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
          <CheckIcon size="h-4 w-4" aria-label="Success" />
          {message}
        </div>
      )}

      {/* Master toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-surface p-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-surface-hover p-2 text-accent">
            <ShieldIcon size="h-5 w-5" aria-label="Security" />
          </div>
          <div>
            <Text role="primary" className="text-sm font-medium">
              {t({ my: 'App Lock', en: 'App Lock' })}
            </Text>
            <Text role="muted" className="text-xs">
              {config.enabled
                ? t({ my: 'App လော့ခ်ချထားသည်', en: 'App is locked' })
                : t({ my: 'App Lock disabled', en: 'App Lock disabled' })}
            </Text>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={config.enabled}
          onClick={toggleEnabled}
          className={cn(
            'relative h-6 w-11 rounded-full transition-colors',
            config.enabled ? 'bg-accent' : 'bg-border',
          )}
        >
          <span
            className={cn(
              'absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform',
              config.enabled ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>

      {/* Credentials status */}
      <div className="space-y-2">
        <Text role="header" className="text-sm font-semibold">
          {t({ my: 'လုံခြုံမှု နည်းလမ်း', en: 'Security Methods' })}
        </Text>

        {/* Pattern */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <LockIcon size="h-4 w-4 text-content-secondary" aria-label="Pattern" />
            <Text role="secondary" className="text-sm">{t({ my: 'ပုံစံ', en: 'Pattern' })}</Text>
          </div>
          <div className="flex items-center gap-2">
            {config.hasPattern ? (
              <>
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckIcon size="h-3 w-3" aria-label="Configured" />
                  {t({ my: 'သတ်မှတ်ပြီး', en: 'Set' })}
                </span>
                <button
                  type="button"
                  onClick={handleClearPattern}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-hover"
                >
                  {t({ my: 'ဖယ်ရှား', en: 'Remove' })}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPhase('pattern-set')}
                disabled={!config.enabled}
                className="rounded border border-accent bg-accent px-2 py-1 text-xs text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {t({ my: 'သတ်မှတ်မည်', en: 'Set' })}
              </button>
            )}
          </div>
        </div>

        {/* PIN */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
          <div className="flex items-center gap-2">
            <LockIcon size="h-4 w-4 text-content-secondary" aria-label="PIN" />
            <Text role="secondary" className="text-sm">{t({ my: 'PIN', en: 'PIN' })}</Text>
          </div>
          <div className="flex items-center gap-2">
            {config.hasPin ? (
              <>
                <span className="flex items-center gap-1 text-xs text-success">
                  <CheckIcon size="h-3 w-3" aria-label="Configured" />
                  {t({ my: 'သတ်မှတ်ပြီး', en: 'Set' })}
                </span>
                <button
                  type="button"
                  onClick={handleClearPin}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs hover:bg-surface-hover"
                >
                  {t({ my: 'ဖယ်ရှား', en: 'Remove' })}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setPhase('pin-set')}
                disabled={!config.enabled}
                className="rounded border border-accent bg-accent px-2 py-1 text-xs text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {t({ my: 'သတ်မှတ်မည်', en: 'Set' })}
              </button>
            )}
          </div>
        </div>

        <Text role="muted" className="text-xs">
          {t({ my: 'အနည်းဆုံး တစ်ခုသတ်မှတ်ရပါမည်', en: 'At least one method must be set when App Lock is enabled.' })}
        </Text>
      </div>
    </div>
  )
}
