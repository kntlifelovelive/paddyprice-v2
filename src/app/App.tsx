/**
 * Application shell composition — docs/ARCHITECTURE.md §3.7 (`app/App.tsx`).
 *
 * Gate order (docs/PROJECT_SPEC.md §1.2): **Device Authorization → App Lock →
 * Application**. The device-auth gate uses the real device authorization state
 * (`services/device-auth`): while the device is not authorized through the
 * security installer, the DeviceGate renders instead of the whole application
 * and a plain `adb install` cannot bypass it. App Lock is wired on top: when
 * enabled + credentials exist, the lock screen renders before the router.
 *
 *   1. bootstrap (DB init + settings + stored theme/language/font scale).
 *   2. Device authorization gate (checking → spinner; unauthorized → DeviceGate).
 *   3. App Lock gate (when credentials are configured and locked).
 *   4. HashRouter'd application.
 *
 * No routes or layout render while any gate is active (PROJECT_SPEC §1.2).
 */
import { useEffect, type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import PaddyRouter from './router'
import { useAppStore } from './state'
import { Text } from '@/shared/ui'
import { useAppLock } from '@/features/security/useAppLock'
import { LockScreen } from '@/features/security/LockScreen'
import { DeviceGate } from '@/features/security/DeviceGate'
import { useDeviceAuthStore } from '@/services/device-auth/store'

function BootstrapScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3" aria-live="polite">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <Text role="secondary" className="text-sm">
          Starting Paddy…
        </Text>
      </div>
    </div>
  )
}

/** Device authorization check in progress — no app content may flash. */
function DeviceCheckingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <span
        className="h-8 w-8 animate-spin rounded-full border-4 border-accent border-t-transparent"
        aria-label="Checking device authorization"
      />
    </div>
  )
}

function BootstrapErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
        <Text as="h1" role="header" className="mb-2 text-lg font-semibold">
          Paddy could not start
        </Text>
        <Text role="secondary" className="mb-4 break-words text-sm">
          {message}
        </Text>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
        >
          Reload
        </button>
      </div>
    </div>
  )
}

/**
 * Safe gate diagnostics (temporary, for the physical root-cause capture).
 * Logs render-branch decisions ONLY — state names, never secrets. Removed
 * once the physical activation flow is confirmed.
 */
function logGate(message: string): void {
  console.info(`[DeviceAuthGate] ${message}`)
}

export default function App() {
  const dbReady = useAppStore((s) => s.dbReady)
  const dbError = useAppStore((s) => s.dbError)
  // The device-auth gate state is the REAL authorization state shared with
  // Settings → Device Activation (same store instance, same service).
  const deviceAuthState = useDeviceAuthStore((s) => s.state)
  // The App Lock gate builds its service only once the DB is ready — the
  // security config (App Lock / Pattern / PIN) lives in the settings table.
  const appLock = useAppLock({ dbReady })

  // Check device authorization once the database is open. The gate evaluates
  // BEFORE App Lock and before any route/layout/data render — a device that
  // was never activated through the security installer stays gated, and the
  // decision survives restarts because it re-reads the real persisted state.
  useEffect(() => {
    if (!dbReady) return
    void useDeviceAuthStore.getState().initialize()
  }, [dbReady])

  let content: ReactNode
  if (dbError) {
    content = <BootstrapErrorScreen message={dbError} />
  } else if (!dbReady) {
    content = <BootstrapScreen />
  } else if (deviceAuthState === 'checking') {
    // Fail closed: until the REAL authorization check positively resolves,
    // nothing but a bare spinner may render.
    logGate('rendering: device authorization check in progress (router NOT mounted)')
    content = <DeviceCheckingScreen />
  } else if (deviceAuthState === 'unauthorized') {
    logGate('rendering: DeviceGate (router NOT mounted)')
    content = <DeviceGate />
  } else if (deviceAuthState === 'authorized') {
    // ONLY a positively verified authorization result reaches this branch.
    logGate('rendering: authorized — App Lock gate evaluates next')
    if (appLock.locked) {
      content = (
        <LockScreen
          hasPattern={appLock.hasPattern}
          hasPin={appLock.hasPin}
          blocked={appLock.blocked}
          remainingMs={appLock.remainingMs}
          failures={appLock.failures}
          onUnlockWithPattern={appLock.unlockWithPattern}
          onUnlockWithPin={appLock.unlockWithPin}
        />
      )
    } else {
      logGate('rendering: router mounted (authorized)')
      content = <PaddyRouter />
    }
  } else {
    // `unsupported` — reachable ONLY from the genuine web adapter on
    // non-native targets (the Capacitor adapter refuses the web fallback on
    // Android, and every adapter error fails closed to `unauthorized`). This
    // is the sanctioned web exception; on Android this branch is
    // unreachable, so the application can never mount unauthorized there.
    logGate('rendering: device authorization unsupported on this platform (web exception)')
    content = appLock.locked ? (
      <LockScreen
        hasPattern={appLock.hasPattern}
        hasPin={appLock.hasPin}
        blocked={appLock.blocked}
        remainingMs={appLock.remainingMs}
        failures={appLock.failures}
        onUnlockWithPattern={appLock.unlockWithPattern}
        onUnlockWithPin={appLock.unlockWithPin}
      />
    ) : (
      <PaddyRouter />
    )
  }

  return <ErrorBoundary>{content}</ErrorBoundary>
}
