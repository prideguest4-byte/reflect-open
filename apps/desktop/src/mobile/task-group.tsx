import { type ReactElement } from 'react'
import { AlarmClock, Calendar, FileText, Pin, Plus, Star } from 'lucide-react'
import type { OpenTask, TaskGroup } from '@reflect/core'
import { taskKey } from '@/lib/tasks/task-identity'
import { insertTargetForTask, todaysDailyTarget } from '@/lib/tasks/task-navigation'
import type { InsertTaskTarget } from '@/lib/tasks/task-insert-target'
import { cn } from '@/lib/utils'
import { MobileTaskRow } from '@/mobile/task-row'

interface MobileTaskGroupProps {
  group: TaskGroup
  /** Today's ISO date — the Current group's "+" adds to today's daily. */
  today: string
  /** Add a task to this group and open its quick-edit sheet. */
  onAdd: (target: InsertTaskTarget) => void
  /** Open the quick-edit sheet for a tapped row. */
  onEdit: (task: OpenTask) => void
  /** Open a note group's source note from its header. */
  onOpen: (notePath: string) => void
}

/**
 * Where this group's "+" adds a task (V1: Current → today's daily, a note →
 * that note), or `null` for the aggregate Overdue/Upcoming buckets, which span
 * many notes and so show no add button — the same rule as desktop's sections.
 */
function addTargetForGroup(group: TaskGroup, today: string): InsertTaskTarget | null {
  if (group.kind === 'current') {
    return todaysDailyTarget(today)
  }
  const first = group.tasks[0]
  return group.kind === 'note' && first !== undefined ? insertTargetForTask(first) : null
}

/** The icon + accent colour for a group's sticky header, V1's per-bucket styling. */
function headerStyle(group: TaskGroup): { icon: ReactElement; colorClass: string } {
  switch (group.kind) {
    case 'current':
      return { icon: <Star aria-hidden className="size-4" />, colorClass: 'text-amber-500' }
    case 'overdue':
      return { icon: <AlarmClock aria-hidden className="size-4" />, colorClass: 'text-red-500' }
    case 'upcoming':
      return { icon: <Calendar aria-hidden className="size-4" />, colorClass: 'text-green-600' }
    case 'note':
      return group.tasks[0]?.isPinned
        ? { icon: <Pin aria-hidden className="size-4" />, colorClass: 'text-accent' }
        : { icon: <FileText aria-hidden className="size-4" />, colorClass: 'text-text-secondary' }
  }
}

/**
 * One section of the mobile Tasks tab: a sticky, colour-coded header — a date
 * bucket (Current/Overdue/Upcoming) or a note — with a task count (V1 mobile
 * showed counts on its groups) over the rows. A note group's header opens the
 * note; Current and note groups grow a "+" that adds a task there and opens
 * its quick-edit sheet.
 */
export function MobileTaskGroup({
  group,
  today,
  onAdd,
  onEdit,
  onOpen,
}: MobileTaskGroupProps): ReactElement {
  const showSource = group.kind !== 'note'
  const { notePath } = group
  const { icon, colorClass } = headerStyle(group)
  const addTarget = addTargetForGroup(group, today)

  return (
    <section>
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-surface-sunken px-4 py-1.5">
        <h2 className={cn('flex min-w-0 items-center gap-2 text-sm font-medium', colorClass)}>
          {icon}
          {group.kind === 'note' && notePath !== null ? (
            <button type="button" onClick={() => onOpen(notePath)} className="truncate">
              {group.label}
            </button>
          ) : (
            <span className="truncate">{group.label}</span>
          )}
          <span className="text-xs font-normal text-text-muted">{group.tasks.length}</span>
        </h2>
        {addTarget !== null ? (
          <button
            type="button"
            aria-label={`Add a task to ${group.kind === 'current' ? 'today' : group.label}`}
            onClick={() => onAdd(addTarget)}
            className="-my-1 ml-auto flex size-8 flex-none items-center justify-center text-text-muted"
          >
            <Plus aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col">
        {group.tasks.map((task) => (
          <MobileTaskRow key={taskKey(task)} task={task} showSource={showSource} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  )
}
