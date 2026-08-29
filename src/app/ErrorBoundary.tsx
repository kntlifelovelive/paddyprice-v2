/**
 * Top-level render error guard — docs/ARCHITECTURE.md §3.7.
 *
 * Catches unexpected render errors anywhere below the app shell and shows a
 * semantic, recoverable fallback instead of a blank screen. Styling uses only
 * semantic theme tokens (no hard-coded business colors).
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Text } from '@/shared/ui'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[paddy] Render error caught by ErrorBoundary:', error, info)
  }

  private handleReload = (): void => {
    // Full page reload re-runs the bootstrap sequence from scratch.
    window.location.reload()
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-surface p-6">
            <Text as="h1" role="header" className="mb-2 text-lg font-semibold">
              Something went wrong
            </Text>
            <Text role="secondary" className="mb-4 text-sm">
              The application hit an unexpected error. You can reload to try again.
            </Text>
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}