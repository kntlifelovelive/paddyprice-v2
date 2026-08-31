/**
 * Android-style toggle switch.
 *
 * Uses semantic theme tokens only — no hard-coded colors.
 * Visual representation of a boolean/active-on-active-off control.
 */
import { cn } from './cn'

interface ToggleSwitchProps {
  /** Control value — ON when true. */
  checked: boolean
  /** Change handler. */
  onChange: (checked: boolean) => void
  /** Accessible label. */
  'aria-label': string
  /** Visually disabled state. */
  disabled?: boolean
}

export function ToggleSwitch({
  checked,
  onChange,
  'aria-label': ariaLabel,
  disabled = false,
}: ToggleSwitchProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2',
        checked ? 'bg-accent' : 'bg-surface-hover',
        disabled && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 transform rounded-full shadow transition-transform',
          'bg-accent-text',
          checked ? 'translate-x-6' : 'translate-x-1',
        )}
      />
    </button>
  )
}
