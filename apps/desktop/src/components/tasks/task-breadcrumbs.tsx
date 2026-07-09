import { type ReactElement } from 'react'
import { ChevronRight } from 'lucide-react'
import { taskBreadcrumbsForDisplay } from '@reflect/core'
import { cn } from '@/lib/utils'

interface TaskBreadcrumbsProps {
  breadcrumbs: readonly string[]
  /** Desktop selects the context; mobile renders the same context as read-only. */
  onSelect?: () => void
  className?: string
}

/** A task context's quiet ancestor-list path, hidden for generic Tasks/TODO labels. */
export function TaskBreadcrumbs({
  breadcrumbs,
  onSelect,
  className,
}: TaskBreadcrumbsProps): ReactElement | null {
  const labels = taskBreadcrumbsForDisplay(breadcrumbs)
  if (labels.length === 0) {
    return null
  }

  const label = labels.join(' → ')
  const content = labels.map((breadcrumb, index) => (
    <span key={`${index}:${breadcrumb}`} className="contents">
      {index > 0 ? <ChevronRight aria-hidden className="size-3 shrink-0" /> : null}
      <span className="truncate">{breadcrumb}</span>
    </span>
  ))

  return (
    <li className={cn('min-w-0 text-xs text-text-muted', className)}>
      {onSelect === undefined ? (
        <div
          role="group"
          aria-label={`Task context: ${label}`}
          className="flex min-w-0 items-center gap-0.5"
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          aria-label={`Select tasks in ${label}`}
          onClick={onSelect}
          className="flex min-w-0 max-w-full items-center gap-0.5 text-left hover:text-text focus-visible:text-text focus-visible:outline-none"
        >
          {content}
        </button>
      )}
    </li>
  )
}
