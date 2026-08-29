/**
 * Farmers (Customers) feature page (Step 8) - PROJECT_SPEC §3.6.
 *
 * CRUD over the farmers list. Goes through `infrastructure/db/dao/farmers`;
 * no business calculation lives here.
 */
import { useEffect, useState } from 'react'

import { getDatabase } from '@/infrastructure/db'
import {
  createFarmer,
  deleteFarmer,
  listFarmers,
  updateFarmer,
} from '@/infrastructure/db/dao/farmers'
import type { Farmer } from '@/types'
import { useT } from '@/shared/hooks'
import { Text, cn } from '@/shared/ui'

export function FarmersPage(): JSX.Element {
  const t = useT()
  const [items, setItems] = useState<Farmer[]>([])
  const [draftName, setDraftName] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setItems(listFarmers(getDatabase()))
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
    const name = draftName.trim()
    if (name === '') {
      setError('Name is required')
      return
    }
    try {
      createFarmer(getDatabase(), { name })
      setDraftName('')
      setError(null)
      refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleSave = (id: number) => {
    const name = editingName.trim()
    if (name === '') {
      setError('Name is required')
      return
    }
    try {
      updateFarmer(getDatabase(), id, { name })
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
    }
  }

  return (
    <div className="space-y-4 p-3 sm:p-4" data-page="farmers">
      <Text as="h1" role="header" className="text-lg font-semibold">
        {t({ my: 'လယ်သမားများ', en: 'Customers' })}
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
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder={t({ my: 'လယ်သမား အမည်', en: 'Farmer name' })}
            className="flex-1 rounded border border-border bg-background px-2 py-1.5"
          />
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
                  <th className="px-2 py-2 text-right">
                    <Text role="header">{t({ my: 'လုပ်ဆောင်ချက်', en: 'Action' })}</Text>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((f) => (
                  <tr key={f.id} className="border-b border-border last:border-b-0">
                    <td className="px-2 py-1">
                      {editingId === f.id ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full rounded border border-border bg-background px-2 py-1"
                        />
                      ) : (
                        <Text role="primary">{f.name}</Text>
                      )}
                    </td>
                    <td className="px-2 py-1 text-right">
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
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(f.id)
                              setEditingName(f.name)
                            }}
                            className={cn(
                              'rounded border border-border bg-surface px-2 py-0.5 text-xs',
                              'hover:bg-surface-hover',
                            )}
                          >
                            {t({ my: 'ပြင်ဆင်', en: 'Edit' })}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(f.id)}
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

export default FarmersPage
