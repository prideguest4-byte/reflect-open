/**
 * Kysely table/view interfaces for the local SQLite projection (Plan 04). These
 * are the source of truth for TS DB types. Properties are camelCase; the
 * `CamelCasePlugin` maps them to the snake_case columns/tables in the Rust schema
 * (`apps/desktop/src-tauri/src/db.rs`). Booleans are stored as 0|1 (SQLite).
 */

/** One row per markdown file. `path` is the identity in the first wave. */
export interface NotesTable {
  path: string
  id: string | null
  title: string
  titleKey: string
  dailyDate: string | null
  isPrivate: number
  fileHash: string
  mtime: number
  updatedAt: number
}

export interface NoteTextTable {
  notePath: string
  text: string
}

/** Outgoing links. `kind` is `'wiki' | 'md'`; `targetKey` is normalized. */
export interface LinksTable {
  sourcePath: string
  kind: string
  targetRaw: string
  targetKey: string
  alias: string | null
  posFrom: number
  posTo: number
}

export interface TagsTable {
  notePath: string
  tag: string
}

export interface AliasesTable {
  notePath: string
  alias: string
  aliasKey: string
}

export interface AssetsTable {
  notePath: string
  assetPath: string
}

export interface IndexMetaTable {
  key: string
  value: string
}

/** Read-only view: incoming wiki links resolved by title/alias/date at query time. */
export interface BacklinksView {
  targetPath: string
  sourcePath: string
  kind: string
  targetRaw: string
  alias: string | null
  posFrom: number
  posTo: number
}

/** FTS5 virtual table over title + body (queried with `MATCH`). */
export interface SearchFtsTable {
  path: string
  title: string
  body: string
}

/** The full database shape consumed by `@reflect/core` getters via Kysely. */
export interface Database {
  notes: NotesTable
  noteText: NoteTextTable
  links: LinksTable
  tags: TagsTable
  aliases: AliasesTable
  assets: AssetsTable
  indexMeta: IndexMetaTable
  backlinks: BacklinksView
  searchFts: SearchFtsTable
}
