import type { Database } from '@reflect/db'
import { sql, type Selectable } from 'kysely'
import { resolveWikiLinkAsync, type Resolution } from '../markdown'
import { db } from './db'
import { buildFtsMatch } from './search-query'

/**
 * Index read getters (Plan 04). Queries are built with Kysely and execute over
 * the IPC bridge (`@reflect/db`). Rows are our own projection — trusted, not
 * re-validated per row (see Plan 04 §2).
 */

export type Backlink = Pick<
  Selectable<Database['backlinks']>,
  'sourcePath' | 'targetRaw' | 'alias' | 'posFrom' | 'posTo'
>

/** Notes that link to `path` (resolved at query time via the `backlinks` view). */
export function getBacklinks(path: string): Promise<Backlink[]> {
  return db
    .selectFrom('backlinks')
    .where('targetPath', '=', path)
    .select(['sourcePath', 'targetRaw', 'alias', 'posFrom', 'posTo'])
    .orderBy('sourcePath')
    .execute()
}

/** Core fields of one note row: identity path, title, daily date, privacy flag. */
export interface NoteRow {
  path: string
  title: string
  dailyDate: string | null
  /**
   * The `private: true` frontmatter flag — a hard block on sending content to
   * external services. SQLite stores it as `0|1`; this getter maps it to a real
   * boolean at the read boundary so privacy checks can't be tripped up by a
   * truthy number.
   */
  isPrivate: boolean
}

/** Fetch a single note's row by graph-relative path, or `undefined` if absent. */
export async function getNote(path: string): Promise<NoteRow | undefined> {
  const row = await db
    .selectFrom('notes')
    .where('path', '=', path)
    .select(['path', 'title', 'dailyDate', 'isPrivate'])
    .executeTakeFirst()
  return row ? { ...row, isPrivate: row.isPrivate !== 0 } : undefined
}

/** Graph-relative paths of every note carrying `tag`, ordered by path. */
export async function getNotesByTag(tag: string): Promise<string[]> {
  const rows = await db
    .selectFrom('tags')
    .where('tag', '=', tag)
    .select('notePath')
    .orderBy('notePath')
    .execute()
  return rows.map((row) => row.notePath)
}

/** A full-text search result: the note's path and title. */
export type SearchHit = Pick<Selectable<Database['searchFts']>, 'path' | 'title'>

/** Full-text search over title + body (FTS5 `MATCH`, ranked). */
export async function searchNotes(query: string, limit = 50): Promise<SearchHit[]> {
  const match = buildFtsMatch(query)
  if (match === null) {
    return [] // nothing to search (FTS5 also errors on an empty MATCH).
  }
  return db
    .selectFrom('searchFts')
    .select(['path', 'title'])
    .where(sql<boolean>`search_fts MATCH ${match}`)
    .orderBy(sql`rank`)
    .limit(limit)
    .execute()
}

/**
 * Stored `path → fileHash` map, for content-hash reconciliation on open. Loads
 * every note's hash into memory — fine at first-wave graph sizes; revisit with a
 * streamed/keyset scan if graphs grow large (tracked with the Plan 04b watcher).
 */
export async function getIndexedHashes(): Promise<Map<string, string>> {
  const rows = await db.selectFrom('notes').select(['path', 'fileHash']).execute()
  return new Map(rows.map((row) => [row.path, row.fileHash]))
}

/**
 * Resolve a `[[target]]` against the index, returning the note ref (its path).
 * The resolution *policy* (prefer daily-date, then title, then alias) lives once
 * in {@link resolveWikiLinkAsync}; this is only the DB-backed data access.
 *
 * Each lookup `orderBy`s before taking the first row so a title/alias/date
 * collision resolves to the same note every time (otherwise the row order is
 * undefined).
 */
export function resolveWikiTarget(target: string): Promise<Resolution> {
  return resolveWikiLinkAsync(target, {
    byDate: async (date) =>
      (
        await db
          .selectFrom('notes')
          .where('dailyDate', '=', date)
          .select('path')
          .orderBy('path')
          .executeTakeFirst()
      )?.path,
    byTitle: async (key) =>
      (
        await db
          .selectFrom('notes')
          .where('titleKey', '=', key)
          .select('path')
          .orderBy('path')
          .executeTakeFirst()
      )?.path,
    byAlias: async (key) =>
      (
        await db
          .selectFrom('aliases')
          .where('aliasKey', '=', key)
          .select('notePath')
          .orderBy('notePath')
          .executeTakeFirst()
      )?.notePath,
  })
}
