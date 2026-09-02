/**
 * SecurityTab — the Security section shown in the Settings page (reference
 * `SecuritySettings.tsx` concept): an App Lock master toggle, auto-lock
 * timeout, and separate Pattern / PIN management with Set / Change / Remove
 * flows. Remove and Change require verifying the CURRENT credential first
 * (via the stored verifier, never the lock gate) and destructive removals go
 * through a ConfirmDialog. All persistence goes through the App Lock service;
 * after each mutation the shared security event bus is notified so the app
 * gate reloads the config immediately (web + Android).
 *
 * Raw PIN / pattern values exist only transiently in form state and are never
 * logged or stored; only PBKDF2 verifiers reach the settings table. */
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/shared/hooks'
import { Text, LockIcon, ToggleSwitch } from '@/shared/ui'
import { ConfirmDialog } from '@/shared/ui'
import { PatternPad } from '@/shared/ui'
import { getDatabase } from '@/infrastructure/db'
import { getSetting } from '@/infrastructure/db/dao/settings'
import {
  clearPattern,
  clearPin,
  emitSecurityEvent,
  readSecurityConfig,
  savePattern,
  savePin,
  setSecurityEnabled,
  setSecurityTimeout,
  SECURITY_KEY_PATTERN,
  SECURITY_KEY_PIN,
} from '@/services/security/app-lock'
import { AUTO_LOCK_TIMEOUTS, parseAutoLockTimeout } from '@/services/security/auto-lock'
import type { AutoLockTimeout } from '@/types'
import {
  isValidPattern,
  isValidPin,
  MAX_PIN_LENGTH,
  patternToSecret,
  verifySecret,
} from '@/services/security/verifier'
import { SettingsSection, SettingsRow } from '@/shared/ui/settings'
import { IconHash, IconPattern, IconTimer } from '@/shared/ui/settings/icons'
import type { SecurityConfig } from '@/types/security'

/** Which flow/screen is active. */
type PinFlow = 'idle' | 'set' | 'change' | 'remove'
type PatternFlow = 'idle' | 'set' | 'set-confirm' | 'change-verify' | 'change-new' | 'change-confirm' | 'remove'
/** Destructive operation awaiting ConfirmDialog confirmation. */
type ConfirmAction = 'remove-pin' | 'remove-pattern'

/** Bilingual auto-lock timeout labels (reference-copy. */
const TIMEOUT_LABELS: Record<AutoLockTimeout, { my: string; en: string }> = {
  immediately: { my: 'ချက်ချင်း', en: 'Immediately' },
  '60': { my: '၁ မိနစ်', en: '1 minute' },
  '300': { my: '၅ မိနစ်', en: '5 minutes' },
  '900': { my: '၁၅ မိနစ်', en: '15 minutes' },
}

