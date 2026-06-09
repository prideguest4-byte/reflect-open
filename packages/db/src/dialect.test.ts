import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

import { invoke } from '@tauri-apps/api/core'
import { createDb } from './db'

const mockInvoke = vi.mocked(invoke)

beforeEach(() => {
  mockInvoke.mockReset()
})

describe('IpcDialect (Kysely → db_query bridge)', () => {
  it('compiles to snake_case SQL and ships it over db_query with params', async () => {
    mockInvoke.mockResolvedValue([])
    const db = createDb()
    await db
      .selectFrom('notes')
      .select(['path', 'fileHash'])
      .where('titleKey', '=', 'project x')
      .execute()

    expect(mockInvoke).toHaveBeenCalledTimes(1)
    const [command, args] = mockInvoke.mock.calls[0]
    expect(command).toBe('db_query')
    const { sql, params } = args as { sql: string; params: unknown[] }
    expect(sql).toContain('"file_hash"')
    expect(sql).toContain('"title_key"')
    expect(params).toEqual(['project x'])
  })

  it('maps snake_case result columns back to camelCase', async () => {
    mockInvoke.mockResolvedValue([{ path: 'notes/a.md', file_hash: 'abc' }])
    const db = createDb()
    const rows = await db.selectFrom('notes').select(['path', 'fileHash']).execute()
    expect(rows).toEqual([{ path: 'notes/a.md', fileHash: 'abc' }])
  })

  it('fails fast when the backend returns a non-array payload', async () => {
    mockInvoke.mockResolvedValue({ not: 'an array' } as unknown)
    const db = createDb()
    await expect(db.selectFrom('notes').selectAll().execute()).rejects.toThrow(/row array/)
  })

  it('rejects transactions — writes go through the index_* commands', async () => {
    mockInvoke.mockResolvedValue([])
    const db = createDb()
    await expect(db.transaction().execute(async () => undefined)).rejects.toThrow(
      /transactions run in Rust/,
    )
  })
})
