/**
 * Android-style settings section: uppercase title + card with divided rows.
 * Uses semantic theme tokens only — no hard-coded colors.
 */
import type { ReactNode } from 'react'

interface SettingsSectionProps {
  title: ReactNode
  icon?: ReactNode
  children: ReactNode
  /** Hide the uppercase title/icon header (used when a parent already shows it). */
  hideHeader?: boolean
}

export function SettingsSection({ title, icon, children, hideHeader = false }: SettingsSectionProps): JSX.Element {
  return (
    <section className="mt-6 first:mt-0">
      {!hideHeader && (
        <h2 className="mb-2 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-content-header">
          {icon}
          {title}
        </h2>
      )}
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {children}
      </div>
    </section>
  )
}

export default SettingsSection