export function SecurityTab({ t }: { t: ReturnType<typeof useT> }): JSX.Element {
  const [config, setConfig] = useState<SecurityConfig | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // PIN flow
  const [pinFlow, setPinFlow] = useState<PinFlow>('idle')
  const [oldPin, setOldPin] = useState('')
  const [newPin1, setNewPin1] = useState('')
  const [newPin2, setNewPin2] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)

  // Pattern flow
  const [patternFlow, setPatternFlow] = useState<PatternFlow>('idle')
  const [firstDraw, setFirstDraw] = useState<number[] | null>(null)
  const [patternError, setPatternError] = useState<string | null>(null)

  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  function load(): void {
    setConfig(readSecurityConfig(getDatabase()))
  }
  useEffect(() => { load() }, [])

  /** Message auto-clears after 3s (reference `show()` behavior). Clears any
   *  prior timer first so a newer message can't be wiped out by an older one. */
  function show(msg: string): void {
    if (messageTimer.current) clearTimeout(messageTimer.current)
    setMessage(msg)
    messageTimer.current = setTimeout(() => setMessage(null), 3000)
  }

  /** After any persisted security mutation, refresh UI + notify the gate. */
  function emitChanged(): void {
    load()
    emitSecurityEvent('changed')
  }

  function handleToggleAppLock(): void {
    if (!config) return
    setSecurityEnabled(getDatabase(), !config.enabled)
    if (!config.enabled && !config.hasPattern && !config.hasPin) {
      show(t({ my: 'App Lock ဖွင့်ပြီး — ဆက်ပြီး ပုံစံ သို့မဟုတ် PIN သတ်မှတ်ပါ', en: 'App Lock is on — now set a pattern or PIN.' }))
    }
    emitChanged()
  }

  /** Pattern/PIN can only be configured once App Lock is on (reference). */
  function requireAppLock(): boolean {
    if (config?.enabled) return true
    show(t({ my: 'App Lock အရင်ဖွင့်ပါ — ပြီးမှ ပုံစံ/PIN သတ်မှတ်လို့ရသည်', en: 'Turn on App Lock first, then set a pattern or PIN.' }))
    return false
  }

  function handleTimeoutChange(value: string): void {
    setSecurityTimeout(getDatabase(), parseAutoLockTimeout(value))
    emitChanged()
  }

  function handleLockNow(): void {
    emitSecurityEvent('lock-now')
  }

  // ------------------------------ PIN ------------------------------------

  async function verifyPin(pin: string): Promise<boolean> {
    return verifySecret(pin, getSetting(getDatabase(), SECURITY_KEY_PIN))
  }

  const resetPinForm = () => {
    setPinFlow('idle')
    setOldPin('')
    setNewPin1('')
    setNewPin2('')
    setPinError(null)
  }

  function startPinFlow(flow: PinFlow): void {
    if (!requireAppLock()) return
    resetPinForm()
    setPinFlow(flow)
  }

  async function submitPinForm(): Promise<void> {
    setPinError(null)
    if (pinFlow === 'remove') {
      const ok = await verifyPin(oldPin)
      if (!ok) {
        setPinError(t({ my: 'လက်ရှိ PIN မမှန်ပါ', en: 'Current PIN is incorrect' }))
        setOldPin('')
        return
      }
      setConfirmAction('remove-pin')
      return
    }
    if (!isValidPin(newPin1)) {
      setPinError(t({ my: `PIN သည် 4-${MAX_PIN_LENGTH} လုံး ဂဏန်းသက်သတ် ဖြစ်ရမည်`, en: `PIN must be 4-${MAX_PIN_LENGTH} digits` }))
      return
    }
    if (newPin1 !== newPin2) {
      setPinError(t({ my: 'PIN နှစ်ခု မတူညီပါ', en: 'PINs do not match' }))
      return
    }
    if (pinFlow === 'change') {
      const ok = await verifyPin(oldPin)
      if (!ok) {
        setPinError(t({ my: 'လက်ရှိ PIN မမှန်ပါ', en: 'Current PIN is incorrect' }))
        return
      }
    }
    await savePin(getDatabase(), newPin1)
    show(pinFlow === 'set'
      ? t({ my: '✓ PIN သတ်မှတ်ပြီး', en: '✓ PIN saved' })
      : t({ my: '✓ PIN ပြောင်းပြီး', en: '✓ PIN changed' }))
    emitChanged()
    resetPinForm()
  }

  // ------------------------------ Pattern --------------------------------

  async function verifyPattern(points: number[]): Promise<boolean> {
    return verifySecret(patternToSecret(points), getSetting(getDatabase(), SECURITY_KEY_PATTERN))
  }

  const resetPatternFlow = () => {
    setPatternFlow('idle')
    setFirstDraw(null)
    setPatternError(null)
  }

  function startPatternFlow(flow: PatternFlow): void {
    if (!requireAppLock()) return
    resetPatternFlow()
    setPatternFlow(flow)
  }

  async function handlePatternComplete(points: number[]): Promise<void> {
    setPatternError(null)
    if (patternFlow === 'remove') {
      const ok = await verifyPattern(points)
      if (!ok) {
        setPatternError(t({ my: 'လက်ရှိပုံစံ မမှန်ပါ', en: 'Current pattern is incorrect' }))
        return
      }
      setConfirmAction('remove-pattern')
      return
    }
    if (patternFlow === 'change-verify') {
      const ok = await verifyPattern(points)
      if (!ok) {
        setPatternError(t({ my: 'လက်ရှိပုံစံ မမှန်ပါ', en: 'Current pattern is incorrect' }))
        return
      }
      setPatternFlow('change-new')
      return
    }
    if (patternFlow === 'change-new') {
      if (!isValidPattern(points)) {
        setPatternError(t({ my: 'ပုံစံအား အနည်းဆုံး ၄ စက်ဖြင့် ဆွဲပါ', en: 'At least 4 unique dots required' }))
        return
      }
      setFirstDraw(points)
      setPatternFlow('change-confirm')
      return
    }
    if (!isValidPattern(points)) {
      setPatternError(t({ my: 'ပုံစံအား အနည်းဆုံး ၄ စက်ဖြင့် ဆွဲပါ', en: 'At least 4 unique dots required' }))
      return
    }
    // 'set' → capture the first draw, then require a confirming redraw.
    if (patternFlow === 'set') {
      setFirstDraw(points)
      setPatternFlow('set-confirm')
      return
    }
    // 'set-confirm' | 'change-confirm' — the redraw must match the first draw.
    if (firstDraw && patternToSecret(points) !== patternToSecret(firstDraw)) {
      setPatternError(t({ my: 'ပုံစံ နှစ်ခု မတူညီပါ', en: 'Patterns do not match' }))
      return
    }
    await savePattern(getDatabase(), points)
    show(patternFlow === 'set-confirm'
      ? t({ my: '✓ ပုံစံ သတ်မှတ်ပြီး', en: '✓ Pattern saved' })
      : t({ my: '✓ ပုံစံ ပြောင်းပြီး', en: '✓ Pattern changed' }))
    emitChanged()
    resetPatternFlow()
  }

  // ----------------------------- confirm --------------------------------

  const confirmCopy: Record<ConfirmAction, { title: string; message: string; confirm: string }> = {
    'remove-pin': {
      title: t({ my: 'PIN ဖျက်မလား?', en: 'Remove PIN?' }),
      message: t({
        my: 'ဤစက်မှ PIN authentication ကို ဖယ်ရှားမည်။ ပုံစံ settings များ မပြောင်းလဲပါ။',
        en: 'This will remove PIN authentication from this device. Your Pattern settings will not be affected.',
      }),
      confirm: t({ my: 'PIN ဖျက်', en: 'Remove PIN' }),
    },
    'remove-pattern':{
      title: t({ my: 'ပုံစံ ဖျက်မလား?', en: 'Remove Pattern?' }),
      message: t({
        my: 'ဤစက်မှ Pattern authentication ကို ဖယ်ရှားမည်။ PIN settings များ မပြောင်းလဲပါ။',
        en: 'This will remove Pattern authentication from this device. Your PIN settings will not be affected.',
      }),
      confirm: t({ my: 'ပုံစံ ဖျက်', en: 'Remove Pattern' }),
    },
  }

  function handleConfirm(): void {
    const action = confirmAction
    setConfirmAction(null)
    if (action === 'remove-pin') {
      const wasLast = !(config?.hasPattern ?? false)
      clearPin(getDatabase())
      show(wasLast
        ? t({ my: '✓ PIN ဖျက်ပြီး — App Lock ပိတ်သွားသည်', en: '✓ PIN removed — App Lock turned off' })
        : t({ my: '✓ PIN ဖျက်ပြီး', en: '✓ PIN removed' }))
      resetPinForm()
    } else if (action === 'remove-pattern') {
      const wasLast = !(config?.hasPin ?? false)
      clearPattern(getDatabase())
      show(wasLast
        ? t({ my: '✓ ပုံစံ ဖျက်ပြီး — App Lock ပိတ်သွားသည်', en: '✓ Pattern removed — App Lock turned off' })
        : t({ my: '✓ ပုံစံ ဖျက်ပြီး', en: '✓ Pattern removed' }))
      resetPatternFlow()
    }
    emitChanged()
  }

  if (!config) {
    return (
      <div className="px-4 py-4">
        <Text role="muted">{t({ my: 'လုံခြုံမှု ဝန်ဆောင်မှု ဖွင့်နေသည်…', en: 'Loading security…' })}</Text>
      </div>
    )
  }

  const patternPrompt: Record<PatternFlow, { my: string; en: string }> = {
    idle: { my: '', en: '' },
    set: { my: 'ပုံစံအသစ် ဆွဲပါ', en: 'Draw your new pattern' },
    'set-confirm': { my: 'ပုံစံအသစ်ကို ထပ်ဆွဲအတည်ပြုပါ', en: 'Confirm the new pattern' },
    'change-verify': { my: 'လက်ရှိပုံစံ ဆွဲပါ', en: 'Draw your current pattern' },
    'change-new': { my: 'ပုံစံအသစ် ဆွဲပါ', en: 'Draw your new pattern' },
    'change-confirm': { my: 'ပုံစံအသစ်ကို ထပ်ဆွဲအတည်ပြုပါ', en: 'Confirm the new pattern' },
    remove: { my: 'ဖျက်ရန် လက်ရှိပုံစံ ဆွဲပါ', en: 'Draw your current pattern to confirm removal' },
  }

  return (
    <SettingsSection
      hideHeader
      title={t({ my: 'လုံခြုံရေး', en: 'Security' })}
    >
      {/* App Lock master switch */}
      <SettingsRow
        icon={<LockIcon size="h-5 w-5 shrink-0" />}
        title="App Lock"
        description={t({ my: 'App ဖွင့်တဲ့အခါ နှင့် နောက်ခံမှ ပြန်လာတဲ့အခါ လော့ခ်ဖွင့်ရမည်', en: 'Require authentication at launch and after backgrounding' })}
        control={
          <ToggleSwitch
            checked={config.enabled}
            onChange={() => handleToggleAppLock()}
            aria-label="App Lock"
          />
        }
      />

      {/* Auto-lock timeout */}
      <SettingsRow
        icon={<IconTimer />}
        title={t({ my: 'အလိုအလျောက် လော့ခ် အချိန်', en: 'Auto Lock Timeout' })}
        control={
          <select
            aria-label={t({ my: 'အလိုအလျောက် လော့ခ် အချိန်', en: 'Auto Lock Timeout' })}
            value={config.timeout}
            onChange={(e) => handleTimeoutChange(e.target.value)}
            className="rounded border border-border bg-background px-2 py-1 text-sm"
          >
            {AUTO_LOCK_TIMEOUTS.map((value) => (
              <option key={value} value={value}>
                {t(TIMEOUT_LABELS[value])}
              </option>
            ))}
          </select>
        }
      />

      {/* Pattern management */}
      <SettingsRow
        icon={<IconPattern />}
        title={t({ my: 'ပုံစံ (Pattern)', en: 'Pattern' })}
        description={config.hasPattern
          ? t({ my: 'သတ်မှတ်ထားပြီး', en: 'Set' })
          : t({ my: 'မသတ်မှတ်ရသေး', en: 'Not set' })}
        onClick={() => startPatternFlow(config.hasPattern ? 'change-verify' : 'set')}
        chevron
      />
      {config.hasPattern && patternFlow === 'idle' && (
        <SettingsRow
          icon={<IconPattern />}
          title={t({ my: 'ပုံစံ ဖျက်', en: 'Remove Pattern' })}
          danger
          onClick={() => startPatternFlow('remove')}
          chevron
        />
      )}

      {patternFlow !== 'idle' && (
        <div className="space-y-2 px-4 py-4">
          <div className="rounded-lg border border-border bg-surface p-3">
            <Text role="secondary" className="block text-center text-sm">
              {t(patternPrompt[patternFlow])}
            </Text>
            <PatternPad onSubmit={(points) => void handlePatternComplete(points)} />
            {firstDraw != null && (
              <Text role="secondary" className="mt-1 block text-center text-xs">
                {t({ my: 'အတည်ပြုရန် ထပ်ဆွဲပါ', en: 'Now draw it again to confirm' })}
              </Text>
            )}
            <button
              type="button"
              onClick={resetPatternFlow}
              className="mt-2 w-full rounded border border-border bg-surface px-3 py-2 text-sm hover:bg-surface-hover"
            >
              {t({ my: 'မလုပ်တော့', en: 'Cancel' })}
            </button>
          </div>
          {patternError && (
            <p className="text-sm font-medium text-danger">{patternError}</p>
          )}
        </div>
      )}

      {/* PIN management */}
      <SettingsRow
        icon={<IconHash />}
        title="PIN"
        description={config.hasPin
          ? t({ my: 'သတ်မှတ်ထားပြီး', en: 'Set' })
          : t({ my: 'မသတ်မှတ်ရသေး', en: 'Not set' })}
        onClick={() => startPinFlow(config.hasPin ? 'change' : 'set')}
        chevron
      />
      {config.hasPin && pinFlow === 'idle' && (
        <SettingsRow
          icon={<IconHash />}
          title={t({ my: 'PIN ဖျက်', en: 'Remove PIN' })}
          danger
          onClick={() => startPinFlow('remove')}
          chevron
        />
      )}

      {pinFlow !== 'idle' && (
        <div className="space-y-3 px-4 py-4">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-3">
            {(pinFlow === 'change' || pinFlow === 'remove') && (
              <div>
                <Text as="label" role="secondary" className="block text-xs font-medium">
                  {t({ my: 'လက်ရှိ PIN', en: 'Current PIN' })}
                </Text>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={oldPin}
                  onChange={(e) => setOldPin(e.target.value.replace(/[^0-9]/g, '').slice(0, MAX_PIN_LENGTH))}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            {pinFlow !== 'remove' && (
              <div>
                <Text as="label" role="secondary" className="block text-xs font-medium">
                  {t({ my: `PIN အသစ် (4-${MAX_PIN_LENGTH} ဂဏန်း)`, en: `New PIN (4-${MAX_PIN_LENGTH} digits)` })}
                </Text>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newPin1}
                  onChange={(e) => setNewPin1(e.target.value.replace(/[^0-9]/g, '').slice(0, MAX_PIN_LENGTH))}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            {pinFlow !== 'remove' && (
              <div>
                <Text as="label" role="secondary" className="block text-xs font-medium">
                  {t({ my: 'PIN အသစ် ထပ်ထည့်', en: 'Confirm new PIN' })}
                </Text>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  value={newPin2}
                  onChange={(e) => setNewPin2(e.target.value.replace(/[^0-9]/g, '').slice(0, MAX_PIN_LENGTH))}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm"
                />
              </div>
            )}
            {pinError && (
              <p className="text-sm font-medium text-danger">{pinError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pinFlow === 'remove'
                  ? !isValidPin(oldPin)
                  : !isValidPin(newPin1) || newPin1 !== newPin2}
                onClick={() => void submitPinForm()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {pinFlow === 'remove'
                  ? t({ my: 'ရှေ့ဆက်', en: 'Continue' })
                  : t({ my: 'သိမ်း', en: 'Save' })}
              </button>
              <button
                type="button"
                onClick={resetPinForm}
                className="rounded-lg border border-border bg-surface px-4 py-2 text-sm hover:bg-surface-hover"
              >
                {t({ my: 'မလုပ်တော့', en: 'Cancel' })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lock Now (only meaningful when App Lock is on) */}
      {config.enabled && (
        <SettingsRow
          icon={<LockIcon size="h-5 w-5 shrink-0" />}
          title={t({ my: 'ယခု လော့ခ်လုပ်', en: 'Lock Now' })}
          onClick={handleLockNow}
          chevron
        />
      )}

      {message && (
        <p className="px-4 py-3 text-sm font-medium text-success">{message}</p>
      )}

      {/* Confirmation dialog for destructive removals */}
      <ConfirmDialog
        open={confirmAction != null}
        danger
        title={confirmAction ? confirmCopy[confirmAction].title : ''}
        message={confirmAction ? confirmCopy[confirmAction].message : ''}
        confirmLabel={confirmAction ? confirmCopy[confirmAction].confirm : ''}
        cancelLabel={t({ my: 'မလုပ်တော့', en: 'Cancel' })}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </SettingsSection>
  )
}

export default SecurityTab