/**
 * Platform storage adapter tests.
 *
 * Web/desktop parity: `createPdfStorage()` must keep returning the existing
 * browser-download adapter whenever Capacitor reports a non-native platform
 * (which is the case in jsdom/web). Only the native Android container flips
 * to the native MediaStore+Share adapter — that branch is exercised on a
 * real device, not in jsdom.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  browserDownloadStorage,
  capacitorPdfStorage,
  createPdfStorage,
  isNativePlatform,
  saveAndShareAndroidPdf,
} from './index'

vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS', Cache: 'CACHE' },
  Filesystem: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn(async () => ({
      uri: 'file:///cache/paddy-pdfs/PSO-202609-0001.pdf',
    })),
    getUri: vi.fn(async () => ({
      uri: 'content://paddy-pdfs/PSO-202609-0001.pdf',
    })),
  },
}))

const shareMock = vi.hoisted(() => ({ share: vi.fn() }))
vi.mock('@capacitor/share', () => ({ Share: shareMock }))

const pdfSaveMock = vi.hoisted(() => ({
  savePdfNative: vi.fn(async () => ({ path: 'content://media/external/downloads/42' })),
}))
vi.mock('@/infrastructure/platform/gallery', () => ({
  savePdfNative: pdfSaveMock.savePdfNative,
}))

describe('platform PDF storage selection', () => {
  it('exposes a browser (web) and a Capacitor (Android) adapter', () => {
    expect(typeof browserDownloadStorage.saveBinaryFile).toBe('function')
    expect(typeof capacitorPdfStorage.saveBinaryFile).toBe('function')
  })

  it('isNativePlatform() is false outside the native container (jsdom/web)', () => {
    expect(isNativePlatform()).toBe(false)
  })

  it('createPdfStorage() returns the browser adapter on web/desktop (unchanged web behavior)', () => {
    expect(createPdfStorage()).toBe(browserDownloadStorage)
  })

  it('browser adapter download is a no-op in jsdom and returns the relative path', async () => {
    const saved = await browserDownloadStorage.saveBinaryFile(
      'voucher/PSO-202609-0001.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    )
    expect(saved.path).toBe('voucher/PSO-202609-0001.pdf')
  })
})

describe('saveAndShareAndroidPdf (Android adapter)', () => {
  beforeEach(() => {
    shareMock.share.mockReset()
    pdfSaveMock.savePdfNative.mockClear()
    pdfSaveMock.savePdfNative.mockImplementation(async () => ({
      path: 'content://media/external/downloads/42',
    }))
  })

  it('persists the durable copy through the native MediaStore save (no direct Documents write)', async () => {
    const saved = await saveAndShareAndroidPdf(
      'voucher/PSO-202609-0001.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    )
    expect(pdfSaveMock.savePdfNative).toHaveBeenCalledWith(
      'voucher/PSO-202609-0001.pdf',
      expect.any(String),
    )
    expect(saved.path).toBe('content://media/external/downloads/42')
  })

  it('treats share-sheet dismissal ("Share canceled") as success — the PDF is already saved to Download/Paddy', async () => {
    shareMock.share.mockRejectedValueOnce(new Error('Share canceled'))
    const saved = await saveAndShareAndroidPdf(
      'voucher/PSO-202609-0001.pdf',
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    )
    expect(saved.path).toBe('content://media/external/downloads/42')
  })

  it('still surfaces genuine share failures with the saved-but-not-opened message', async () => {
    shareMock.share.mockRejectedValueOnce(new Error('No activity handle for share'))
    await expect(
      saveAndShareAndroidPdf('voucher/PSO-202609-0001.pdf', new Uint8Array([0x25, 0x50, 0x44, 0x46])),
    ).rejects.toThrow(
      'PDF saved to Downloads, but opening it failed: No activity handle for share',
    )
  })
})