import type { OpenTask } from '@reflect/core'

/**
 * An open-task row with sensible defaults for tests; override only what a
 * case needs. The row renders `raw`, so it tracks `text` (the marker line)
 * unless a case pins `raw` explicitly.
 */
export function makeOpenTask(overrides: Partial<OpenTask> = {}): OpenTask {
  const text = overrides.text ?? 'do it'
  return {
    notePath: 'notes/n.md',
    markerOffset: 2,
    raw: `[ ] ${text}`,
    checked: false,
    text,
    breadcrumbs: [],
    noteTitle: 'N',
    dueDate: null,
    dailyDate: null,
    isPinned: false,
    pinnedOrder: null,
    updatedAt: 0,
    ...overrides,
  }
}
