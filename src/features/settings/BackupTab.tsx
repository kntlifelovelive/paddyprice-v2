/**
 * BackupTab — the "Backup & Restore" section inside Settings.
 *
 * UI (task spec): ONE simple card — Backup (password + save) and Restore
 * (select file → password → restore), status/error at the bottom. No
 * background images, no glass/transparency, no native file-input look: the
 * picker is a styled button that shows the chosen file name.
 *
 * Backup: the complete SQLite user-data image, AES-256-GCM encrypted with the
 * user's backup password (`services/backup`) — never plain readable JSON.
 *
 * Restore (reference `~/paddyprice` behavior): pick file → password →
 * authenticate/decrypt + validate → confirm → swap via the existing
 * persistence architecture → FULL RELOAD, exactly like the reference
 * (`✓ Restored — reloading…` → `window.location.reload()`). The reload
 * re-runs bootstrap from the persisted (restored) image, so restored data is
 * visible immediately and survives refresh/restart. Any failure (unknown
 * format/version, wrong password, corruption) is rejected BEFORE the swap and
 * leaves the existing data untouched.
 *
 * Passwords exist only transiently in form state — never logged, never stored.
 */
import { useRef, useState } from 'react'
import type { useT } from '@/shared/hooks'
import { Text, ConfirmDialog } from '@/shared/ui'
import { SettingsSection } from '@/shared/ui/settings'
import { IconDatabase, IconRestore } from '@/shared/ui/settings/icons'
import { getDatabase } from '@/infrastructure/db'
import { createBackupFile, restoreBackupFromBytes, BACKUP_EXTENSION } from '@/services/backup/service'
import { BackupCryptoError, decryptBackup } from '@/services/backup/crypto'

/** Reference pause between "Restored" and the reload (lets the user see it). */
const RELOAD_DELAY_MS = 800

/**
 * Full page reload after a successful restore (reference behavior). Indirected
 * through an object so tests can spy on it — jsdom's window.location.reload
 * is neither spiable nor redefinable.
 */
export const reloadApp = {
  run(): void {
    window.location.reload()
  },
}

const inputClass =
  'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
const primaryButtonClass =
  'w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50'

