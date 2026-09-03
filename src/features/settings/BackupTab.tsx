/**
 * BackupTab — the "Backup & Restore" section inside Settings (reference
 * SettingsPage 'backup' section, rebuilt with the existing P2 primitives:
 * SettingsSection / SettingsRow / SVG icon system / ConfirmDialog).
 *
 * Backup: the complete SQLite user-data image, serialized + authenticated-
 * encrypted (AES-256-GCM, PBKDF2-SHA256 key from the user's backup password)
 * by `services/backup` — never plain readable JSON.
 *
 * Restore: pick file → password → authenticate/decrypt → validate → confirm
 * → swap via the existing persistence architecture → full bootstrap re-run so
 * every store re-reads the restored data. Any failure (unknown format/version,
 * wrong password, corruption) is rejected BEFORE the swap and leaves the
 * existing data untouched.
 *
 * Passwords exist only transiently in form state — never logged, never stored.
 */
import { useState } from 'react'
import { useT } from '@/shared/hooks'
import { Text, ConfirmDialog } from '@/shared/ui'
import { SettingsSection, SettingsRow } from '@/shared/ui/settings'
import { IconDatabase, IconRestore } from '@/shared/ui/settings/icons'
import { getDatabase } from '@/infrastructure/db'
import { createBackupFile, restoreBackupFromBytes, BACKUP_EXTENSION } from '@/services/backup/service'
import { BackupCryptoError, decryptBackup } from '@/services/backup/crypto'

export function BackupTab({ t }: { t: ReturnType<typeof useT> }): JSX.Element {
  const [backupPassword, setBackupPassword] = useState('')
  const [restorePassword, setRestorePassword] = useState('')
  const [pendingBytes, setPendingBytes] = useState<Uint8Array | null>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)

  const flash = (message: string): void => {
    setStatus(message)
    setError(null)
  }
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
    try {
      await createBackupFile(getDatabase(), backupPassword)
      setBackupPassword('')
      flash(t({ my: '✓ Backup သိမ်းပြီး', en: '✓ Backup saved' }))
    } catch (err) {
      // Best-effort console hint WITHOUT the password or any plaintext data.
      console.error('[backup] failed:', err instanceof Error ? err.message : String(err))
      fail(t({ my: 'Backup မအောင်မြင်ပါ', en: 'Backup failed' }))
    } finally {
      setBusy(false)
    }
  }

  /** Stage 1-6: pick → decrypt → validate. Only staging — no swap yet. */
  const handleValidateFile = async (file: File): Promise<void> => {
    setError(null)
    setStatus(null)
    if (restorePassword.length === 0) {
      fail(t({ my: 'Backup စကားဝှက် ထည့်ပါ', en: 'Enter the backup password' }))
      return
    }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      // Full envelope + password + authenticity validation WITHOUT touching
      // the live database (decryptBackup throws before any data is returned).
      await decryptBackup(bytes, restorePassword)
      setPendingBytes(bytes)
      flash(t({ my: 'Backup စစ်ဆေးပြီး — အတည်ပြုပါ', en: 'Backup validated — confirm to replace existing data' }))
    } catch (err) {
      setPendingBytes(null)
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

  /** Stage 7-10 (user-confirmed): validated swap + full app re-bootstrap. */
  const handleRestoreConfirmed = async (): Promise<void> => {
    if (!pendingBytes) return
    setBusy(true)
    try {
      await restoreBackupFromBytes(getDatabase(), pendingBytes, restorePassword)
      setPendingBytes(null)
      setRestorePassword('')
      // Re-run the app bootstrap so every store re-reads the restored data,
      // then land on the Dashboard.
      const { useAppStore } = await import('@/app/state/useAppStore')
      await useAppStore.getState().initialize()
      window.location.hash = '#/'
      flash(t({ my: '✓ ပြန်ထည့်ပြီး', en: '✓ Restored' }))
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
      <SettingsSection title={t({ my: 'Backup & Restore', en: 'Backup & Restore' })}>
        <div className="space-y-3 p-3">
          <p className="text-sm">
            <Text role="secondary">
              {t({
                my: 'Backup ဖိုင်တွင် အချက်အလက်အားလုံး ပါဝင်ပြီး စကားဝှက်ဖြင့် ကာကွယ်ထားသည်။',
                en: 'The backup file contains all app data, protected by your password (AES-256-GCM).',
              })}
            </Text>
          </p>

          <SettingsRow
            icon={<IconDatabase />}
            title={t({ my: 'Backup ပြုလုပ်ရန်', en: 'Create backup' })}
            description={t({ my: 'စကားဝှက်ဖြင့် ကုဒ်ဝှက်သိမ်းဆည်းမည်', en: 'Encrypted with your password' })}
          />
          <input
            type="password"
            value={backupPassword}
            onChange={(e) => setBackupPassword(e.target.value)}
            placeholder={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
            aria-label={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
            autoComplete="new-password"
            className="w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBackup()}
            className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {t({ my: 'Backup သိမ်းမည်', en: 'Save backup' })}
          </button>

          <div className="border-t border-border pt-3">
            <SettingsRow
              icon={<IconRestore />}
              title={t({ my: 'Backup မှ ပြန်ထည့်ရန်', en: 'Restore from backup' })}
              description={t({ my: 'လက်ရှိအချက်အလက်အား အစားထိုးမည်', en: 'Replaces ALL existing data' })}
            />
            <input
              type="password"
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
              placeholder={t({ my: 'Backup စကားဝှက်', en: 'Backup password' })}
              aria-label={t({ my: 'Restore စကားဝှက်', en: 'Restore password' })}
              autoComplete="off"
              className="mt-2 w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
            />
            {/* Native file picker — works on web AND Android WebView (same
                input element; no platform branching). */}
            <input
              type="file"
              accept={`.${BACKUP_EXTENSION},application/octet-stream`}
              aria-label={t({ my: 'Backup ဖိုင် ရွေးရန်', en: 'Choose backup file' })}
              className="mt-2 w-full text-sm"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = '' // allow re-picking the same file
                if (file) void handleValidateFile(file)
              }}
            />
            <button
              type="button"
              disabled={busy || !pendingBytes}
              onClick={() => setConfirmRestore(true)}
              className="mt-2 w-full rounded-lg border border-danger px-4 py-2 text-sm font-medium text-content-danger transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {t({ my: 'လက်ရှိအချက်အလက်ကို အစားထိုးမည်', en: 'Replace existing data' })}
            </button>
          </div>

          {status && (
            <p role="status" className="text-sm">
              <Text role="primary">{status}</Text>
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm">
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
