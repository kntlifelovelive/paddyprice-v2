/**
 * DeviceActivationTab — the "Device Activation" session under Settings →
 * Security (reference `DeviceAuthSettings.tsx`).
 *
 * Consumes the SHARED device-auth store (`services/device-auth/store`) — the
 * SAME authorization state that gates application startup. Settings can never
 * show "Authorized" unless the real device-auth state says so, and activation
 * started here immediately reflects in the startup gate.
 *
 * Delegates to the native `DeviceAuthPlugin` on Android; on web the adapter
 * reports `supported: false` and a clear English notice is shown — never a
 * fabricated authorized state.
 */
import { useEffect } from 'react'
import { Text } from '@/shared/ui'
import { SettingsSection, SettingsRow } from '@/shared/ui/settings'
import { IconSmartphone } from '@/shared/ui/settings/icons'
import { useDeviceAuthStore } from '@/services/device-auth/store'

export function DeviceActivationTab(): JSX.Element {
  const state = useDeviceAuthStore((s) => s.state)
  const activating = useDeviceAuthStore((s) => s.activating)
  const fingerprint = useDeviceAuthStore((s) => s.fingerprint)
  const error = useDeviceAuthStore((s) => s.error)
  const initialize = useDeviceAuthStore((s) => s.initialize)
  const beginActivation = useDeviceAuthStore((s) => s.beginActivation)
  const deactivateLocal = useDeviceAuthStore((s) => s.deactivateLocal)
  const cancelActivation = useDeviceAuthStore((s) => s.cancelActivation)

  // Reflect the real authorization state on entry (same check the startup
  // gate performs — one shared store, one source of truth).
  useEffect(() => {
    void initialize()
  }, [initialize])

  // Web / unsupported — clear English notice, no fake status.
  if (state === 'unsupported') {
    return (
      <SettingsSection
        hideHeader
        title={<Text as="h2" role="header" className="text-base font-semibold">Device Activation</Text>}
      >
        <SettingsRow
          icon={<IconSmartphone size="h-5 w-5 shrink-0" />}
          title="Device activation is available on Android."
          description="Connect a device running the Android app to activate."
        />
      </SettingsSection>
    )
  }

  let statusLabel: string
  let statusColor: string
  if (activating) {
    statusLabel = 'Activating…'
    statusColor = 'text-secondary'
  } else {
    switch (state) {
      case 'authorized':
        statusLabel = 'Authorized'
        statusColor = 'text-success'
        break
      case 'checking':
        statusLabel = 'Checking…'
        statusColor = 'text-secondary'
        break
      default:
        statusLabel = 'Not authorized'
        statusColor = 'text-danger'
        break
    }
  }

  const message = error ?? (activating
    ? 'Waiting for activation… connect the phone to the installer over USB.'
    : null)

  return (
    <SettingsSection
      hideHeader
      title={<Text as="h2" role="header" className="text-base font-semibold">Device Activation</Text>}
    >
      <SettingsRow
        icon={<IconSmartphone size="h-5 w-5 shrink-0" />}
        title={<Text as="span" className={statusColor}>{statusLabel}</Text>}
        description={fingerprint ? fingerprint.substring(0, 16) + '…' : undefined}
      />

      {state === 'authorized' && (
        <SettingsRow
          title="Deactivate this device"
          danger
          onClick={() => void deactivateLocal()}
          chevron
        />
      )}

      {state !== 'authorized' && !activating && state !== 'checking' && (
        <SettingsRow
          title="Activate Device"
          onClick={() => void beginActivation()}
          chevron
        />
      )}

      {activating && (
        <SettingsRow
          title="Cancel activation"
          onClick={() => void cancelActivation()}
          chevron
        />
      )}

      {message && (
        <p className="px-4 py-3 text-sm font-medium text-success">{message}</p>
      )}
    </SettingsSection>
  )
}

export default DeviceActivationTab
