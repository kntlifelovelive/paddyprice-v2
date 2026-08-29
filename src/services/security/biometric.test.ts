// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { BiometricAdapter, BiometricCapabilities } from '@/types'
import { createBiometricService } from './biometric'
import { SECURITY_LOCK_TITLE } from './messages'

function mockAdapter(
  overrides: Partial<BiometricAdapter> & { status?: BiometricCapabilities },
): BiometricAdapter & { authenticateCalls: number } {
  const service = {
    authenticateCalls: 0,
    getStatus: vi.fn(() => Promise.resolve(overrides.status ?? {
      status: 'available',
      fingerprint: { supported: true, enrolled: true },
    })),
    isAvailable: vi.fn(() => Promise.resolve(true)),
    authenticate: vi.fn((options: { title: string }) => {
      service.authenticateCalls += 1
      void options
      return Promise.resolve({ success: true, cancelled: false })
    }),
    openEnrollment: vi.fn(() => Promise.resolve()),
    ...overrides,
  }
  return service as BiometricAdapter & { authenticateCalls: number }
}

describe('biometric service (fingerprint-only, fail-safe)', () => {
  it('reports capabilities on a supported platform', async () => {
    const service = createBiometricService(mockAdapter({}))
    const caps = await service.getStatus()
    expect(caps.status).toBe('available')
    expect(caps.fingerprint).toEqual({ supported: true, enrolled: true })
    expect(await service.isAvailable()).toBe(true)
  })

  it('reports unsupported_platform on desktop/web without faking support', async () => {
    const service = createBiometricService(mockAdapter({
      status: { status: 'unsupported_platform', fingerprint: { supported: false, enrolled: false } },
      isAvailable: vi.fn(() => Promise.resolve(false)),
    }))
    const caps = await service.getStatus()
    expect(caps.status).toBe('unsupported_platform')
    expect(caps.fingerprint.supported).toBe(false)
    expect(await service.isAvailable()).toBe(false)
    expect(await service.authenticate()).toEqual({ success: false, cancelled: false })
  })

  it('normalizes unknown adapter statuses instead of throwing', async () => {
    const service = createBiometricService(
      mockAdapter({ status: { status: 'weird' as never, fingerprint: {} as never } }),
    )
    const caps = await service.getStatus()
    expect(caps.status).toBe('unknown')
    expect(caps.fingerprint.supported).toBe(false)
  })

  it('never throws when the adapter rejects', async () => {
    const failing = mockAdapter({
      getStatus: vi.fn(() => Promise.reject(new Error('native crash'))),
      isAvailable: vi.fn(() => Promise.reject(new Error('native crash'))),
      authenticate: vi.fn(() => Promise.reject(new Error('native crash'))),
      openEnrollment: vi.fn(() => Promise.reject(new Error('native crash'))),
    })
    const service = createBiometricService(failing)
    await expect(service.getStatus()).resolves.toEqual({
      status: 'unknown',
      fingerprint: { supported: false, enrolled: false },
    })
    await expect(service.isAvailable()).resolves.toBe(false)
    await expect(service.authenticate()).resolves.toEqual({ success: false, cancelled: false })
    await expect(service.openEnrollment()).resolves.toBeUndefined()
  })

  it('defaults the prompt title to the exact English `Security Lock` contract', async () => {
    const adapter = mockAdapter({})
    const service = createBiometricService(adapter)
    await service.authenticate()
    expect(adapter.authenticate).toHaveBeenCalledTimes(1)
    expect(vi.mocked(adapter.authenticate).mock.calls[0][0].title).toBe(SECURITY_LOCK_TITLE)
    expect(SECURITY_LOCK_TITLE).toBe('Security Lock')
  })

  it('propagates explicit cancellation and failure results', async () => {
    const cancelled = createBiometricService(mockAdapter({
      authenticate: vi.fn(() => Promise.resolve({ success: false, cancelled: true })),
    }))
    await expect(cancelled.authenticate()).resolves.toEqual({ success: false, cancelled: true })
    const failed = createBiometricService(mockAdapter({
      authenticate: vi.fn(() => Promise.resolve({ success: false, cancelled: false })),
    }))
    await expect(failed.authenticate()).resolves.toEqual({ success: false, cancelled: false })
  })

  it('openEnrollment is best-effort and passes through on success', async () => {
    const adapter = mockAdapter({})
    await createBiometricService(adapter).openEnrollment()
    expect(adapter.openEnrollment).toHaveBeenCalledTimes(1)
  })
})
