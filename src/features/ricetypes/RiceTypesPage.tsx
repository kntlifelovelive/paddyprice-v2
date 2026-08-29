/**
 * Paddy Types feature page (Step 8) - PROJECT_SPEC §3.6.
 *
 * CRUD over the rice types list. Goes through `infrastructure/db/dao/riceTypes`.
 * No business calculation lives here.
 */
import { useEffect, useState } from 'react'

import { getDatabase } from '@/infrastructure/db'
import {
  createRiceType,
  deleteRiceType,
  listRiceTypes,
  updateRiceType,
} from '@/infrastructure/db/dao/riceTypes'
import type { RiceType } from '@/types'
import { useT } from '@/shared/hooks'
import { Text, cn } from '@/shared/ui'

interface Draft {
  name: string
  description: string
  active: boolean
}

function empty(): Draft {
  return { name: '', description: '', active: true }
}

export function RiceTypesPage(): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<RiceType[]>([])
  const [draft, setDraft] = useState<Draft>(empty())
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(empty())
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    try {
      setItems(listRiceTypes(getDatabase(), false))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }
  useEffect(() => {
    refresh()
  }, [])

  const handleAdd = () => {
    if (draft.name.trim() === '') {
      setError('Name is required')
      return
    }
    try {
      createRiceType(getDatabase(), {
        name: draft.name.trim(),
        description: draft.description.trim(),
        active: draft.active ? 1 : 0,
      })
      setDraft(empty())
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSave = (id: number) => {
    if (editDraft.name.trim() === '') {
      setError('Name is required')
      return
    }
    try {
      updateRiceType(getDatabase(), id, {
        name: editDraft.name.trim(),
        description: editDraft.description.trim(),
        active: editDraft.active ? 1 : 0,
      })
      setEditingId(null)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleDelete = (id: number) => {
    try {
      deleteRiceType(getDatabase(), id)
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const beginEdit = (rt: RiceType) => {
    setEditingId(rt.id)
    setEditDraft({
      name: rt.name,
      description: rt.description,
      active: rt.active === 1,
    })
  }

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="rice-types">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'စပါးအမျိုးအစားများ', en: 'Paddy Types' })}
      </Text>

      {error && (
        <p role="alert" className="rounded border border-border bg-surface p-2 text-sm">
          <Text role="primary">{error}</Text>
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-3">
        <Text as="h2" role="header" className="text-sm font-semibold">
          {t({ my: 'အသစ်ထည့်ရန်', en: 'Add' })}
        </Text>
        <div className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            placeholder={t({ my: 'အမည်', en: 'Name' })}
            className="rounded border border-border bg-background px-2 py-1.5"
          />
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            placeholder={t({ my: 'ဖော်ပြချက်', en: 'Description' })}
            className="rounded border border-border bg-background px-2 py-1.5"
          />
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
            />
            <Text role="primary">{t({ my: 'အသုံးပြုနိုင်', en: 'Active' })}</Text>
          </label>
        </div>
        <div className="mt-2">
          <button
            type="button"
            onClick={handleAdd}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-text hover:bg-accent-hover"
          >
            {t({ my: 'ထည့်မည်', en: 'Add' })}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface">
        <div className="border-b border-border p-3">
          <Text as="h2" role="header" className="text-sm font-semibold">
            {t({ my: 'စာရင်း', en: 'List' })} ({items.length})
          </Text>
        </div>
        {items.length === 0 ? (
          <div className="p-4 text-center">
            <Text role="muted">{t({ my: 'မရှိသေးပါ', en: 'Empty' })}</Text>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'အမည်', en: 'Name' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-left">
                    <Text role="header">{t({ my: 'ဖော်ပြချက်', en: 'Description' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-center">
                    <Text role="header">{t({ my: 'အခြေအနေ', en: 'Status' })}</Text>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((rt) => (
                  <tr key={rt.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1">
                      {editingId === rt.id ? (
                        <input
                          type="text"
                          value={editDraft.name}
                          onChange={(e) => setEditDraft({ ...editDraft, name: e.target.value })}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="primary">{rt.name}</Text>
                      )}
                    </td>
                    <td className="px-2 py-1">
                      {editingId === rt.id ? (
                        <input
                          type="text"
                          value={editDraft.description}
                          onChange={(e) => setEditDraft({ ...editDraft, description: e.target.value })}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="secondary">{rt.description}</Text>
                      )}
                    </td>
                    <td className="px-2 py-1 text-center">
                      {editingId === rt.id ? (
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={editDraft.active}
                            onChange={(e) => setEditDraft({ ...editDraft, active: e.target.checked })}
                          />
                          <Text role="primary">
                            {t({ my: 'အသုံးပြုနိုင်', en: 'Active' })}
                          </Text>
                        </label>
                      ) : (
                        <Text role={rt.active === 1 ? 'primary' : 'muted'}>
                          {rt.active === 1
                            ? t({ my: 'အသုံးပြုနိုင်', en: 'Active' })
                            : t({ my: 'ပိတ်ထား', en: 'Inactive' })}
                        </Text>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {editingId === rt.id ? (
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleSave(rt.id)}
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
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(rt)}
                            className={cn(
                              'rounded border border-border bg-surface px-2 py-0.5 text-xs',
                              'hover:bg-surface-hover',
                            )}
                          >
                            {t({ my: 'ပြင်ဆင်', en: 'Edit' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(rt.id)}
                            className="rounded border border-border bg-surface px-2 py-0.5 text-xs hover:bg-surface-hover"
                          >
                            {t({ my: 'ဖျက်', en: 'Delete' })}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default RiceTypesPage
