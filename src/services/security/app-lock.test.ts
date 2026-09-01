// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from 'sql.js'
import { closeTestDatabase, createTestDatabase } from '@/infrastructure/db/test-support'
import { getSetting, setSetting } from '@/infrastructure/db/dao/settings'
import {
  clearPattern,
  clearPin,
  createAppLockService,
  emitSecurityEvent,
  hasAnyCredential,
  readSecurityConfig,
  savePattern,
  savePin,
  SECURITY_KEY_BIOMETRIC_FINGERPRINT,
  SECURITY_KEY_BIOMETRIC_LEGACY,
  SECURITY_KEY_ENABLED,
  SECURITY_KEY_PATTERN,
  SECURITY_KEY_PIN,
  SECURITY_KEY_TIMEOUT,
  setFingerprintEnabled,
  setSecurityEnabled,
  setSecurityTimeout,
  subscribeSecurityEvent,
  type AppLockServiceOptions,
} from './app-lock'
import type { SecurityConfig, BiometricAdapter } from '@/types'
import { createVerifier, patternToSecret, verifySecret } from './verifier'
import { createBiometricService } from './biometric'

let patternVer: string
let pinVer: string

beforeAll(async () => {
  patternVer = await createVerifier(patternToSecret([0, 1, 4, 8]))
  pinVer = await createVerifier('1234')
})

function baseConfig(overrides: Partial<SecurityConfig> = {}): SecurityConfig {
  return {
    enabled: true,
    hasPattern: true,
    hasPin: false,
    biometric: false,
    biometricFingerprint: false,
    timeout: 'immediately',
    ...overrides,
  }
}

function makeService(
  overrides: Partial<AppLockServiceOptions> = {},
): { service: ReturnType<typeof createAppLockService>; advance: (ms: number) => void } {
  let t = 1_000_000
  const service = createAppLockService({
    config: baseConfig(),
    patternVerifier: patternVer,
    pinVerifier: pinVer,
    now: () => t,
    ...overrides,
  })
  return { service, advance: (ms: number) => { t += ms } }
}

function fingerprintAdapter(succeeds: () => boolean): BiometricAdapter {
  return {
    getStatus: () =>
      Promise.resolve({ status: 'available', fingerprint: { supported: true, enrolled: true } }),
    isAvailable: () => Promise.resolve(true),
    authenticate: () => Promise.resolve({ success: succeeds(), cancelled: false }),
    openEnrollment: () => Promise.resolve(),
  }
}

