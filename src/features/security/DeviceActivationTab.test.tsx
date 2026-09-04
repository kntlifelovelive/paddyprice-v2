/**
 * DeviceActivationTab tests (§8 — device activation UI).
 *
 * The tab consumes the SHARED device-auth store (same state as the startup
 * gate). Tests drive a controllable fake store and assert the Settings
 * session always reflects the real authorization state.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { rendermount } from '@/app/rendermount'
import { useSettingsStore } from '@/shared/state'
import type { Settings } from '@/types'

// Controllable fake of the shared device-auth store.
const storeFake = {
  state: 'checking' as string,
  activating: false,
  fingerprint: null as string | null,
  error: null as string | null,
}
const storeActions = {
  initialize: vi.fn(),
  beginActivation: vi.fn(),
  cancelActivation: vi.fn(),
  deactivateLocal: vi.fn(),
}

vi.mock('@/services/device-auth/store', () => ({
  useDeviceAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ ...storeFake, ...storeActions }),
}))

function loadEnglishSettings(): Settings {
  return {
    company_name: 'Test', company_address: '', company_phone: '',
    company_footer_text: '', tin_formula: '50',
    moisture_rates: { 17: 1, 18: 2, 19: 3, 20: 4 },
    pdf_dir: 'PSO/pdf', theme: 'light', font_size: 'normal', language: 'en',
    printer_type: 'none', paper_width: '58', copies: 1,
    printer_device_address: '', printer_device_name: '',
  }
}

describe('DeviceActivationTab', () => {
  beforeEach(() => {
    storeFake.state = 'checking'
    storeFake.activating = false
    storeFake.fingerprint = null
    storeFake.error = null
    storeActions.initialize.mockReset()
    storeActions.beginActivation.mockReset()
    storeActions.deactivateLocal.mockReset()
    storeActions.cancelActivation.mockClear()
    useSettingsStore.getState().load(loadEnglishSettings())
  })

  it('shows web notice on unsupported (web fallback)', async () => {
    storeFake.state = 'unsupported'
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Device activation is available on Android.')
    } finally {
      await r.unmount()
    }
  })

  it('shows Authorized when authorized', async () => {
    storeFake.state = 'authorized'
    storeFake.fingerprint = 'abcdef0123456789ffffffff'
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Authorized')
      expect(r.html()).toContain('Deactivate this device')
    } finally {
      await r.unmount()
    }
  })

  it('shows Activate Device button when unauthorized on Android', async () => {
    storeFake.state = 'unauthorized'
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Activate Device')
      expect(r.html()).toContain('Not authorized')
    } finally {
      await r.unmount()
    }
  })

  it('shows the activating wait state while the server runs', async () => {
    storeFake.state = 'unauthorized'
    storeFake.activating = true
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Activating…')
      expect(r.html()).toContain('Waiting for activation')
      expect(r.html()).toContain('Cancel activation')
      expect(r.html()).not.toContain('Activate Device')
    } finally {
      await r.unmount()
    }
  })

  it('reports the SAME state as the startup gate (shared store, real state)', async () => {
    // Authorized in the shared store → the tab must say Authorized. There is
    // no path where the tab shows Authorized while the gate state is not.
    storeFake.state = 'authorized'
    storeFake.fingerprint = 'fp-device'
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Authorized')
      // Cannot activate again while authorized.
      expect(r.html()).not.toContain('Activate Device')
    } finally {
      await r.unmount()
    }
  })

  it('shows the check-failure error without a fake authorized state', async () => {
    storeFake.state = 'unauthorized'
    storeFake.error = 'Device authorization check failed'
    const { DeviceActivationTab } = await import('@/features/security/DeviceActivationTab')
    const r = await rendermount(<DeviceActivationTab />)
    try {
      expect(r.html()).toContain('Device authorization check failed')
      expect(r.html()).not.toContain('Authorized')
    } finally {
      await r.unmount()
    }
  })
})

