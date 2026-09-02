/**
 * Lock screen — the App Lock gate UI shown between bootstrap and the rest of
 * the application. Two unlock methods:
 *  - Pattern (3x3 grid, draw order is the secret)
 *  - PIN (4–8 digits)
 *
 * Only methods with a configured credential are selectable. When BOTH are
 * configured, a chooser screen shows first ("PadDy" + Locked + choice
 * buttons) and the chosen method's lock UI opens on tap; with exactly ONE
 * method the lock UI opens directly (confirmed reference behavior). The lock
 * screen itself contains NO business logic; everything is delegated to the
 * `useAppLock` hook (in this file's sibling module).
 */
import { useState } from 'react'
import { useT } from '@/shared/hooks'
import { Text, cn } from '@/shared/ui'
import { PatternPad } from './PatternPad'

export type UnlockMethod = 'pattern' | 'pin'

/** Chooser first (both methods) or straight into the single method's UI. */
type LockMode = 'choose' | UnlockMethod

/**
 * Animated padlock glyph. The lock body (rect) stays fixed; only the shackle
 * group translates upward to reveal the open-lock form. A CSS `transition` on
 * transform is reliably animated in every browser (animating SVG path `d` is not
 * reliably supported). On a successful unlock `open` flips true and the shackle
 * lifts smoothly; a wrong credential never flips `open`, so no unlock animation
 * plays. No Unicode, no fade, no spin, no bounce.
 */
function LockGlyph({ open }: { open: boolean }): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={open ? 'Unlocked' : 'Locked'}
      className="shrink-0 h-7 w-7"
    >
      {/* Lock body — never moves. */}
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      {/* Shackle — translates up when the lock opens. */}
      <g
        style={{
          transform: open ? 'translateY(-3px)' : 'translateY(0)',
          transition: 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <path d="M7 11V7a5 5 0 0 1 10 0" />
      </g>
    </svg>
  )
}

export interface LockScreenProps {
  hasPattern: boolean
  hasPin: boolean
  /** Which method to show first. */
  initialMethod?: UnlockMethod
  /** Whether attempts are currently blocked (throttled). */
  blocked: boolean
  remainingMs: number
  failures: number
  onUnlockWithPattern(points: number[]): Promise<boolean>
  onUnlockWithPin(pin: string): Promise<boolean>
}

function formatRemaining(ms: number): string {
  const s = Math.ceil(ms / 1000)
  if (s <= 60) return `${s}s`
  return `${Math.ceil(s / 60)}m`
}

