import { describe, expect, it } from 'vitest'
import type { OpenTask } from '@reflect/core'
import { groupTaskContexts, visibleTaskBreadcrumbs } from './task-breadcrumbs'

function task(markerOffset: number, breadcrumbs: readonly string[]): OpenTask {
  return {
    notePath: 'notes/project.md',
    markerOffset,
    raw: `[ ] task ${markerOffset}`,
    checked: false,
    text: `task ${markerOffset}`,
    breadcrumbs,
    noteTitle: 'Project',
    dueDate: null,
    dailyDate: null,
    isPinned: false,
    pinnedOrder: null,
    updatedAt: 0,
  }
}

describe('visibleTaskBreadcrumbs', () => {
  it('trims empty breadcrumb entries', () => {
    expect(visibleTaskBreadcrumbs(['', ' Project ', '  '])).toEqual(['Project'])
  })

  it('hides common single task headings', () => {
    for (const heading of ['Task', 'Tasks:', 'todo', 'TODOs', 'To Do', "To Do's: "]) {
      expect(visibleTaskBreadcrumbs([heading])).toEqual([])
    }
  })

  it('keeps multi-part breadcrumbs even when one part is common', () => {
    expect(visibleTaskBreadcrumbs(['Tasks', 'Project'])).toEqual(['Tasks', 'Project'])
  })
})

describe('groupTaskContexts', () => {
  it('groups only consecutive tasks with the same breadcrumbs', () => {
    const tasks = [
      task(1, ['Project', 'Phase one']),
      task(2, ['Project', 'Phase one']),
      task(3, ['Project', 'Phase two']),
      task(4, ['Project', 'Phase one']),
    ]

    const contexts = groupTaskContexts(tasks)
    expect(contexts.map((context) => context.tasks.map((entry) => entry.markerOffset))).toEqual([
      [1, 2],
      [3],
      [4],
    ])
    expect(contexts.map((context) => context.breadcrumbs)).toEqual([
      ['Project', 'Phase one'],
      ['Project', 'Phase two'],
      ['Project', 'Phase one'],
    ])
  })

  it('returns no contexts for no tasks', () => {
    expect(groupTaskContexts([])).toEqual([])
  })
})
