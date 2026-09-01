/**
 * Accessible confirmation dialog — reference-project UI concept
 * (`~/paddyprice/src/components/ConfirmDialog.tsx`): modal overlay, title +
 * message, Cancel / Confirm buttons, Escape to cancel, confirm autofocused.
 * Generic shared UI only — no business logic.
 */
import { useEffect, useRef } from 'react'

import { cn } from './cn'
import { Text } from './Text'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Renders the confirm button in the danger (destructive) style. */
  danger?: boolean
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element | null {
  const confirmRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-lg">
        <Text as="h2" role="header" className="text-base font-semibold text-content-primary">
          {title}
        </Text>
        <Text role="secondary" className="mt-2 block text-sm">
          {message}
        </Text>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            {cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              danger
                ? 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20'
                : 'bg-accent text-accent-text hover:bg-accent-hover',
            )}
          >
            {confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  )
}