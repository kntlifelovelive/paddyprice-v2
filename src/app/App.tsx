/**
 * Application shell placeholder for the V2 foundation.
 *
 * Gate composition (Device Authorization → App Lock → app), HashRouter
 * routing, and the layout shell are intentionally NOT implemented yet —
 * they arrive with their own steps (see docs/ARCHITECTURE.md §3.7).
 */
export default function App() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Paddy</h1>
        <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
          V2 project foundation — features are not implemented yet.
        </p>
      </div>
    </main>
  )
}