describe('App Lock persistence (settings DAO — verifiers only, never raw secrets)', () => {
  let db: Database
  afterAll(() => closeTestDatabase())

  it('defaults to disabled with no credentials', async () => {
    db = await createTestDatabase()
    const config = readSecurityConfig(db)
    expect(config).toEqual({
      enabled: false,
      hasPattern: false,
      hasPin: false,
      biometric: false,
      biometricFingerprint: false,
      timeout: 'immediately',
    })
    expect(hasAnyCredential(config)).toBe(false)
  })

  it('persists a pattern as a PBKDF2 verifier — the raw pattern is never stored', async () => {
    db = await createTestDatabase()
    const points = [0, 1, 4, 8]
    await savePattern(db, points)
    const stored = getSetting(db, SECURITY_KEY_PATTERN)
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/)
    expect(stored).not.toContain('0-1-4-8')
    expect(readSecurityConfig(db).hasPattern).toBe(true)
  })

  it('persists a PIN as a PBKDF2 verifier — the raw PIN is never stored', async () => {
    db = await createTestDatabase()
    await savePin(db, '123456')
    const stored = getSetting(db, SECURITY_KEY_PIN)
    expect(stored).toMatch(/^pbkdf2-sha256\$100000\$/)
    expect(stored).not.toContain('123456')
    expect(readSecurityConfig(db).hasPin).toBe(true)
  })

  it('rejects invalid patterns and PINs without persisting anything', async () => {
    db = await createTestDatabase()
    await expect(savePattern(db, [0, 1, 1, 2])).rejects.toThrow(/Invalid pattern/)
    await expect(savePattern(db, [0, 1, 2])).rejects.toThrow(/Invalid pattern/)
    await expect(savePin(db, '123')).rejects.toThrow(/Invalid PIN/)
    await expect(savePin(db, '123456789')).rejects.toThrow(/Invalid PIN/)
    await expect(savePin(db, '12ab')).rejects.toThrow(/Invalid PIN/)
    expect(getSetting(db, SECURITY_KEY_PATTERN)).toBeNull()
    expect(getSetting(db, SECURITY_KEY_PIN)).toBeNull()
  })

  it('persists the master switch, timeout, and fingerprint flag', async () => {
    db = await createTestDatabase()
    setSecurityEnabled(db, true)
    setSecurityTimeout(db, '300')
    setFingerprintEnabled(db, true)
    const config = readSecurityConfig(db)
    expect(config.enabled).toBe(true)
    expect(config.timeout).toBe('300')
    expect(config.biometricFingerprint).toBe(true)
    expect(config.biometric).toBe(true)
    expect(getSetting(db, SECURITY_KEY_ENABLED)).toBe('1')
    expect(getSetting(db, SECURITY_KEY_TIMEOUT)).toBe('300')
  })

  it('migrates the legacy `security.biometric` key to fingerprint on read', async () => {
    db = await createTestDatabase()
    setSetting(db, SECURITY_KEY_BIOMETRIC_LEGACY, '1')
    const config = readSecurityConfig(db)
    expect(config.biometric).toBe(true)
    expect(config.biometricFingerprint).toBe(true)
    // The explicit fingerprint key wins when it is set.
    setSetting(db, SECURITY_KEY_BIOMETRIC_FINGERPRINT, '0')
    expect(readSecurityConfig(db).biometricFingerprint).toBe(false)
  })

  it('removing the last credential auto-disables App Lock and clears the helper', async () => {
    db = await createTestDatabase()
    setSecurityEnabled(db, true)
    await savePattern(db, [0, 1, 4, 8])
    await savePin(db, '1234')
    setFingerprintEnabled(db, true)
    // Pattern removed — PIN still unlocks.
    clearPattern(db)
    expect(readSecurityConfig(db).enabled).toBe(true)
    // Last credential removed — the fail-safe disables the lock.
    clearPin(db)
    const config = readSecurityConfig(db)
    expect(config.enabled).toBe(false)
    expect(config.biometricFingerprint).toBe(false)
    expect(config.biometric).toBe(false)
    expect(getSetting(db, SECURITY_KEY_PATTERN)).toBeNull()
    expect(getSetting(db, SECURITY_KEY_PIN)).toBeNull()
  })

})

