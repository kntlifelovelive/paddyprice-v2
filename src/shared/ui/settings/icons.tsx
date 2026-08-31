/**
 * Settings-screen icon set — Android-style, currentColor stroke icons.
 * These are used exclusively inside SettingsSection/SettingsRow.
 * They mirror the reference project's SettingsIcons.tsx.
 */
import type { IconProps } from '../icons'

export const D = 'h-5 w-5 shrink-0'

export function IconChevronRight(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><polyline points="9 18 15 12 9 6" /></svg>
}

export function IconPlus(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}

export function IconGlobe(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
}

export function IconPalette(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><circle cx="12" cy="12" r="9" /><circle cx="8" cy="10" r="1" fill="currentColor" /><circle cx="12" cy="8" r="1" fill="currentColor" /><circle cx="16" cy="10" r="1" fill="currentColor" /><path d="M12 21a3 3 0 0 0 3-3v-1h2a2 2 0 0 0 2-2 9 9 0 0 0-18 0 9 9 0 0 0 9 9" /></svg>
}

export function IconBuilding(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><rect x="4" y="3" width="16" height="18" rx="1" /><line x1="8" y1="7" x2="8" y2="7.01" /><line x1="12" y1="7" x2="12" y2="7.01" /><line x1="16" y1="7" x2="16" y2="7.01" /><line x1="8" y1="11" x2="8" y2="11.01" /><line x1="12" y1="11" x2="12" y2="11.01" /><line x1="16" y1="11" x2="16" y2="11.01" /><line x1="8" y1="15" x2="8" y2="15.01" /><line x1="12" y1="15" x2="12" y2="15.01" /><line x1="16" y1="15" x2="16" y2="15.01" /></svg>
}

export function IconCalculator(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><rect x="4" y="3" width="16" height="18" rx="2" /><line x1="8" y1="7" x2="16" y2="7" /><line x1="8" y1="12" x2="8.01" y2="12" /><line x1="12" y1="12" x2="12.01" y2="12" /><line x1="16" y1="12" x2="16.01" y2="12" /><line x1="8" y1="16" x2="8.01" y2="16" /><line x1="12" y1="16" x2="12.01" y2="16" /><line x1="16" y1="16" x2="16.01" y2="16" /></svg>
}

export function IconTextSize(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><polyline points="3 6 6 3 9 6" /><line x1="6" y1="3" x2="6" y2="14" /><line x1="3" y1="10" x2="9" y2="10" /><polyline points="13 14 16 7 19 14" /><line x1="11" y1="18" x2="21" y2="18" /></svg>
}

export function IconDatabase(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14a9 3 0 0 0 18 0V5" /><path d="M3 12a9 3 0 0 0 18 0" /></svg>
}

export function IconRestore(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
}

export function IconFileText(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" /></svg>
}

export function IconHash(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></svg>
}

export function IconTimer(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><circle cx="12" cy="13" r="8" /><polyline points="12 9 12 13 15 15" /><path d="M9 2h6" /></svg>
}

export function IconFingerprint(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><path d="M2 12a10 10 0 0 1 18-6" /><path d="M2 16v-2a6 6 0 0 1 12 0c0 .5-.05 1.14-.12 1.81" /><path d="M12 12a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4" /><path d="M14 13.12c0 2.38 0 6.38-1 8.88" /><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02" /><path d="M20.26 15.01c.29-.9.5-1.9.55-2.9" /></svg>
}

export function IconPattern(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><circle cx="5" cy="5" r="1.5" /><circle cx="12" cy="5" r="1.5" /><circle cx="19" cy="5" r="1.5" /><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /><circle cx="5" cy="19" r="1.5" /><circle cx="12" cy="19" r="1.5" /><circle cx="19" cy="19" r="1.5" /></svg>
}

export function IconPhone(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
}

export function IconMapPin(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
}

export function IconDroplet(p: IconProps): JSX.Element {
  const { size = D, className = '', 'aria-label': label } = p
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-label={label} className={`${size} ${className}`}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></svg>
}
