/**
 * Shared application layout — docs/ARCHITECTURE.md §3.7.
 *
 * Preserves the reference shell behavior (PROJECT_SPEC §3.1):
 * - top-bar navigation shows all pages; wide screens render labels inline and
 *   wrap to fit, narrow screens use a hamburger ☰ menu;
 * - the top bar is scroll-aware: it hides while scrolling down and returns on
 *   scroll-up (or at the top);
 * - all routes render inside this layout via <Outlet/>.
 *
 * Colors come exclusively from the semantic theme tokens
 * (`bg-surface`, `bg-background`, `border-border`, `text-content-*`,
 * `text-muted`, `bg-accent`, `text-accent-text`). Navigation labels are the
 * confirmed reference bilingual pairs, rendered through the shared `useT`
 * hook (Myanmar default).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'

import { useT } from '@/shared/hooks'
import { cn } from '@/shared/ui'

interface NavItem {
  to: string
  my: string
  en: string
}

/** Confirmed reference navigation set (behaviour preserved). */
const NAV_ITEMS: NavItem[] = [
  { to: '/', my: 'ပင်မ', en: 'Home' },
  { to: '/purchase/new', my: 'အသစ်ဝယ်', en: 'New Purchase' },
  { to: '/history', my: 'မှတ်တမ်း', en: 'History' },
  { to: '/moisture', my: 'အစိုဓာတ်', en: 'Moisture' },
  { to: '/profit-loss', my: 'အမြတ်/အရှုံး', en: 'P&L' },
  { to: '/farmers', my: 'လယ်သမား', en: 'Customers' },
  { to: '/rice-types', my: 'စပါးအမျိုးအစား', en: 'Paddy Types' },
  { to: '/rice-prices', my: 'စျေးနှုန်း', en: 'Prices' },
  { to: '/settings', my: 'ဆက်တင်', en: 'Settings' },
]

const SCROLL_THRESHOLD = 8

export default function Layout() {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [topBarVisible, setTopBarVisible] = useState(true)
  const lastScrollY = useRef(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    const handleScroll = () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const scrollY = window.scrollY
        const delta = scrollY - lastScrollY.current
        lastScrollY.current = scrollY

        if (Math.abs(delta) < SCROLL_THRESHOLD) return

        if (scrollY === 0) {
          setTopBarVisible(true)
          return
        }
        setTopBarVisible(delta <= 0)
      })
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const navLinkClass = useCallback(
    ({ isActive }: { isActive: boolean }) =>
      cn(
        'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
        isActive
          ? 'bg-accent text-accent-text'
          : 'text-secondary hover:bg-surface-hover hover:text-content-primary',
      ),
    [],
  )

  return (
    <div className="flex min-h-screen flex-col bg-background text-content-body">
      <header
        className={cn(
          'sticky top-0 z-20 border-b border-border bg-surface',
          'transition-transform duration-300 ease-in-out will-change-transform',
          topBarVisible ? 'translate-y-0' : '-translate-y-full',
        )}
      >
        <div className="mx-auto flex items-center gap-x-2 px-4 py-2 sm:px-6">
          {/* Brand */}
          <NavLink
            to="/"
            end
            className="shrink-0 rounded-lg px-1 py-1 text-lg font-bold text-content-primary"
          >
            PadDy
          </NavLink>

          {/* Hamburger — narrow screens only */}
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            className="ml-auto rounded-lg px-3 py-1.5 text-lg leading-none text-content-primary hover:bg-surface-hover md:hidden"
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
          >
            {menuOpen ? '✕' : '☰'}
          </button>

          {/* Inline nav — wide screens, labels wrap to fit */}
          <nav className="hidden flex-1 flex-wrap items-center justify-end gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navLinkClass}>
                {t({ my: item.my, en: item.en })}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* Collapsible menu — narrow screens only */}
        {menuOpen && (
          <nav className="grid grid-cols-2 gap-1 border-t border-border p-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={navLinkClass}
                onClick={() => setMenuOpen(false)}
              >
                {t({ my: item.my, en: item.en })}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4 sm:px-6">
        <Outlet />
      </main>
    </div>
  )
}