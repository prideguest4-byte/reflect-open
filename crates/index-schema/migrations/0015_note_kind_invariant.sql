-- Enforce the kind/daily_date invariant at the schema level: kind = 'daily'
-- iff daily_date is set. Both columns are derived from the path at index time
-- (`buildIndexedNote`), so every row written by the indexer agrees by
-- construction — but nothing made SQLite reject a drifted writer, and surfaces
-- filter on one column or the other interchangeably.
--
-- SQLite cannot ADD a table-level CHECK to an existing table, so this is the
-- documented table-rebuild recipe (lang_altertable.html#otheralter). Six child
-- tables reference notes(path) ON DELETE CASCADE; `migrate()` in lib.rs runs
-- the whole set with `PRAGMA foreign_keys` OFF so the DROP below cannot fire
-- their cascades, and this migration's foreign-key check re-verifies every
-- child reference against the rebuilt table before the transaction commits.

CREATE TABLE notes_new (
  path TEXT PRIMARY KEY NOT NULL,
  id TEXT,
  title TEXT NOT NULL,
  title_key TEXT NOT NULL,
  daily_date TEXT,
  is_private INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT NOT NULL,
  mtime INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  pinned_order REAL,
  preview TEXT NOT NULL DEFAULT '',
  has_conflict INTEGER NOT NULL DEFAULT 0,
  gist_url TEXT,
  gist_stale INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('daily', 'note', 'template')),
  CHECK ((kind = 'daily') = (daily_date IS NOT NULL))
);

-- Existing rows satisfy the invariant by construction; a violation here means
-- real corruption and must fail the migration loudly rather than be rewritten.
INSERT INTO notes_new (path, id, title, title_key, daily_date, is_private, file_hash,
                       mtime, updated_at, is_pinned, pinned_order, preview,
                       has_conflict, gist_url, gist_stale, kind)
  SELECT path, id, title, title_key, daily_date, is_private, file_hash,
         mtime, updated_at, is_pinned, pinned_order, preview,
         has_conflict, gist_url, gist_stale, kind
  FROM notes;

-- The views name `notes`; drop them so the rename below never has to re-parse
-- a statement that references the just-dropped table, then recreate them
-- verbatim from 0014.
DROP VIEW backlinks;
DROP VIEW note_keys;

DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;

-- Recreate every index the DROP took with it (0001, 0007, 0010, 0013).
CREATE INDEX notes_title_key ON notes(title_key);
CREATE INDEX notes_daily_date ON notes(daily_date);
CREATE INDEX notes_id ON notes(id) WHERE id IS NOT NULL;
CREATE INDEX notes_daily_date_mtime_path ON notes(daily_date, mtime DESC, path);
CREATE INDEX notes_non_daily_mtime ON notes(mtime DESC, path) WHERE daily_date IS NULL;
CREATE INDEX notes_pinned ON notes(is_pinned, pinned_order, title_key, path) WHERE is_pinned = 1;
CREATE INDEX notes_has_conflict ON notes(path) WHERE has_conflict = 1;

CREATE VIEW note_keys AS
  SELECT path AS note_path, title_key AS key FROM notes WHERE kind != 'template'
  UNION
  SELECT note_path, alias_key AS key FROM aliases
    JOIN notes ON notes.path = aliases.note_path AND notes.kind != 'template'
  UNION
  SELECT path AS note_path, daily_date AS key FROM notes WHERE daily_date IS NOT NULL;

CREATE VIEW backlinks AS
  SELECT k.note_path AS target_path, l.source_path, l.kind, l.target_raw, l.alias, l.pos_from, l.pos_to
  FROM links l JOIN note_keys k ON k.key = l.target_key
  JOIN notes source ON source.path = l.source_path AND source.kind != 'template'
  WHERE l.kind = 'wiki';
