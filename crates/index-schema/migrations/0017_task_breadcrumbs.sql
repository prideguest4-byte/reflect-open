-- Task breadcrumbs are the ordered rendered text of a task's ancestor list
-- items. They are always read and replaced with the task projection as one
-- value, so an encoded array keeps the tasks table's one-row-per-task shape.
-- The matching projection-version bump rebuilds unchanged notes after this
-- migration; the default keeps the interim migrated index valid.
ALTER TABLE tasks ADD COLUMN breadcrumbs_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(breadcrumbs_json) AND json_type(breadcrumbs_json) = 'array');