describe('App Lock runtime service (lock predicate, throttling, auto-lock)', () => {
  it('is locked when enabled with a credential, and unlocks with the correct PIN', async () => {
    const { service } = makeService()
    expect(service.isLocked()).toBe(true)
    await expect(service.unlockWithPin('9999')).resolves.toBe(false)
    expect(service.isLocked()).toBe(true)
    await expect(service.unlockWithPin('1234')).resolves.toBe(true)
    expect(service.isLocked()).toBe(false)
    expect(service.getState().failures).toBe(0)
  })

  it('unlocks with the correct pattern (draw order is significant)', async () => {
    const { service } = makeService()
    await expect(service.unlockWithPattern([8, 4, 1, 0])).resolves.toBe(false)
    await expect(service.unlockWithPattern([0, 1, 4, 8])).resolves.toBe(true)
    expect(service.isLocked()).toBe(false)
  })

  it('never locks when disabled or without any credential (fail-safe)', async () => {
    const disabled = makeService({ config: baseConfig({ enabled: false }) })
    await expect(disabled.service.unlockWithPin('0000')).resolves.toBe(true)
    expect(disabled.service.isLocked()).toBe(false)
    const noCred = makeService({ patternVerifier: null, pinVerifier: null })
    expect(noCred.service.isLocked()).toBe(false)
  })

  it('throttles: 5 failures → 30 s, doubling per extra failure, no counting while blocked', async () => {
    const { service, advance } = makeService()
    for (let i = 0; i < 5; i += 1) {
      await expect(service.unlockWithPin('9999')).resolves.toBe(false)
    }
    const state = service.getState()
    expect(state.blocked).toBe(true)
    expect(state.remainingMs).toBe(30_000)
    expect(state.failures).toBe(5)
    // Blocked attempts are rejected without verification and without new failures.
    await expect(service.unlockWithPin('1234')).resolves.toBe(false)
    expect(service.getState().failures).toBe(5)
    // After the cooldown, the 6th failure doubles the delay to 60 s.
    advance(30_000)
    expect(service.getState().blocked).toBe(false)
    await expect(service.unlockWithPin('9999')).resolves.toBe(false)
    expect(service.getState().remainingMs).toBe(60_000)
    // Success resets the throttle entirely.
    advance(60_000)
    await expect(service.unlockWithPin('1234')).resolves.toBe(true)
    expect(service.getState()).toMatchObject({ blocked: false, remainingMs: 0, failures: 0 })
  })

  it('counts malformed pattern/PIN attempts as failures', async () => {
    const { service } = makeService()
    await expect(service.unlockWithPattern([0, 0, 1, 2])).resolves.toBe(false)
    await expect(service.unlockWithPin('12ab')).resolves.toBe(false)
    expect(service.getState().failures).toBe(2)
  })

  it('fingerprint never fakes support, never feeds the throttle, and unlocks on success', async () => {
    const missing = makeService() // no biometric service (e.g. web/desktop)
    await expect(missing.service.unlockWithFingerprint()).resolves.toBe(false)
    expect(missing.service.getState().failures).toBe(0)

    let succeed = false
    const bio = createBiometricService(fingerprintAdapter(() => succeed))
    const withBio = makeService({
      config: baseConfig({ biometric: true, biometricFingerprint: true }),
      biometric: bio,
    })
    await expect(withBio.service.unlockWithFingerprint()).resolves.toBe(false)
    expect(withBio.service.isLocked()).toBe(true)
    expect(withBio.service.getState().failures).toBe(0)
    succeed = true
    await expect(withBio.service.unlockWithFingerprint()).resolves.toBe(true)
    expect(withBio.service.isLocked()).toBe(false)
  })

  it('fingerprint unlock is rejected unless the fingerprint flag is set', async () => {
    const bio = createBiometricService(fingerprintAdapter(() => true))
    const notEnabled = makeService({ biometric: bio }) // flag defaults to false
    await expect(notEnabled.service.unlockWithFingerprint()).resolves.toBe(false)
    expect(notEnabled.service.isLocked()).toBe(true)
  })

  it('auto-locks per the configured timeout and supports Lock Now', async () => {
    // 'immediately' (0 ms): any background/foreground cycle locks.
    const immediate = makeService()
    await immediate.service.unlockWithPin('1234')
    expect(immediate.service.isLocked()).toBe(false)
    immediate.service.onBackground()
    immediate.service.onForeground()
    expect(immediate.service.isLocked()).toBe(true)

    // '60': 59_999 ms elapsed keeps the session; 60_000 ms locks.
    const sixty = makeService({ config: baseConfig({ timeout: '60' }) })
    await sixty.service.unlockWithPin('1234')
    sixty.service.onBackground()
    sixty.advance(59_999)
    sixty.service.onForeground()
    expect(sixty.service.isLocked()).toBe(false)
    sixty.service.onBackground()
    sixty.advance(60_000)
    sixty.service.onForeground()
    expect(sixty.service.isLocked()).toBe(true)

    // Lock Now locks immediately regardless of the timeout.
    const manual = makeService({ config: baseConfig({ timeout: '900' }) })
    await manual.service.unlockWithPin('1234')
    manual.service.lockNow()
    expect(manual.service.isLocked()).toBe(true)
  })

  it('notifies subscribers on lock-state changes until unsubscribed', async () => {
    const { service } = makeService()
    const states: boolean[] = []
    const unsubscribe = service.subscribe((s) => states.push(s.locked))
    await service.unlockWithPin('1234')
    service.lock()
    unsubscribe()
    await service.unlockWithPin('9999') // already unlocked → no notification
    expect(states).toEqual([false, true])
  })
})

describe('Security change bus (framework-light gate refresh hook)', () => {
  it('notifies subscribers on emitted events until unsubscribed', () => {
    const events: string[] = []
    const unsubscribe = subscribeSecurityEvent((e) => events.push(e))
    emitSecurityEvent('changed')
    emitSecurityEvent('lock-now')
    unsubscribe()
    emitSecurityEvent('changed')
    expect(events).toEqual(['changed', 'lock-now'])
  })
})

