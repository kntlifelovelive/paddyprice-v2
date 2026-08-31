/**
 * Android-style settings row.
 *
 * Layout:  [icon]  Title                    [control / value / chevron]
 *                   description
 *
 * - `onClick` turns the row into a full-width touch target (button).
 * - `control` is rendered on the right (toggle, select, input…).
 * - `chevron` adds a navigation arrow (for rows that open dialogs).
 * - `danger` renders title/icon in the destructive colour.
 * - Rows are separated by dividers via the parent section's `divide-y`.
 * - Uses semantic theme tokens only — no hard-coded colors.
 */
import type { ReactNode } from 'react'
import { IconChevronRight } from './icons'

interface SettingsRowProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  /** Right-side control (toggle/select/input) or current value text. */
  control?: ReactNode
  /** Makes the whole row clickable. */
  onClick?: () => void
  chevron?: boolean
  danger?: boolean
  disabled?: boolean
}

export function SettingsRow({
  icon,
  title,
  description,
  control,
  onClick,
  chevron = false,
  danger = false,
  disabled = false,
}: SettingsRowProps): JSX.Element {
  const accent = danger ? 'text-content-danger' : 'text-content-secondary'
  const iconBox =
    icon != null && (
      <span className={`shrink-0 ${danger ? 'text-content-danger' : 'text-content-secondary'}`}>
        {icon}
      </span>
    )

  const text = (
    <span className="min-w-0 flex-1">
      <span className={`block text-[15px] font-medium leading-snug ${accent}`}>{title}</span>
      {description != null && (
        <span className="mt-0.5 block break-words text-xs leading-snug text-content-muted">
          {description}
        </span>
      )}
    </span>
  )

  const right =
    control != null || chevron ? (
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {control}
        {chevron && <IconChevronRight className="h-4 w-4 text-content-muted" aria-label="open" />}
      </span>
    ) : null

  if (onClick != null && !disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-hover active:bg-surface-hover/60 disabled:opacity-50"
      >
        {iconBox}
        {text}
        {right}
      </button>
    )
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${disabled ? 'opacity-50' : ''}`}
    >
      {iconBox}
      {text}
      {right}
    </div>
  )
}

export default SettingsRow
