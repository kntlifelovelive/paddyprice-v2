import { describe, expect, it, vi } from 'vitest'

import { LockScreen } from './LockScreen'
import { rendermount } from '@/app/rendermount'

/**
 * Lock screen presentation tests — the gate UI shown when the app is locked.
 *
 * Covers the spec'd copy: the `PadDy` title sits outside the lock card, there is
 * no "App Locked" text, no "Unlock to continue" subtitle, no "Clear your
 * pattern or PIN" button, the animated SVG lock icon is present, and the
 * mode-specific instructions (`Draw your pattern` / `Enter your PIN`) plus the
 * pattern hint render inside the matching area.
 */
describe('LockScreen', () => {
  function props(overrides: Partial<Parameters<typeof LockScreen>[0]> = {}) {
    return {
      hasPattern: false,
      hasPin: true,
      blocked: false,
      remainingMs: 0,
      failures: 0,
      onUnlockWithPattern: vi.fn().mockResolvedValue(true),
      onUnlockWithPin: vi.fn().mockResolvedValue(true),
      ...overrides,
    }
  }

  it('shows the PadDy title (never "App Locked") in single-method mode', async () => {
    const r = await rendermount(<LockScreen {...props()} />)
    try {
      expect(r.html()).toContain('PadDy')
      expect(r.html()).not.toContain('App Locked')
    } finally {
      await r.unmount()
    }
  })

  it('does not render an "Unlock to continue" subtitle', async () => {
    const r = await rendermount(<LockScreen {...props()} />)
    try {
      expect(r.html()).not.toContain('Unlock to continue')
    } finally {
      await r.unmount()
    }
  })

  it('renders the animated padlock icon and no "Clear" button', async () => {
    const r = await rendermount(<LockScreen {...props()} />)
    try {
      expect(r.html()).toContain('aria-label="Locked"')
      expect(r.html()).toContain('transition: transform')
      expect(r.html()).not.toContain('Clear your pattern or PIN')
    } finally {
      await r.unmount()
    }
  })

  it('shows the PIN instruction for PIN-only locks', async () => {
    const r = await rendermount(<LockScreen {...props({ hasPin: true, hasPattern: false })} />)
    try {
      expect(r.html()).toContain('Enter your PIN')
      expect(r.html()).not.toContain('Draw your pattern')
    } finally {
      await r.unmount()
    }
  })

  it('shows the pattern instruction and hint for pattern-only locks', async () => {
    const r = await rendermount(<LockScreen {...props({ hasPattern: true, hasPin: false })} />)
    try {
      expect(r.html()).toContain('Draw your pattern')
      expect(r.html()).toContain('Draw pattern (&gt; 4 dots)')
      expect(r.html()).not.toContain('Enter your PIN')
    } finally {
      await r.unmount()
    }
  })

  it('shows the chooser plus "Locked" subtitle when both methods exist', async () => {
    const r = await rendermount(<LockScreen {...props({ hasPattern: true, hasPin: true })} />)
    try {
      expect(r.html()).toContain('Choose an unlock method')
      expect(r.html()).toContain('Locked')
      expect(r.html()).toContain('PadDy')
    } finally {
      await r.unmount()
    }
  })
})