describe('App Lock PIN round-trip persistence (Settings → verify → change → remove)', () => {
  let db: Database
  afterAll(() => closeTestDatabase())

  it('enable, set, verify correct/wrong, change, then remove (auto-disables when last)', async () => {
    db = await createTestDatabase()
    setSecurityEnabled(db, true)
    expect(readSecurityConfig(db).enabled).toBe(true)

    // Set PIN → verifier stored, not the raw PIN.
    await savePin(db, '1234')
    expect(readSecurityConfig(db).hasPin).toBe(true)
    expect(getSetting(db, SECURITY_KEY_PIN)).not.toContain('1234')
    expect(await verifySecret('1234', getSetting(db, SECURITY_KEY_PIN))).toBe(true)
    expect(await verifySecret('9999', getSetting(db, SECURITY_KEY_PIN))).toBe(false)

    // Change PIN → old no longer works, new does.
    await savePin(db, '5678')
    expect(await verifySecret('1234', getSetting(db, SECURITY_KEY_PIN))).toBe(false)
    expect(await verifySecret('5678', getSetting(db, SECURITY_KEY_PIN))).toBe(true)

    // Remove the last credential → App Lock auto-disables (fail-safe).
    clearPin(db)
    expect(readSecurityConfig(db).hasPin).toBe(false)
    expect(readSecurityConfig(db).enabled).toBe(false)
  })

  it('reload/restart: the gate rebuilds from persisted config and locks again', async () => {
    db = await createTestDatabase()
    setSecurityEnabled(db, true)
    await savePin(db, '4321')

    // Simulate an app restart: the gate reads the persisted config + verifiers
    // exactly as `useAppLock.buildService()` does on mount, then constructs a
    // fresh service — it must start LOCKED and unlock only with the PIN.
    const config = readSecurityConfig(db)
    const service = createAppLockService({
      config,
      patternVerifier: getSetting(db, SECURITY_KEY_PATTERN),
      pinVerifier: getSetting(db, SECURITY_KEY_PIN),
    })
    expect(service.isLocked()).toBe(true)
    await expect(service.unlockWithPin('4321')).resolves.toBe(true)
    expect(service.isLocked()).toBe(false)

    // A wrong PIN on the restored session must not unlock, and Lock Now must
    // re-lock the restored session.
    service.lock()
    await expect(service.unlockWithPin('0000')).resolves.toBe(false)
    expect(service.isLocked()).toBe(true)
    await expect(service.unlockWithPin('4321')).resolves.toBe(true)
    expect(service.isLocked()).toBe(false)
    service.lockNow()
    expect(service.isLocked()).toBe(true)
  })
})

describe('App Lock gate lifecycle (startup locked; Settings rebuilds keep an unlocked session)', () => {
  it('STARTS locked when App Lock is enabled with a credential (reference initialize())', () => {
    const { service } = makeService()
    expect(service.isLocked()).toBe(true)
  })

  it('starts UNLOCKED only via startUnlocked (session carry-over) and relocks via Lock Now / timeout', () => {
    // The gate rebuilds its service on Settings changes while the session is
    // unlocked — that rebuild must NOT lock the running session.
    const { service } = makeService({ startUnlocked: true })
    expect(service.isLocked()).toBe(false)

    // Lock Now still reaches the carried-over session.
    service.lockNow()
    expect(service.isLocked()).toBe(true)

    // And the background timeout still relocks a carried-over session.
    const { service: carried, advance: advanceCarried } = makeService({
      startUnlocked: true,
      config: baseConfig({ timeout: '60' }),
    })
    carried.onBackground()
    advanceCarried(61_000)
    carried.onForeground()
    expect(carried.isLocked()).toBe(true)
  })

  it('fail-safes still hold: enabled with NO loaded verifier never locks (startup or carried-over)', () => {
    // Enabled + credential in config but NO verifier loaded → must never lock,
    // whether starting locked or carried-over unlocked.
    const { service } = makeService({ pinVerifier: null })
    expect(service.isLocked()).toBe(true) // pattern verifier exists → locks
    const { service: noVerifiers } = makeService({
      patternVerifier: null,
      pinVerifier: null,
    })
    expect(noVerifiers.isLocked()).toBe(false)
    const { service: carriedNoVerifiers } = makeService({
      patternVerifier: null,
      pinVerifier: null,
      startUnlocked: true,
    })
    expect(carriedNoVerifiers.isLocked()).toBe(false)
  })
})
