import { sql } from 'kysely'
import { db } from './db'
import { previewSnippet } from './snippet'

/**
 * The All Notes list: every non-daily note, newest first, optionally narrowed
 * to one tag. Daily notes are excluded by design — the stream is their home —
 * which mirrors the original app's notes list (`isDaily = 0` there,
 * `daily_date IS NULL` here).
 */

/** One row of the All Notes list. */
export interface NoteListEntry {
  path: string
  title: string
  /** First body line after the title, trimmed for the row (may be empty). */
  snippet: string
  /** The note's body tags (first-seen casing), alphabetical. */
  tags: string[]
  /** File modification time (epoch ms) — the list's recency sort key. */
  mtime: number
}

export interface NoteListOptions {
  /** Only notes carrying this tag (case-insensitive). `null` lists all. */
  tag?: string | null
  limit?: number
}

const DEFAULT_LIMIT = 500
// Enough of the plain text to find the first body line under any sane title,
// without shipping whole notes over IPC for every row.
const SNIPPET_SOURCE_CHARS = 600

/** Non-daily notes for the All Notes screen, most recently edited first. */
export async function listNotes(options: NoteListOptions = {}): Promise<NoteListEntry[]> {
  const tag = options.tag ?? null
  const limit = options.limit ?? DEFAULT_LIMIT

  let query = db
    .selectFrom('notes')
    .leftJoin('noteText', 'noteText.notePath', 'notes.path')
    .where('notes.dailyDate', 'is', null)
    .select([
      'notes.path',
      'notes.title',
      'notes.mtime',
      sql<string | null>`substr(note_text.text, 1, ${SNIPPET_SOURCE_CHARS})`.as('textHead'),
    ])
    .orderBy('notes.mtime', 'desc')
    .orderBy('notes.path')
    .limit(limit)

  if (tag !== null) {
    query = query.where(({ exists, selectFrom }) =>
      exists(
        selectFrom('tags')
          .select(sql<number>`1`.as('one'))
          .whereRef('tags.notePath', '=', 'notes.path')
          .where(sql<string>`lower(tags.tag)`, '=', tag.toLowerCase()),
      ),
    )
  }

  const rows = await query.execute()
  if (rows.length === 0) {
    return []
  }

  const tagRows = await db
    .selectFrom('tags')
    .where(
      'notePath',
      'in',
      rows.map((row) => row.path),
    )
    .select(['notePath', 'tag'])
    .orderBy('tag')
    .execute()
  const tagsByPath = new Map<string, string[]>()
  for (const row of tagRows) {
    const tags = tagsByPath.get(row.notePath)
    if (tags === undefined) {
      tagsByPath.set(row.notePath, [row.tag])
    } else {
      tags.push(row.tag)
    }
  }

  return rows.map((row) => ({
    path: row.path,
    title: row.title,
    mtime: row.mtime,
    snippet: previewSnippet(row.textHead ?? '', row.title),
    tags: tagsByPath.get(row.path) ?? [],
  }))
}

/** One tag facet over the note list: display casing + non-daily note count. */
export interface NoteTagFacet {
  tag: string
  count: number
}

/**
 * Every tag carried by at least one non-daily note, with how many such notes
 * carry it, alphabetical. Case-insensitive collation matches the tag filter
 * (and the `#tag` search token): `#Book` and `#book` are one facet, displayed
 * with one deterministic casing.
 */
export async function listNoteTags(): Promise<NoteTagFacet[]> {
  return db
    .selectFrom('tags')
    .innerJoin('notes', 'notes.path', 'tags.notePath')
    .where('notes.dailyDate', 'is', null)
    .select([sql<string>`min(tags.tag)`.as('tag'), sql<number>`count(*)`.as('count')])
    .groupBy(sql`lower(tags.tag)`)
    .orderBy(sql`lower(tags.tag)`)
    .execute()
}
