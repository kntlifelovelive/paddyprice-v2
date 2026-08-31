/**
 * Android-style switch control for settings rows.
 * Uses semantic theme tokens; accent color reflects theme accent.
 */
interface SettingsToggleProps {
  checked: boolean
  onChange: () => void
  disabled?: boolean
  label: string
}

export function SettingsToggle({ checked, onChange, disabled = false, label }: SettingsToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-accent' : 'bg-border-hover'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-surface shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  )
}

export default SettingsToggle
