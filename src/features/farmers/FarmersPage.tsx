/**
 * Farmers (Customers) feature page (Step 8) - PROJECT_SPEC §3.6.
 *
 * CRUD over the farmers list. Goes through `infrastructure/db/dao/farmers`;
 * no business calculation lives here.
 *
 * Step 11 §3 — Address and Phone Number are added to the create/edit form and
 * to the data table. The columns already exist on `farmers` (v1 schema) and
 * the DAO accepts them; the page simply reuses the existing contracts.
 *
 * Step 11 §7 — newest-first display order; the table shows a No column where
 * the No is the record's PERMANENT creation rank (No. 1 = first created, the
 * newest row at the top carries the highest No) — see shared/creationOrder.
 */
import { useEffect, useState } from 'react'

import { getDatabase } from '@/infrastructure/db'
import {
  createFarmer,
  deleteFarmer,
  listFarmers,
  updateFarmer,
  type FarmerInput,
  type FarmerPatch,
} from '@/infrastructure/db/dao/farmers'
import {
  readCredentialAvailability,
  verifyAppLockCredential,
  type CredentialAvailability,
} from '@/services/security/credential-verify'
import type { Farmer } from '@/types'
import { useT } from '@/shared/hooks'
import { creationOrderNos } from '@/shared/creationOrder'
import { ConfirmDialog, CredentialUnlockDialog, DeleteIcon, EditIcon, LockIcon, Text, UnlockIcon, cn } from '@/shared/ui'

interface FarmerDraft {
  name: string
  address: string
  phone: string
}

function emptyDraft(): FarmerDraft {
  return { name: '', address: '', phone: '' }
}

