import { sql } from 'kysely'
import { readNote, writeNote } from '../graph/commands'
import { TaskStaleError, toggleTaskMarker } from '../markdown'
import { indexNote } from './indexer'
import { db } from './db'

/** The V1-compatible task group a row belongs to in the task list projection. */
export type TaskGroupKind = 'current' | 'overdue' | 'upcoming' | 'note'

/** One task row joined with its source note metadata for display and toggling. */
export interface TaskListEntry {
  notePath: string
  markerOffset: number
  text: string
  raw: string
  checked: boolean
  noteTitle: string
  dailyDate: string | null
  isPinned: boolean
}

/** A rendered task group: date buckets for daily notes, note buckets otherwise. */
export interface TaskListGroup {
  key: string
  kind: TaskGroupKind
  title: string
  notePath: string | null
  tasks: TaskListEntry[]
}

/** Guarded task toggle input from the desktop task list UI. */
export interface ToggleTaskOptions {
  notePath: string
  markerOffset: number
  raw: string
  graphGeneration: number
  indexGeneration: number
}

function taskDateGroup(dailyDate: string, today: string): Exclude<TaskGroupKind, 'note'> {
  if (dailyDate < today) {
    return 'overdue'
  }
  if (dailyDate > today) {
    return 'upcoming'
  }
  return 'current'
}

function makeGroup(kind: TaskGroupKind, note?: TaskListEntry): TaskListGroup {
  switch (kind) {
    case 'current':
      return { key: 'current', kind, title: 'Current', notePath: null, tasks: [] }
    case 'overdue':
      return { key: 'overdue', kind, title: 'Overdue', notePath: null, tasks: [] }
    case 'upcoming':
      return { key: 'upcoming', kind, title: 'Upcoming', notePath: null, tasks: [] }
    case 'note':
      if (!note) {
        throw new Error('note task group requires a task')
      }
      return {
        key: `note:${note.notePath}`,
        kind,
        title: note.noteTitle,
        notePath: note.notePath,
        tasks: [],
      }
  }
}

/**
 * Tasks in the V1 display order: daily-note tasks feed Current/Overdue/Upcoming,
 * then regular tasks stay grouped under their source note. Explicit scheduling
 * links are intentionally not interpreted in this first V2 pass.
 */
export async function listTaskGroups(today: string): Promise<TaskListGroup[]> {
  const rows = await db
    .selectFrom('tasks')
    .innerJoin('notes', 'notes.path', 'tasks.notePath')
    .select([
      'tasks.notePath',
      'tasks.markerOffset',
      'tasks.text',
      'tasks.raw',
      'tasks.checked',
      'notes.title as noteTitle',
      'notes.dailyDate',
      'notes.isPinned',
    ])
    .orderBy(
      sql`CASE
        WHEN notes.daily_date IS NOT NULL THEN 1
        WHEN notes.is_pinned = 1 THEN 2
        ELSE 3
      END`,
    )
    .orderBy('notes.dailyDate')
    .orderBy(sql`notes.pinned_order IS NULL`)
    .orderBy('notes.pinnedOrder')
    .orderBy('notes.id', 'desc')
    .orderBy('notes.titleKey')
    .orderBy('tasks.markerOffset')
    .execute()

  const groups = new Map<string, TaskListGroup>([['current', makeGroup('current')]])

  for (const row of rows) {
    const task: TaskListEntry = {
      notePath: row.notePath,
      markerOffset: row.markerOffset,
      text: row.text,
      raw: row.raw,
      checked: row.checked !== 0,
      noteTitle: row.noteTitle,
      dailyDate: row.dailyDate,
      isPinned: row.isPinned !== 0,
    }
    const kind = task.dailyDate === null ? 'note' : taskDateGroup(task.dailyDate, today)
    const key = kind === 'note' ? `note:${task.notePath}` : kind
    const group = groups.get(key) ?? makeGroup(kind, task)
    group.tasks.push(task)
    groups.set(key, group)
  }

  return [...groups.values()].sort((left, right) => {
    const rank = (group: TaskListGroup): number => {
      switch (group.kind) {
        case 'current':
          return 1
        case 'overdue':
          return 2
        case 'upcoming':
          return 3
        case 'note':
          return 4
      }
    }
    return rank(left) - rank(right)
  })
}

/**
 * Toggle one task marker in markdown, guarded by the indexed raw task slice.
 * A stale slice reindexes the note and rethrows so the caller can surface the
 * refusal instead of silently changing the wrong text.
 */
export async function toggleIndexedTask(options: ToggleTaskOptions): Promise<boolean> {
  const source = await readNote(options.notePath, options.graphGeneration)
  try {
    const toggled = toggleTaskMarker(source, options.markerOffset, options.raw)
    await writeNote(options.notePath, toggled.source, options.graphGeneration)
    await indexNote(options.notePath, {
      generation: options.indexGeneration,
      content: toggled.source,
      mtime: Date.now(),
    })
    return toggled.checked
  } catch (error) {
    if (error instanceof TaskStaleError) {
      await indexNote(options.notePath, {
        generation: options.indexGeneration,
        content: source,
        mtime: Date.now(),
      })
    }
    throw error
  }
}
