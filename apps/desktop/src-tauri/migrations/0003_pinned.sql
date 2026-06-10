-- Pinned notes: the `pinned: true` frontmatter flag, projected so the
-- sidebar's Pinned section and the `is:pinned` filter query it without
-- re-reading files. Markdown stays the source of truth; this is rebuildable.

ALTER TABLE notes ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
