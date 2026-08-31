/**
 * Shared SVG icon components — the ONLY icon source for Paddy Price.
 * All icons use currentColor (stroke/fill) so they inherit theme colors.
 * No external icon library; no emoji; no raster images.
 */
export interface IconProps {
  /** Tailwind size class, e.g. "h-4 w-4". Defaults to "h-4 w-4". */
  size?: string
  className?: string
  'aria-label'?: string
}

const D = 'h-4 w-4'

/** Edit / pencil icon. */
export function EditIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  )
}

/** PDF / document icon. */
export function PdfIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="9" y1="13" x2="15" y2="13" />
      <line x1="9" y1="17" x2="12" y2="17" />
    </svg>
  )
}

/** Printer icon. */
export function PrintIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}

/** Lock / padlock icon. */
export function LockIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  )
}

/** Unlocked / open padlock icon. */
export function UnlockIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  )
}

/** Shield / security icon. */
export function ShieldIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

/** Eye (show) icon. */
export function EyeIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** Eye-off (hide) icon. */
export function EyeOffIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

/** Back / chevron-left arrow. */
export function BackIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

/** Close / X icon. */
export function CloseIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  )
}

/** Delete / trash icon. */
export function DeleteIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

/** Spinner / loading icon (use with animate-spin). */
export function SpinnerIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" aria-label={label} className={`shrink-0 ${size} ${className}`}>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

/** Check / tick icon. */
export function CheckIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

/** Chevron-down icon. */
export function ChevronDownIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
      strokeLinecap="round" strokeLinejoin="round" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

/** Status dot — filled circle for active/inactive state indicators. */
export function StatusDotIcon({ size = D, className = '', 'aria-label': label }: IconProps): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-label={label}
      className={`shrink-0 ${size} ${className}`}>
      <circle cx="12" cy="12" r="8" />
    </svg>
  )
}
