/**
 * BackupTab tests — the simplified Backup & Restore UI + restore contract.
 *
 * The service layer (encrypt/decrypt/validate/swap) is covered by
 * `services/backup/*.test.ts`; these tests pin the UI contract:
 *   - simple card structure (styled picker button, hidden native input)
 *   - restore requires a file + password; wrong password is REJECTED before
 *     any swap (service never called, confirm dialog never opens)
 *   - correct password → confirm → service swap → "Restored — reloading…"
 *     and a full page reload (reference behavior: data visible immediately,
 *     durable across restart)
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { rendermount } from '@/app/rendermount'
import type { useT } from '@/shared/hooks'
import { reloadApp } from '@/features/settings/BackupTab'

const serviceFakes = vi.hoisted(() => ({
  createBackupFile: vi.fn(),
  restoreBackupFromBytes: vi.fn(),
}))
const { createBackupFile, restoreBackupFromBytes } = serviceFakes

vi.mock('@/services/backup/service', () => ({
  createBackupFile: serviceFakes.createBackupFile,
  restoreBackupFromBytes: serviceFakes.restoreBackupFromBytes,
  BACKUP_EXTENSION: 'p2bak',
}))

const cryptoFakes = vi.hoisted(() => ({
  decryptBackup: vi.fn(),
}))
const { decryptBackup } = cryptoFakes

vi.mock('@/services/backup/crypto', () => ({
  BackupCryptoError: class BackupCryptoError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'BackupCryptoError'
    }
  },
  decryptBackup: cryptoFakes.decryptBackup,
}))

vi.mock('@/infrastructure/db', () => ({
  getDatabase: () => ({ fake: 'db' }),
}))

const t = ((v: { my: string; en: string }) => v.en) as unknown as ReturnType<typeof useT>

/** A fake picked file with a stubbed arrayBuffer (jsdom File lacks it). */
function fakeFile(): File {
  const file = new File([new Uint8Array([1, 2, 3])], 'paddy_backup_2026-09-04.p2bak')
  Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(3) })
  return file
}

async function mountTab() {
  const { BackupTab } = await import('@/features/settings/BackupTab')
  return rendermount(<BackupTab t={t} />)
}

function pickFile(container: HTMLElement, file: File): void {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

/** React-controlled inputs need the native value setter (value tracking). */
function setInputValue(container: HTMLElement, selector: string, value: string): void {
  const input = container.querySelector(selector) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

function typePassword(container: HTMLElement, password: string): void {
  setInputValue(container, 'input[type="password"][aria-label="Restore password"]', password)
}

describe('BackupTab (simplified UI + restore contract)', () => {
  const reloadSpy = vi.fn()

  beforeEach(() => {
    createBackupFile.mockReset().mockResolvedValue({ path: '/x', createdAt: 'now' })
    restoreBackupFromBytes.mockReset().mockResolvedValue(undefined)
    decryptBackup.mockReset().mockResolvedValue({ plaintext: new Uint8Array() })
    vi.spyOn(reloadApp, 'run').mockImplementation(() => reloadSpy())
    reloadSpy.mockClear()
  })

  it('renders the simple card: styled picker button, hidden native input', async () => {
    const r = await mountTab()
    try {
      expect(r.html()).toContain('BACKUP &amp; RESTORE')
      expect(r.html()).toContain('Select backup file')
      expect(r.html()).toContain('Save backup')
      expect(r.html()).toContain('Restore backup')
      expect(r.html()).toContain('This will replace your current data.')
      const input = r.container.querySelector('input[type="file"]') as HTMLInputElement
      expect(input).not.toBeNull()
      expect(input.className).toContain('hidden') // never the bare native control
    } finally {
      await r.unmount()
    }
  })

  it('restore requires a file: button disabled without one', async () => {
    const r = await mountTab()
    try {
      const restore = Array.from(r.container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Restore backup',
      )
      expect(restore).toBeDefined()
      expect((restore as HTMLButtonElement).disabled).toBe(true)
      expect(restoreBackupFromBytes).not.toHaveBeenCalled()
    } finally {
      await r.unmount()
    }
  })

  it('wrong password → rejected before any swap (service + dialog untouched)', async () => {
    decryptBackup.mockRejectedValue(
      new (await import('@/services/backup/crypto')).BackupCryptoError('Wrong password or corrupted backup'),
    )
    const r = await mountTab()
    try {
      pickFile(r.container, fakeFile())
      typePassword(r.container, 'wrong')
      const restore = Array.from(r.container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Restore backup',
      ) as HTMLButtonElement
      restore.click()
      await vi.waitFor(() => {
        expect(r.html()).toContain('Wrong password or corrupted backup')
      })
      expect(restoreBackupFromBytes).not.toHaveBeenCalled()
      expect(r.container.querySelector('[role="dialog"]')).toBeNull()
    } finally {
      await r.unmount()
    }
  })

  it('correct password → confirm → swap → reloading status → full reload', async () => {
    const r = await mountTab()
    try {
      pickFile(r.container, fakeFile())
      typePassword(r.container, 'correct')
      const restore = Array.from(r.container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Restore backup',
      ) as HTMLButtonElement
      restore.click()
      await vi.waitFor(() => {
        expect(r.container.querySelector('[role="dialog"]')).not.toBeNull()
      })
      expect(restoreBackupFromBytes).not.toHaveBeenCalled() // only after confirm

      const replace = Array.from(r.container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Replace',
      ) as HTMLButtonElement
      replace.click()
      await vi.waitFor(() => {
        expect(restoreBackupFromBytes).toHaveBeenCalledTimes(1)
      })
      expect(restoreBackupFromBytes).toHaveBeenCalledWith(
        { fake: 'db' },
        expect.any(Uint8Array),
        'correct',
      )
      await vi.waitFor(() => {
        expect(r.html()).toContain('✓ Restored — reloading…')
        expect(reloadSpy).toHaveBeenCalledTimes(1)
      })
    } finally {
      await r.unmount()
    }
  })

  it('shows a clear success message after backup creation', async () => {
    const r = await mountTab()
    try {
      setInputValue(r.container, 'input[aria-label="Backup password"]', 'secret')
      const save = Array.from(r.container.querySelectorAll('button')).find(
        (b) => b.textContent === 'Save backup',
      ) as HTMLButtonElement
      save.click()
      await vi.waitFor(() => {
        expect(r.html()).toContain('✓ Backup saved')
      })
      expect(createBackupFile).toHaveBeenCalledWith({ fake: 'db' }, 'secret')
    } finally {
      await r.unmount()
    }
  })
})
