import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { listTaskGroups } from './tasks'

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

beforeEach(() => {
  mockInvoke.mockReset()
  setBridge({ invoke: mockInvoke, listen: async () => () => {} })
})

afterEach(() => {
  setBridge(null)
})

describe('listTaskGroups', () => {
  it('groups daily tasks by V1 date buckets and regular tasks by source note', async () => {
    mockInvoke.mockResolvedValue([
      {
        note_path: 'daily/2026-06-14.md',
        marker_offset: 2,
        text: 'yesterday',
        raw: '[ ] yesterday',
        checked: 0,
        note_title: '2026-06-14',
        daily_date: '2026-06-14',
        is_pinned: 0,
      },
      {
        note_path: 'daily/2026-06-15.md',
        marker_offset: 2,
        text: 'today',
        raw: '[ ] today',
        checked: 0,
        note_title: '2026-06-15',
        daily_date: '2026-06-15',
        is_pinned: 0,
      },
      {
        note_path: 'daily/2026-06-16.md',
        marker_offset: 2,
        text: 'tomorrow',
        raw: '[ ] tomorrow',
        checked: 0,
        note_title: '2026-06-16',
        daily_date: '2026-06-16',
        is_pinned: 0,
      },
      {
        note_path: 'notes/project.md',
        marker_offset: 2,
        text: 'project',
        raw: '[x] project',
        checked: 1,
        note_title: 'Project',
        daily_date: null,
        is_pinned: 1,
      },
    ])

    const groups = await listTaskGroups('2026-06-15')

    expect(groups.map((group) => [group.kind, group.title, group.tasks.map((task) => task.text)])).toEqual([
      ['current', 'Current', ['today']],
      ['overdue', 'Overdue', ['yesterday']],
      ['upcoming', 'Upcoming', ['tomorrow']],
      ['note', 'Project', ['project']],
    ])
    expect(groups[3].tasks[0].checked).toBe(true)
  })

  it('keeps an empty Current group so users can always add to today later', async () => {
    mockInvoke.mockResolvedValue([])
    await expect(listTaskGroups('2026-06-15')).resolves.toEqual([
      { key: 'current', kind: 'current', title: 'Current', notePath: null, tasks: [] },
    ])
  })

  it('orders the query by V1 source-note priority before marker offset', async () => {
    mockInvoke.mockResolvedValue([])

    await listTaskGroups('2026-06-15')

    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('db_query')
    const sql = String(args.sql)
    expect(sql).toContain('inner join "notes"')
    expect(sql).toContain('notes.daily_date IS NOT NULL')
    expect(sql).toContain('notes.is_pinned = 1')
    expect(sql).toContain('"notes"."daily_date"')
    expect(sql).toContain('notes.pinned_order IS NULL')
    expect(sql).toContain('"tasks"."marker_offset"')
  })
})