export function BackupTab({ t }: { t: ReturnType<typeof useT> }): JSX.Element {
  const [backupPassword, setBackupPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fail = (message: string): void => {
    setError(message)
    setStatus(null)
  }

  const handleBackup = async (): Promise<void> => {
    if (backupPassword.length === 0) {
      fail(t({ my: 'စကားဝှက် ထည့်ပါ', en: 'Enter a backup password' }))
      return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      await createBackupFile(getDatabase(), backupPassword)
      setBackupPassword('')
      setStatus(t({ my: '✓ Backup သိမ်းပြီး', en: '✓ Backup saved' }))
    } catch (err) {
      // Best-effort console hint WITHOUT the password or any plaintext data.
      console.error('[backup] failed:', err instanceof Error ? err.message : String(err))
      fail(t({ my: 'Backup မအောင်မြင်ပါ', en: 'Backup failed' }))
    } finally {
      setBusy(false)
    }
  }

  /**
   * Restore step 1: decrypt + validate the chosen file with the entered
   * password. Nothing is touched yet — the swap happens only after the user
   * confirms, and only a fully validated backup can reach that point.
   */
  const handleRestore = async (): Promise<void> => {
    if (!file) {
      fail(t({ my: 'Backup ဖိုင် ရွေးပါ', en: 'Select a backup file' }))
      return
    }
    if (restorePassword.length === 0) {
      fail(t({ my: 'Backup စကားဝှက် ထည့်ပါ', en: 'Enter the backup password' }))
      return
    }
    setBusy(true)
    setError(null)
    setStatus(null)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // Full envelope + password + authenticity validation WITHOUT touching
      // the live database (decryptBackup throws before any data is returned).
      await decryptBackup(bytes, restorePassword)
      setConfirmRestore(true)
    } catch (err) {
      if (err instanceof BackupCryptoError) {
        fail(t({ my: 'စကားဝှက်မှားယွင်းသည် သို့မဟုတ် ဖိုင်ပျက်စီးသည်', en: 'Wrong password or corrupted backup' }))
      } else {
        console.error('[backup] validate failed:', err instanceof Error ? err.message : String(err))
        fail(t({ my: 'Restore မအောင်မြင်ပါ', en: 'Restore failed' }))
      }
    } finally {
      setBusy(false)
    }
  }

  /** Restore step 2 (user-confirmed): validated swap + full app reload. */
  const handleRestoreConfirmed = async (): Promise<void> => {
    if (!file) return
    setBusy(true)
    setConfirmRestore(false)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      await restoreBackupFromBytes(getDatabase(), bytes, restorePassword)
      setRestorePassword('')
      setStatus(t({ my: '✓ ပြန်ထည့်ပြီး — ပြန်စနေသည်…', en: '✓ Restored — reloading…' }))
      // Reference behavior: a FULL reload re-runs bootstrap from the persisted
      // (restored) image — restored data is visible immediately and durable
      // across refresh/restart. No in-place store patching to get stale.
      window.setTimeout(() => reloadApp.run(), RELOAD_DELAY_MS)
    } catch (err) {
      if (err instanceof BackupCryptoError) {
        fail(t({ my: 'စကားဝှက်မှားယွင်းသည် သို့မဟုတ် ဖိုင်ပျက်စီးသည်', en: 'Wrong password or corrupted backup' }))
      } else {
        console.error('[restore] failed:', err instanceof Error ? err.message : String(err))
        fail(t({ my: 'Restore မအောင်မြင်ပါ', en: 'Restore failed' }))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <SettingsSection title={t({ my: 'Backup & Restore', en: 'BACKUP & RESTORE' })}>
        <div className="space-y-4 p-4">
          {/* ------------------------------------------------ Backup ------ */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <IconDatabase size="h-4 w-4 shrink-0 text-accent" />
              <Text role="primary" className="text-sm font-semibold">
                {t({ my: 'Backup', en: 'Backup' })}
              </Text>
            </div>
            <Text role="secondary" className="block text-sm">
              {t({ my: 'အချက်အလက်အားလုံးကို စကားဝှက်ဖြင့် ကာကွယ်သိမ်းဆည်းမည်', en: 'Protect your app data with a password.' })}
            </Text>
            <input
              type="password"
              value={backupPassword}
              onChange={(e) => setBackupPassword(e.target.value)}
              placeholder={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
              aria-label={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
              autoComplete="new-password"
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleBackup()}
              className={primaryButtonClass}
            >
              {t({ my: 'Backup သိမ်းမည်', en: 'Save backup' })}
            </button>
          </section>

          <div className="border-t border-border" aria-hidden="true" />

          {/* ----------------------------------------------- Restore ------ */}
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <IconRestore size="h-4 w-4 shrink-0 text-accent" />
              <Text role="primary" className="text-sm font-semibold">
                {t({ my: 'ပြန်ထည့်ခြင်း', en: 'Restore' })}
              </Text>
            </div>
            <Text role="secondary" className="block text-sm">
              {t({ my: 'Backup ဖိုင်မှ အချက်အလက်ကို ပြန်ထည့်မည်', en: 'Restore your data from a backup file.' })}
            </Text>
            <Text role="secondary" className="block text-sm font-medium text-content-danger">
              {t({ my: 'လက်ရှိအချက်အလက်များ အစားထိုးခံရမည်', en: 'This will replace your current data.' })}
            </Text>

            {/* Styled picker: the native input stays hidden; the button shows
                the chosen file name (never the bare "Browse… No file chosen"). */}
            <input
              ref={fileInputRef}
              type="file"
              accept={`.${BACKUP_EXTENSION},application/octet-stream`}
              aria-label={t({ my: 'Backup ဖိုင် ရွေးရန်', en: 'Choose backup file' })}
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0] ?? null
                e.target.value = '' // allow re-picking the same file
                setFile(picked)
                setError(null)
                setStatus(null)
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
              className={`${inputClass} flex items-center justify-between text-left hover:border-accent`}
            >
              <span className={file ? 'text-content' : 'text-content-muted'}>
                {file ? file.name : t({ my: 'Backup ဖိုင် ရွေးမည်', en: 'Select backup file' })}
              </span>
              <span aria-hidden="true" className="text-content-muted">
                {file ? '✓' : '📄'}
              </span>
            </button>
            <input
              type="password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              placeholder={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
              aria-label={t({ my: 'Restore စကားဝှက်', en: 'Restore password' })}
              autoComplete="off"
              className={inputClass}
            />
            <button
              type="button"
              disabled={busy || !file}
              onClick={() => void handleRestore()}
              className={primaryButtonClass}
            >
              {t({ my: 'ပြန်ထည့်မည်', en: 'Restore backup' })}
            </button>
          </section>

          {/* ------------------------------------- Status / errors -------- */}
          {status && (
            <p role="status" className="text-sm font-medium text-success">
              <Text role="primary" className="text-success">{status}</Text>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm font-medium text-content-danger">
              <Text role="primary" className="text-content-danger">{error}</Text>
            </p>
          )}
        </div>
      </SettingsSection>

      <ConfirmDialog
        open={confirmRestore}
        title={t({ my: 'အချက်အလက် အစားထိုးမှု အတည်ပြုချက်', en: 'Confirm restore' })}
        message={t({
          my: 'လက်ရှိ အချက်အလက်အားလုံး ပျက်သွားမည်။ ဆက်လက်လုပ်ဆောင်မည်လား။',
          en: 'All existing data will be replaced by the backup. Continue?',
        })}
        confirmLabel={t({ my: 'အစားထိုးမည်', en: 'Replace' })}
        cancelLabel={t({ my: 'မလုပ်တော့ပါ', en: 'Cancel' })}
        danger
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => {
          setConfirmRestore(false)
          void handleRestoreConfirmed()
        }}
      />
    </div>
  )
}
