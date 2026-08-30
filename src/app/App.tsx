/**
 * Application shell composition — docs/ARCHITECTURE.md §3.7 (`app/App.tsx`).
 *
 * Gate order (docs/PROJECT_SPEC.md §1.2): **Device Authorization → App Lock →
 * Application**. The device-auth gate arrives in a later step. App Lock is
 * wired in this phase: when enabled + credentials exist, the lock screen
 * renders before the router. Once unlocked, the router shows normally.
 *
 *   1. bootstrap (DB init + settings + stored theme/language/font scale).
 *   2. App Lock gate (when credentials are configured and locked).
 *   3. HashRouter'd application.
 *
 * No routes or layout render while any gate is active (PROJECT_SPEC §1.2).
 */
import { type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import PaddyRouter from './router'
import { useAppStore } from './state'
import { Text } from '@/shared/ui'
import { useAppLock } from '@/features/security/useAppLock'
import { LockScreen } from '@/features/security/LockScreen'

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

export default function App() {
  const dbReady = useAppStore((s) => s.dbReady)
  const dbError = useAppStore((s) => s.dbError)
  const appLock = useAppLock()

  let content: ReactNode
  if (dbError) {
    content = <BootstrapErrorScreen message={dbError} />
  } else if (!dbReady) {
    content = <BootstrapScreen />
  } else if (appLock.locked) {
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
    content = <PaddyRouter />
  }

  return <ErrorBoundary>{content}</ErrorBoundary>
}
