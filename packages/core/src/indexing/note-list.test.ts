import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { listNotes, listNoteTags } from './note-list'

// A fake bridge resolves `db_query` so the tests exercise the real compiled
// SQL (snake_case columns, parameters) — the same harness queries.test uses.
const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

beforeEach(() => {
  mockInvoke.mockReset()
  setBridge({ invoke: mockInvoke, listen: async () => () => {} })
})

afterEach(() => {
  setBridge(null)
})

describe('listNotes', () => {
  it('lists non-daily notes newest first with snippets and grouped tags', async () => {
    mockInvoke
      .mockResolvedValueOnce([
        {
          path: 'notes/health.md',
          title: 'Health Stacked',
          mtime: 2000,
          text_head: 'Health Stacked\nShop your health goals.\n',
        },
        {
          path: 'notes/tokyo.md',
          title: 'Tokyo Gâteau',
          mtime: 1000,
          text_head: null,
        },
      ])
      .mockResolvedValueOnce([
        { note_path: 'notes/health.md', tag: 'health' },
        { note_path: 'notes/health.md', tag: 'link' },
      ])

    const entries = await listNotes()

    expect(entries).toEqual([
      {
        path: 'notes/health.md',
        title: 'Health Stacked',
        mtime: 2000,
        snippet: 'Shop your health goals.',
        tags: ['health', 'link'],
      },
      {
        path: 'notes/tokyo.md',
        title: 'Tokyo Gâteau',
        mtime: 1000,
        snippet: '',
        tags: [],
      },
    ])

    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('db_query')
    const sql = String(args.sql)
    expect(sql).toContain('"daily_date" is null')
    expect(sql).toContain('order by "notes"."mtime" desc')
    expect(sql).not.toContain('exists')

    const [, tagArgs] = mockInvoke.mock.calls[1]
    expect(String(tagArgs.sql)).toContain('"note_path" in')
    expect(tagArgs.params).toEqual(['notes/health.md', 'notes/tokyo.md'])
  })

  it('narrows to one tag case-insensitively via an EXISTS subquery', async () => {
    mockInvoke.mockResolvedValue([])

    await listNotes({ tag: 'Book' })

    const [, args] = mockInvoke.mock.calls[0]
    const sql = String(args.sql)
    expect(sql).toContain('exists')
    expect(sql).toContain('lower(tags.tag)')
    expect(args.params).toEqual(expect.arrayContaining(['book']))
  })

  it('skips the tag fetch entirely when no notes match', async () => {
    mockInvoke.mockResolvedValue([])
    await expect(listNotes({ tag: 'nothing' })).resolves.toEqual([])
    expect(mockInvoke).toHaveBeenCalledTimes(1)
  })
})

describe('listNoteTags', () => {
  it('groups tags case-insensitively over non-daily notes', async () => {
    mockInvoke.mockResolvedValue([
      { tag: 'Book', count: 3 },
      { tag: 'link', count: 12 },
    ])

    const facets = await listNoteTags()

    expect(facets).toEqual([
      { tag: 'Book', count: 3 },
      { tag: 'link', count: 12 },
    ])
    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('db_query')
    const sql = String(args.sql)
    expect(sql).toContain('"daily_date" is null')
    expect(sql).toContain('group by lower(tags.tag)')
  })
})
