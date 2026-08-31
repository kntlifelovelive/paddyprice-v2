/**
 * Android-style settings navigation item for the left rail.
 *
 * Layout:  [icon box]  Title              (no right-side control)
 *                      current value
 *
 * - `selected` draws the Android settings outline highlight.
 * - Subtitle shows the section's current value (e.g. theme name, "50 lb").
 * - Icon sits in a rounded-square tinted box, like Android system settings.
 * - Uses semantic theme tokens only — no hard-coded colors.
 */
import type { ReactNode } from 'react'
import { cn } from '../cn'

interface SettingsNavItemProps {
  icon: ReactNode
  title: ReactNode
  /** Current value shown under the title (muted). */
  subtitle?: ReactNode
  selected?: boolean
  onClick: () => void
}

export function SettingsNavItem({
  icon,
  title,
  subtitle,
  selected = false,
  onClick,
}: SettingsNavItemProps): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected || undefined}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-accent bg-surface-hover'
          : 'border-transparent hover:bg-surface-hover active:bg-surface-hover/60',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-accent-muted text-accent-text' : 'bg-surface-hover text-content-secondary',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block truncate text-[15px] font-medium leading-snug',
            selected ? 'text-accent' : 'text-content-primary',
          )}
        >
          {title}
        </span>
        {subtitle != null && (
          <span className="mt-0.5 block truncate text-xs leading-snug text-content-muted">
            {subtitle}
          </span>
        )}
      </span>
    </button>
  )
}

export default SettingsNavItem
