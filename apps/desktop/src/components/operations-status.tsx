import type { ReactElement } from 'react'
import { type Operation, useOperations } from '@/lib/operations'

/**
 * The global status surface (foundations hardening): a small, unobtrusive
 * stack for background operations that outlive their pane — the rename
 * rewrite is the first tenant; indexing/sync states can migrate here as
 * they're touched. Renders nothing when idle.
 */

function messageClassName(status: Operation['status']): string {
  if (status === 'failed') {
    return 'block text-red-600 dark:text-red-400'
  }
  return 'block text-amber-700 dark:text-amber-300'
}

export function OperationsStatus(): ReactElement | null {
  const operations = useOperations()
  if (operations.length === 0) {
    return null
  }
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {operations.map((operation) => (
        <div
          key={operation.id}
          role="status"
          className="rounded-md border border-black/10 bg-surface px-3 py-2 text-xs shadow-lg dark:border-white/10"
        >
          <span className="block font-medium">{operation.label}</span>
          {operation.progress !== null ? (
            <span className="block text-text-muted">
              {operation.progress.done}/{operation.progress.total}
            </span>
          ) : null}
          {operation.status !== 'running' ? (
            <span className={messageClassName(operation.status)}>{operation.message}</span>
          ) : null}
        </div>
      ))}
    </div>
  )
}
