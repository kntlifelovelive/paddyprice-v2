/**
 * Application shell composition — docs/ARCHITECTURE.md §3.7 (`app/App.tsx`).
 *
 * Gate order (docs/PROJECT_SPEC.md §1.2): **Device Authorization → App Lock →
 * Application**. The device-auth and app-lock gate UIs arrive with the
 * `features/device-auth` and `features/security` steps (their Step-6 service
 * contracts already exist); until then this shell composes the bootstrap gate
 * only:
 *
 *   1. bootstrap (DB init + settings + stored theme/language/font scale) —
 *      a loading screen while it runs, a fail-safe error screen if it cannot;
 *   2. once `dbReady`, mount the HashRouter'd application.
 *
 * While any gate is active or bootstrap is incomplete, no routes, layout, or
 * data render (PROJECT_SPEC §1.2).
 */
import { type ReactNode } from 'react'
import { ErrorBoundary } from './ErrorBoundary'
import PaddyRouter from './router'
import { useAppStore } from './state'
import { Text } from '@/shared/ui'

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

  let content: ReactNode
  if (dbError) {
    content = <BootstrapErrorScreen message={dbError} />
  } else if (dbReady) {
    content = <PaddyRouter />
  } else {
    content = <BootstrapScreen />
  }

  return <ErrorBoundary>{content}</ErrorBoundary>
}
