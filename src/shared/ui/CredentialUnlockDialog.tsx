/**
 * Generic credential-unlock dialog — shared UI ONLY.
 *
 * Captures the user's EXISTING App Lock credential (pattern / PIN, whichever
 * is configured) and delegates verification to the caller via `onVerify`.
 * This component holds no database, service, or storage imports — callers
 * (Customer page, History page) wire it to the existing security mechanism
 * themselves. No second PIN/pattern storage is created here.
 */
import { useState } from 'react'
import { useT } from '@/shared/hooks'
import { LockIcon } from './icons'
import { PatternPad } from './PatternPad'
import { Text } from './Text'

/** A credential attempt handed to `onVerify`. */
export type UnlockAttempt =
  | { kind: 'pattern'; points: number[] }
  | { kind: 'pin'; value: string }

export interface CredentialUnlockDialogProps {
  title: string
  message: string
  hasPattern: boolean
  hasPin: boolean
  /** Verify the captured attempt via the caller's existing security mechanism. */
  onVerify(attempt: UnlockAttempt): Promise<boolean>
  /** Called after a SUCCESSFUL verification (before close). */
  onSuccess(): void
  onClose(): void
}

export function CredentialUnlockDialog({
  title,
  message,
  hasPattern,
  hasPin,
  onVerify,
  onSuccess,
  onClose,
}: CredentialUnlockDialogProps): JSX.Element {
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [pin, setPin] = useState('')

  // Show only configured methods; with none configured fall back to the PIN
  // pad (the caller decides whether the dialog is reachable at all).
  const showPattern = hasPattern
  const showPin = hasPin || !hasPattern

  async function submitPattern(points: number[]): Promise<void> {
    if (busy) return
    if (points.length < 4 || !hasPattern) {
      setError(t({ my: 'ပုံစံ မှားယွင်းနေပါသည်', en: 'Wrong pattern' }))
      return
    }
    setBusy(true)
    setError(null)
    const ok = await onVerify({ kind: 'pattern', points })
    setBusy(false)
    if (ok) {
      onSuccess()
      onClose()
    } else {
      setError(t({ my: 'ပုံစံ မှားယွင်းနေပါသည်', en: 'Wrong pattern' }))
    }
  }

  async function submitPin(value: string): Promise<void> {
    if (busy) return
    setBusy(true)
    setError(null)
    const ok = await onVerify({ kind: 'pin', value })
    setBusy(false)
    if (ok) {
      onSuccess()
      onClose()
    } else {
      setError(t({ my: 'PIN မှားယွင်းနေပါသည်', en: 'Wrong PIN' }))
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-lg">
        <div className="mb-3 flex justify-center">
          <div className="rounded-full bg-surface-hover p-3 text-accent">
            <LockIcon size="h-7 w-7" aria-label="Locked" />
          </div>
        </div>

        <Text as="h2" role="header" className="text-center text-base font-semibold text-content-primary">
          {title}
        </Text>

        <Text role="secondary" className="mt-1 block text-center text-sm">
          {message}
        </Text>

        <Text role="secondary" className="mt-2 block text-center text-xs">
          {t({ my: 'ဖျက်ရန် လုံခြုံရေး အတည်ပြုပါ', en: 'Verify your security credential to proceed.' })}
        </Text>

        <div className="mt-4 space-y-3">
          {showPattern && (
            <div>
              <Text role="secondary" className="block text-center text-xs">
                {t({ my: 'ပုံစံ ဆွဲပါ', en: 'Draw pattern' })}
              </Text>
              <div className="mt-1 flex justify-center">
                <PatternPad onSubmit={(points) => void submitPattern(points)} disabled={busy} />
              </div>
            </div>
          )}
          {showPin && (
            <div>
              <label className="block text-xs font-medium text-content-secondary">PIN</label>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 8))}
                disabled={busy}
                className="w-full rounded border border-border bg-background px-2 py-1 text-center text-xl tracking-widest"
                placeholder="• • • •"
                aria-label="PIN"
              />
              <button
                type="button"
                onClick={() => void submitPin(pin)}
                disabled={busy || pin.length < 4}
                className="mt-2 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover disabled:opacity-50"
              >
                {t({ my: 'ဖွင့်မည်', en: 'Unlock' })}
              </button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-center text-sm text-danger">{error}</p>
          )}
        </div>

        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            {t({ my: 'မလုပ်တော့', en: 'Cancel' })}
          </button>
        </div>
      </div>
    </div>
  )
}
