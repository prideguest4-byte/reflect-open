import type { ReactElement } from 'react'
import { CheckSquare2, Square, Star, ArrowRight } from 'lucide-react'
import type { TaskListEntry } from '@reflect/core'
import { cn } from '@/lib/utils'

interface TaskRowProps {
  task: TaskListEntry
  showSource: boolean
  disabled?: boolean
  onOpen: (path: string) => void
  onToggle: (task: TaskListEntry) => void
}

export function TaskRow({
  task,
  showSource,
  disabled = false,
  onOpen,
  onToggle,
}: TaskRowProps): ReactElement {
  return (
    <div
      className={cn(
        'group flex min-h-10 items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm',
        'transition-colors hover:bg-surface-hover',
      )}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={task.checked}
        aria-label={task.checked ? 'Mark task incomplete' : 'Mark task complete'}
        disabled={disabled}
        onClick={(event) => {
          event.stopPropagation()
          onToggle(task)
        }}
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted hover:text-text disabled:opacity-50"
      >
        {task.checked ? (
          <CheckSquare2 aria-hidden className="size-4 text-accent" strokeWidth={1.9} />
        ) : (
          <Square aria-hidden className="size-4" strokeWidth={1.9} />
        )}
      </button>

      <button
        type="button"
        onClick={() => onOpen(task.notePath)}
        className="min-w-0 flex-1 text-left"
      >
        <span className={cn('block truncate text-text', task.checked && 'text-muted line-through')}>
          {task.text || 'Untitled task'}
        </span>
      </button>

      {showSource ? (
        <button
          type="button"
          onClick={() => onOpen(task.notePath)}
          className="hidden min-w-0 max-w-44 shrink items-center gap-1 text-xs text-muted hover:text-text sm:flex"
          title={task.noteTitle}
        >
          {task.isPinned ? <Star aria-hidden className="size-3" /> : null}
          <span className="truncate">{task.noteTitle}</span>
        </button>
      ) : null}

      <button
        type="button"
        aria-label={`Open ${task.noteTitle}`}
        onClick={() => onOpen(task.notePath)}
        className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted opacity-0 transition-opacity hover:text-text group-hover:opacity-100 group-focus-within:opacity-100"
      >
        <ArrowRight aria-hidden className="size-4" />
      </button>
    </div>
  )
}
