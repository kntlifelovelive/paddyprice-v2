/**
 * DeviceGate — shown when the device is NOT authorized (Android only).
 *
 * Renders INSTEAD of the whole application (gate order: Device Authorization →
 * App Lock → Paddy app). No Paddy data exists in the React tree while this
 * screen is up. Activation auto-starts on mount so the Linux installer can
 * reach the loopback server via `adb forward` with no manual step beyond
 * plugging in the USB cable.
 *
 * Reference-faithful to ~/paddyprice/src/components/DeviceGate.tsx: the
 * installer-required notice is mandatory — a plain `adb install` must leave
 * the app unusable until the real activation protocol completes.
 */
import { useEffect } from 'react'
import { useT } from '@/shared/hooks'
import { Text } from '@/shared/ui'
import { IconSmartphone } from '@/shared/ui/settings/icons'
import { useDeviceAuthStore } from '@/services/device-auth/store'

export function DeviceGate(): JSX.Element {
  const t = useT()
  const beginActivation = useDeviceAuthStore((s) => s.beginActivation)
  const cancelActivation = useDeviceAuthStore((s) => s.cancelActivation)
  const activating = useDeviceAuthStore((s) => s.activating)
  const error = useDeviceAuthStore((s) => s.error)
  const fingerprint = useDeviceAuthStore((s) => s.fingerprint)

  // Start the activation server automatically so the installer can connect
  // without any manual step beyond plugging in the USB cable.
  useEffect(() => {
    void beginActivation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      data-page="device-gate"
      className="flex min-h-screen flex-col items-center justify-center bg-background p-4"
    >
      <Text as="h1" role="header" className="mb-4 text-3xl font-bold tracking-wide">
        PadDy
      </Text>

      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="rounded-full bg-surface-hover p-3 text-accent">
            <IconSmartphone size="h-7 w-7" />
          </div>
          <Text role="primary" className="font-semibold">
            {t({ my: 'စက်အား လင့်ခ်လုပ်ရန် လိုအပ်သည်', en: 'Device not activated' })}
          </Text>
          <Text role="secondary" className="text-sm">
            {t({
              my: 'ဤဖုန်းတွင် Paddy ကို အသုံးပြုရန် USB ဖြင့် ချိတ်ဆက်ပြီး ကွန်ပျူတာမှ ./install.sh ကို လည်ပတ်ပါ။',
              en: 'To use Paddy on this phone, connect it by USB and run ./install.sh on your computer.',
            })}
          </Text>
          {/* Re-install notice (shown after Deactivate as well): the device
              stays unauthorized until the legitimate installer re-activates
              it — Settings can never restore authorization. */}
          <div className="mt-2 w-full rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
            <Text role="secondary" className="text-xs font-medium">
              {t({
                my: 'ဒီဖုန်းတွင် Paddy ကို အသုံးပြုခွင့် မရှိတော့ပါ။ ပြန်လည်အသုံးပြုရန် USB ဖြင့် ချိတ်ဆက်ပြီး ကွန်ပျူတာမှ ./install.sh ဖြင့် ပြန်တင်ပါ (Install / Activate)။',
                en: 'Paddy cannot be used on this device until it is re-installed. Reconnect by USB and run ./install.sh (Install / Activate) to restore access.',
              })}
            </Text>
          </div>
        </div>

        {fingerprint && (
          <p className="mt-4 text-center font-mono text-[11px] text-content-muted">
            {t({ my: 'စက်သော့ချက်', en: 'Device key' })}: {fingerprint.slice(0, 16)}…
          </p>
        )}

        {error && (
          <p role="alert" className="mt-4 text-center text-sm font-medium text-danger">
            {error}
          </p>
        )}

        {/* Retry / wait control — restarts (or keeps waiting on) the loopback
            activation server. This NEVER grants authorization by itself. */}
        <button
          type="button"
          onClick={() => void beginActivation()}
          className="mt-5 w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
        >
          ⟳ {t({ my: 'အသက်သွင်းမှု စောင့်နေ', en: 'Waiting for activation…' })}
        </button>

        {/* Cancel the CURRENT attempt only. SECURITY INVARIANT: cancelling
            stops the activation server but the device stays UNAUTHORIZED and
            this gate REMAINS the rendered screen — no navigation, no app
            access. Deactivation of an authorized device is a different,
            separate operation in Settings. */}
        {activating && (
          <button
            type="button"
            onClick={() => {
              console.info('[DeviceAuthGate] cancel activation tapped — gate stays up')
              void cancelActivation()
            }}
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-content-secondary transition-colors hover:bg-surface-hover"
          >
            {t({ my: 'အသက်သွင်းမှု ပယ်ဖျက်', en: 'Cancel activation' })}
          </button>
        )}
      </div>
    </div>
  )
}

export default DeviceGate