export function LockScreen(props: LockScreenProps): JSX.Element {
  const t = useT()
  const availableMethods: UnlockMethod[] = []
  if (props.hasPattern) availableMethods.push('pattern')
  if (props.hasPin) availableMethods.push('pin')

  const initial: UnlockMethod =
    props.initialMethod && availableMethods.includes(props.initialMethod)
      ? props.initialMethod
      : availableMethods[0] ?? 'pin'
  // BOTH methods configured → chooser screen first; ONE → straight to its UI.
  const [method, setMethod] = useState<LockMode>(
    availableMethods.length > 1 ? 'choose' : initial,
  )
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Becomes true once a credential verifies successfully (drives the lock-open animation). */
  const [unlocked, setUnlocked] = useState(false)

  async function submitPattern(points: number[]): Promise<void> {
    if (props.blocked || busy) return
    setBusy(true)
    setError(null)
    const ok = await props.onUnlockWithPattern(points)
    setBusy(false)
    if (!ok) setError(t({ my: 'ပုံစံ မှားယွင်းနေပါသည်', en: 'Wrong pattern' }))
    else setUnlocked(true)
  }

  async function submitPin(value: string): Promise<void> {
    if (props.blocked || busy) return
    if (value.length < 4) return
    setBusy(true)
    setError(null)
    const ok = await props.onUnlockWithPin(value)
    setBusy(false)
    if (!ok) {
      setError(t({ my: 'PIN မှားယွင်းနေပါသည်', en: 'Wrong PIN' }))
      setPin('')
    } else {
      setUnlocked(true)
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      {/* PadDy title sits OUTSIDE the lock card, centered above it. */}
      <Text as="h1" role="header" className="mb-4 text-3xl font-bold tracking-wide">
        {t({ my: 'PadDy', en: 'PadDy' })}
      </Text>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2">
          <div className="rounded-full bg-surface-hover p-3 text-accent">
            <LockGlyph open={unlocked} />
          </div>
          {method === 'choose' && (
            <Text role="secondary" className="text-sm">
              {t({ my: 'လော့ခ်ပြုလုပ်ထားသည်', en: 'Locked' })}
            </Text>
          )}
        </div>

        {method === 'choose' && (
          <div className="mt-6 flex flex-col gap-3">
            <Text role="secondary" className="text-center text-sm">
              {t({ my: 'ဆက်ရန် စစ်ဆေးမှု ရွေးပါ', en: 'Choose an unlock method' })}
            </Text>
            {props.hasPattern && (
              <button
                type="button"
                onClick={() => { setMethod('pattern'); setError(null) }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
              >
                {t({ my: 'ပုံစံဖြင့်ဖွင့်', en: 'Unlock with Pattern' })}
              </button>
            )}
            {props.hasPin && (
              <button
                type="button"
                onClick={() => { setMethod('pin'); setError(null); setPin('') }}
                className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-medium text-content-primary transition-colors hover:bg-surface-hover"
              >
                {t({ my: 'PIN ဖြင့်ဖွင့်', en: 'Unlock with PIN' })}
              </button>
            )}
          </div>
        )}

        {method !== 'choose' && availableMethods.length > 1 && (
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {props.hasPattern && (
              <button
                type="button"
                onClick={() => { setMethod('pattern'); setError(null) }}
                className={cn(
                  'rounded-lg border px-3 py-2 font-medium transition-colors',
                  method === 'pattern'
                    ? 'border-accent bg-accent text-accent-text'
                    : 'border-border bg-background text-content-primary hover:bg-surface-hover',
                )}
              >
                {t({ my: 'ပုံစံ', en: 'Pattern' })}
              </button>
            )}
            {props.hasPin && (
              <button
                type="button"
                onClick={() => { setMethod('pin'); setError(null); setPin('') }}
                className={cn(
                  'rounded-lg border px-3 py-2 font-medium transition-colors',
                  method === 'pin'
                    ? 'border-accent bg-accent text-accent-text'
                    : 'border-border bg-background text-content-primary hover:bg-surface-hover',
                )}
              >
                {t({ my: 'PIN', en: 'PIN' })}
              </button>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-col items-center">
          {method === 'pattern' && props.hasPattern && (
            <div className="flex w-full flex-col items-center gap-2">
              <Text role="secondary" className="text-sm">
                {t({ my: 'ပုံစံ ဆွဲပါ', en: 'Draw your pattern' })}
              </Text>
              <PatternPad onSubmit={submitPattern} disabled={busy || props.blocked} />
            </div>
          )}

          {method === 'pin' && props.hasPin && (
            <form
              className="flex flex-col items-center gap-2"
              onSubmit={(e) => { e.preventDefault(); void submitPin(pin) }}
            >
              <Text role="secondary" className="text-sm">
                {t({ my: 'PIN ထည့်ပါ', en: 'Enter your PIN' })}
              </Text>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                disabled={busy || props.blocked}
                className="w-48 rounded-lg border border-border bg-background px-3 py-2 text-center text-xl tracking-widest"
                placeholder="• • • •"
                aria-label="PIN"
              />
              <button
                type="submit"
                disabled={busy || props.blocked || pin.length < 4}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {t({ my: 'ဖွင့်မည်', en: 'Unlock' })}
              </button>
            </form>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-3 text-center text-sm text-danger">
            {error}
          </p>
        )}
        {props.blocked && (
          <p role="alert" className="mt-3 text-center text-sm text-warning">
            {t({ my: 'ခဏစောင့်ပါ', en: 'Too many attempts' })} — {formatRemaining(props.remainingMs)}
          </p>
        )}
        {props.failures > 0 && !props.blocked && (
          <p className="mt-2 text-center text-xs text-content-muted">
            {t({ my: 'မှားယွင်းမှု', en: 'Failures' })}: {props.failures}
          </p>
        )}
      </div>
    </div>
  )
}
