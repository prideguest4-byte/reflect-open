-- First-class asset-description entity (Plan 20). One row per asset that has a
-- managed `assets/<x>.reflect.md` sidecar — a rebuildable projection of those
-- sidecars (the markdown stays the source of truth), keyed by the asset path.
--
-- The existing `assets(note_path, asset_path)` table is the note->asset
-- reference join; this is the asset side. The note FTS fold reads description
-- text from here (a DB join) instead of re-reading every sidecar file per note,
-- and it stores each description once rather than per referencing note.
CREATE TABLE asset_descriptions (
  asset_path   TEXT PRIMARY KEY NOT NULL,
  source_hash  TEXT NOT NULL,
  source_size  INTEGER NOT NULL,
  description  TEXT NOT NULL,
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