export function FarmersPage(): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<Farmer[]>([])
  const [draft, setDraft] = useState<FarmerDraft>(emptyDraft())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingDraft, setEditingDraft] = useState<FarmerDraft>(emptyDraft())
  const [error, setError] = useState<string | null>(null)

  // Delete-protection: customers are locked for deletion by default when App
  // Lock has a credential configured. Track which farmer rows are currently
  // unlocked (per-row). Returns to locked after deletion or page unmount.
  const [unlockedIds, setUnlockedIds] = useState<Set<number>>(new Set())
  const [unlockTarget, setUnlockTarget] = useState<Farmer | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<Farmer | null>(null)
  const [securityEnabled, setSecurityEnabled] = useState(false)
  const [credAvail, setCredAvail] = useState<CredentialAvailability>({ hasPattern: false, hasPin: false })

  useEffect(() => {
    try {
      const db = getDatabase()
      setItems(listFarmers(db))
      const cred = readCredentialAvailability(db)
      setCredAvail(cred)
      setSecurityEnabled(cred.hasPattern || cred.hasPin)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const refresh = () => {
    try {
      setItems(listFarmers(getDatabase()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleAdd = () => {
    const name = draft.name.trim()
    if (name === '') {
      setError('Name is required')
      return
    }
    try {
      const input: FarmerInput = {
        name,
        address: draft.address.trim(),
        phone: draft.phone.trim(),
      }
      createFarmer(getDatabase(), input)
      setDraft(emptyDraft())
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const beginEdit = (f: Farmer) => {
    setEditingId(f.id)
    setEditingDraft({ name: f.name, address: f.address, phone: f.phone })
  }

  const handleSave = (id: number) => {
    const name = editingDraft.name.trim()
    if (name === '') {
      setError('Name is required')
      return
    }
    try {
      const patch: FarmerPatch = {
        name,
        address: editingDraft.address.trim(),
        phone: editingDraft.phone.trim(),
      }
      updateFarmer(getDatabase(), id, patch)
      setEditingId(null)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = (id: number) => {
    try {
      deleteFarmer(getDatabase(), id)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUnlockedIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      setDeleteConfirm(null)
    }
  }

  const handleUnlock = (farmer: Farmer) => {
    setUnlockedIds((prev) => new Set(prev).add(farmer.id))
    setUnlockTarget(null)
  }

  const handleLock = (id: number) => {
    setUnlockedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  /** Open the credential dialog for a row — reads configured App Lock
      credentials fresh so the dialog offers exactly the right method(s). */
  const openUnlock = (f: Farmer) => {
    try {
      setCredAvail(readCredentialAvailability(getDatabase()))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return
    }
    setUnlockTarget(f)
  }

  // No. = permanent creation rank (No. 1 = first created; the newest record
  // at the TOP of the table carries the HIGHEST No). Derived from the
  // persisted created_at/id — no duplicate numbering state.
  const nos = creationOrderNos(items)

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="farmers">
      <Text as="h1" role="header" className="text-lg font-semibold text-accent-hover">
        {t({ my: 'လယ်သမားများ', en: 'Customers' })}
      </Text>

      {error && (
        <p role="alert" className="rounded border border-border bg-surface p-2 text-sm">
          <Text role="primary">{error}</Text>
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
          {t({ my: 'အသစ်ထည့်ရန်', en: 'Add' })}
        </Text>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder={t({ my: 'လယ်သမား အမည်', en: 'Customer name' })}
            className="rounded border border-border bg-background px-2 py-1.5"
          />
          <input
            type="text"
            value={draft.phone}
            onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))}
            placeholder={t({ my: 'ဖုန်းနံပါတ်', en: 'Phone number' })}
            className="rounded border border-border bg-background px-2 py-1.5"
            inputMode="tel"
          />
          <input
            type="text"
            value={draft.address}
            onChange={(e) => setDraft((d) => ({ ...d, address: e.target.value }))}
            placeholder={t({ my: 'လိပ်စာ', en: 'Address' })}
            className="rounded border border-border bg-background px-2 py-1.5 sm:col-span-2"
          />
        </div>
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            {t({ my: 'ထည့်မည်', en: 'Add' })}
          </button>
        </div>
      </section>

      {/* Moisture-style list rendering: header card, then either an empty
          card or the table in its own overflow-hidden section. */}
      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold text-accent-hover">
          {t({ my: 'စာရင်း', en: 'List' })} ({items.length})
        </Text>
      </section>
      {items.length === 0 ? (
        <section className="rounded-lg border border-border bg-surface p-4">
          <Text role="muted">{t({ my: 'မရှိသေးပါ', en: 'Empty' })}</Text>
        </section>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="w-10 px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'အစဉ်', en: 'No' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'အမည်', en: 'Name' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'လိပ်စာ', en: 'Address' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'ဖုန်းနံပါတ်', en: 'Phone' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header" className="font-semibold text-accent">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-b-0 hover:bg-surface-hover">
                    <td className="w-10 px-2 py-2 text-right tabular-nums">
                      <Text role="secondary">{nos.get(f.id)}</Text>
                    </td>
                    <td className="px-2 py-2">
                      {editingId === f.id ? (
                        <input
                          type="text"
                          value={editingDraft.name}
                          onChange={(e) => setEditingDraft((d) => ({ ...d, name: e.target.value }))}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="primary" className="font-medium text-accent">{f.name}</Text>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingId === f.id ? (
                        <input
                          type="text"
                          value={editingDraft.address}
                          onChange={(e) => setEditingDraft((d) => ({ ...d, address: e.target.value }))}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="secondary">{f.address || '—'}</Text>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      {editingId === f.id ? (
                        <input
                          type="text"
                          value={editingDraft.phone}
                          onChange={(e) => setEditingDraft((d) => ({ ...d, phone: e.target.value }))}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="secondary">{f.phone || '—'}</Text>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {editingId === f.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSave(f.id)}
                            className="rounded bg-accent px-2 py-0.5 text-xs text-accent-text hover:bg-accent-hover"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className={cn(
                              'rounded border border-border bg-surface px-2 py-0.5 text-xs',
                              'hover:bg-surface-hover',
                            )}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => beginEdit(f)}
                            aria-label={t({ my: 'လယ်သမား ပြင်ရန်', en: 'Edit customer' })}
                            title={t({ my: 'လယ်သမား ပြင်ရန်', en: 'Edit customer' })}
                            className="rounded p-1.5 text-warning hover:bg-surface-hover"
                          >
                            <EditIcon size="h-4 w-4" />
                          </button>
                          {securityEnabled ? (
                            unlockedIds.has(f.id) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleLock(f.id)}
                                  aria-label={t({ my: 'သော့ခတ်ရန်', en: 'Lock row' })}
                                  title={t({ my: 'သော့ခတ်ရန်', en: 'Lock row' })}
                                  className="rounded p-1.5 text-success hover:bg-surface-hover"
                                >
                                  <UnlockIcon size="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirm(f)}
                                  aria-label={t({ my: 'လယ်သမား ဖျက်ရန်', en: 'Delete customer' })}
                                  title={t({ my: 'လယ်သမား ဖျက်ရန်', en: 'Delete customer' })}
                                  className="rounded p-1.5 text-danger hover:bg-surface-hover"
                                >
                                  <DeleteIcon size="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openUnlock(f)}
                                aria-label={t({ my: 'ဖျက်ရန် သော့ဖွင့်ပါ', en: 'Unlock to delete' })}
                                title={t({ my: 'ဖျက်ရန် သော့ဖွင့်ပါ', en: 'Unlock to delete' })}
                                className="rounded p-1.5 text-danger hover:bg-surface-hover"
                              >
                                <LockIcon size="h-4 w-4" aria-label="Locked" />
                              </button>
                            )
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirm(f)}
                              aria-label={t({ my: 'လယ်သမား ဖျက်ရန်', en: 'Delete customer' })}
                              title={t({ my: 'လယ်သမား ဖျက်ရန်', en: 'Delete customer' })}
                              className="rounded p-1.5 text-danger hover:bg-surface-hover"
                            >
                              <DeleteIcon size="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {deleteConfirm && (
        <ConfirmDialog
          open={true}
          title={t({ my: 'ဖျက်မည်', en: 'Delete customer' })}
          message={t({
            my: `“${deleteConfirm.name}” ကို ဖျက်ပါမည်?`,
            en: `Delete ${deleteConfirm.name}?`,
          })}
          danger
          confirmLabel={t({ my: 'ဖျက်မည်', en: 'Delete' })}
          cancelLabel={t({ my: 'မလုပ်တော့', en: 'Cancel' })}
          onConfirm={() => handleDelete(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {unlockTarget && (
        <CredentialUnlockDialog
          title={t({ my: 'ဖျက်ရန်', en: 'Delete customer' })}
          message={t({ my: `“${unlockTarget.name}” ကို ဖျက်မည်`, en: `Delete ${unlockTarget.name}?` })}
          hasPattern={credAvail.hasPattern}
          hasPin={credAvail.hasPin}
          onVerify={(attempt) => verifyAppLockCredential(getDatabase(), attempt)}
          onSuccess={() => handleUnlock(unlockTarget)}
          onClose={() => setUnlockTarget(null)}
        />
      )}
    </div>
  )
}

export default FarmersPage
