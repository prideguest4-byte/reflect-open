-- Markdown-backed tasks: every GFM checkbox (`- [ ]` / `- [x]`) is projected
-- here so the Tasks view can query the graph without loading every note.
-- Markdown remains the source of truth; rows are rebuilt from parsed notes.

CREATE TABLE tasks (
  note_path TEXT NOT NULL REFERENCES notes(path)
    ON UPDATE CASCADE ON DELETE CASCADE,
  marker_offset INTEGER NOT NULL,
  text TEXT NOT NULL,
  raw TEXT NOT NULL,
  checked INTEGER NOT NULL,
  PRIMARY KEY (note_path, marker_offset)
);

CREATE INDEX tasks_note_path ON tasks(note_path);
CREATE INDEX tasks_checked_note_path ON tasks(checked, note_path);

-- Rows indexed before this migration have no task projection. Wipe the
-- rebuildable note rows so the next open re-indexes every file and fills tasks.
-- `index_meta`, `chat_*`, and embedding tables survive for their existing
-- projection/durable-state contracts.
DELETE FROM note_text;
DELETE FROM links;
DELETE FROM tags;
DELETE FROM aliases;
DELETE FROM assets;
DELETE FROM notes;
DELETE FROM search_fts;
