// @vitest-environment node
import { afterAll, describe, expect, it, vi } from 'vitest'

// In-memory stand-in for the native Capacitor Filesystem (test-only).
const mem = vi.hoisted(() => new Map<string, string>())

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Data: 'DATA' },
  Filesystem: {
    mkdir: vi.fn(async () => undefined),
    readFile: vi.fn(async ({ path }: { path: string }) => {
      const hit = mem.get(path)
      if (hit === undefined) throw new Error('File does not exist')
      return { data: hit }
    }),
    writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
      mem.set(path, data)
    }),
  },
}))

import {
  base64ToBytes,
  bytesToBase64,
  capacitorFsDbAdapter,
  createDbPersistenceAdapter,
  isNativePlatform,
} from './index'

describe('capacitor filesystem db persistence adapter (Android platform layer)', () => {
  afterAll(() => {
    mem.clear()
    vi.restoreAllMocks()
  })

  it('round-trips bytes through base64 (incl. multi-chunk images)', () => {
    const small = new Uint8Array([0, 1, 2, 253, 254, 255])
    expect(base64ToBytes(bytesToBase64(small))).toEqual(small)

    // > 0x8000 bytes forces the chunked encoder path.
    const big = new Uint8Array(0x8000 * 2 + 7)
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256
    expect(base64ToBytes(bytesToBase64(big))).toEqual(big)
  })

  it('load() resolves null on first run (no file yet)', async () => {
    mem.clear()
    await expect(capacitorFsDbAdapter.load()).resolves.toBeNull()
  })

  it('save() writes the app-data sqlite file; load() restores the same bytes', async () => {
    mem.clear()
    const image = new Uint8Array(20)
    for (let i = 0; i < image.length; i += 1) image[i] = (i * 13) % 256
    await capacitorFsDbAdapter.save(image)
    expect(mem.has('sqlite/paddy-v2.sqlite')).toBe(true)
    await expect(capacitorFsDbAdapter.load()).resolves.toEqual(image)
  })

  it('adapter selection: web/desktop (non-native) gets null → IndexedDB fallback', () => {
    // Node/jsdom is never a native Capacitor platform.
    expect(isNativePlatform()).toBe(false)
    expect(createDbPersistenceAdapter()).toBeNull()
  })
})