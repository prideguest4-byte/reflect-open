import type { ReactElement } from 'react'
import { AlarmClock, Calendar, Star } from 'lucide-react'
import type { TaskListEntry, TaskListGroup } from '@reflect/core'
import { cn } from '@/lib/utils'
import { TaskRow } from './task-row'

interface TaskGroupSectionProps {
  group: TaskListGroup
  pendingKey: string | null
  onOpen: (path: string) => void
  onToggle: (task: TaskListEntry) => void
}

function groupIcon(group: TaskListGroup): ReactElement | null {
  switch (group.kind) {
    case 'current':
      return <Star aria-hidden className="size-4" />
    case 'overdue':
      return <AlarmClock aria-hidden className="size-4" />
    case 'upcoming':
      return <Calendar aria-hidden className="size-4" />
    case 'note':
      return null
  }
}

function taskKey(task: TaskListEntry): string {
  return `${task.notePath}:${task.markerOffset}`
}

export function TaskGroupSection({
  group,
  pendingKey,
  onOpen,
  onToggle,
}: TaskGroupSectionProps): ReactElement {
  const showSource = group.kind !== 'note'
  return (
    <section className="px-4 pb-6 lg:px-12">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 py-3 backdrop-blur">
        <button
          type="button"
          disabled={group.notePath === null}
          onClick={() => {
            if (group.notePath !== null) {
              onOpen(group.notePath)
            }
          }}
          className={cn(
            'flex min-w-0 items-center gap-2 text-sm font-semibold',
            group.kind === 'current' && 'text-amber-600 dark:text-amber-400',
            group.kind === 'overdue' && 'text-rose-600 dark:text-rose-400',
            group.kind === 'upcoming' && 'text-emerald-600 dark:text-emerald-400',
            group.kind === 'note' && 'text-muted hover:text-text disabled:hover:text-muted',
          )}
        >
          {groupIcon(group)}
          <span className="truncate">{group.title}</span>
        </button>
      </header>

      <div className="mt-3 space-y-2">
        {group.tasks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
            No tasks
          </div>
        ) : (
          group.tasks.map((task) => (
            <TaskRow
              key={taskKey(task)}
              task={task}
              showSource={showSource}
              disabled={pendingKey === taskKey(task)}
              onOpen={onOpen}
              onToggle={onToggle}
            />
          ))
        )}
      </div>
    </section>
  )
}
