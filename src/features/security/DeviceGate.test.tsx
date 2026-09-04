/**
 * DeviceGate tests — the installer-required startup gate (§3/§13 of the
 * installer-gated security task). The gate must render INSTEAD of the whole
 * app for an unauthorized device and show the reference English notice.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { rendermount } from '@/app/rendermount'

// Controllable fake of the shared device-auth store (the real one talks to the
// native Capacitor bridge / app database, unavailable in jsdom).
const beginActivation = vi.fn()
const cancelActivation = vi.fn()
const fakeState = {
  state: 'unauthorized' as string,
  activating: false,
  fingerprint: null as string | null,
  error: null as string | null,
}

vi.mock('@/services/device-auth/store', () => ({
  useDeviceAuthStore: (selector: (s: unknown) => unknown) =>
    selector({
      ...fakeState,
      beginActivation,
      cancelActivation,
      initialize: vi.fn(),
      deactivateLocal: vi.fn(),
    }),
}))

async function mountGate() {
  const { DeviceGate } = await import('@/features/security/DeviceGate')
  return rendermount(<DeviceGate />)
}

describe('DeviceGate', () => {
  beforeEach(() => {
    beginActivation.mockReset()
    beginActivation.mockResolvedValue(undefined)
    cancelActivation.mockReset()
    cancelActivation.mockResolvedValue(undefined)
    fakeState.state = 'unauthorized'
    fakeState.activating = false
    fakeState.fingerprint = null
    fakeState.error = null
  })

  it('shows the installer-required English notice (reference wording)', async () => {
    const r = await mountGate()
    try {
      expect(r.html()).toContain('PadDy')
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).toContain('To use Paddy on this phone, connect it by USB and run ./install.sh on your computer.')
    } finally {
      await r.unmount()
    }
  })

  it('shows the re-install notice (required after Deactivate)', async () => {
    const r = await mountGate()
    try {
      expect(r.html()).toContain('run ./install.sh (Install / Activate) to restore access.')
    } finally {
      await r.unmount()
    }
  })

  it('auto-starts the activation server on mount (installer can connect)', async () => {
    const r = await mountGate()
    try {
      expect(beginActivation).toHaveBeenCalled()
    } finally {
      await r.unmount()
    }
  })

  it('shows the waiting-for-activation retry control', async () => {
    const r = await mountGate()
    try {
      expect(r.html()).toContain('Waiting for activation')
    } finally {
      await r.unmount()
    }
  })

  it('shows a shortened device key fingerprint when known', async () => {
    fakeState.fingerprint = 'abcdef0123456789ffffffff'
    const r = await mountGate()
    try {
      expect(r.html()).toContain('Device key')
      expect(r.html()).toContain('abcdef0123456789')
      // Never the full fingerprint.
      expect(r.html()).not.toContain('ffffffff')
    } finally {
      await r.unmount()
    }
  })

  it('shows activation errors without ever reporting authorized', async () => {
    fakeState.error = 'Cannot bind activation server'
    const r = await mountGate()
    try {
      expect(r.html()).toContain('Cannot bind activation server')
      expect(r.html()).not.toContain('Authorized')
    } finally {
      await r.unmount()
    }
  })

  it('retry button re-triggers beginActivation (no fake success path)', async () => {
    const r = await mountGate()
    try {
      const button = r.container.querySelector('button')
      expect(button).not.toBeNull()
      button!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(beginActivation).toHaveBeenCalledTimes(2) // mount + click
      })
    } finally {
      await r.unmount()
    }
  })

  it('shows Cancel activation while the activation attempt is running', async () => {
    fakeState.activating = true
    const r = await mountGate()
    try {
      expect(r.html()).toContain('Cancel activation')
    } finally {
      await r.unmount()
    }
  })

  it('hides Cancel activation when no attempt is running', async () => {
    fakeState.activating = false
    const r = await mountGate()
    try {
      expect(r.html()).not.toContain('Cancel activation')
    } finally {
      await r.unmount()
    }
  })

  it('cancel activation never bypasses the device authorization gate', async () => {
    fakeState.activating = true
    const r = await mountGate()
    try {
      const buttons = Array.from(r.container.querySelectorAll('button'))
      const cancel = buttons.find((b) => b.textContent?.includes('Cancel activation'))
      expect(cancel).toBeDefined()
      cancel!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
      await vi.waitFor(() => {
        expect(cancelActivation).toHaveBeenCalledTimes(1)
      })
      // Cancel NEVER navigates or renders the application: the gate is still
      // the whole screen and no app content can appear (the gate has no
      // links/routes; authorization stays untouched by construction).
      expect(r.html()).toContain('Device not activated')
      expect(r.html()).toContain('./install.sh')
      expect(r.container.querySelectorAll('a[href]')).toHaveLength(0)
      // The gate itself never renders an app route marker.
      expect(r.html()).not.toContain('data-page="dashboard"')
    } finally {
      await r.unmount()
    }
  })
})
