import {
  editTaskLine,
  readNote,
  removeTaskLine,
  toggleTaskMarker,
  writeNote,
  type TaskMarker,
} from '@reflect/core'
import type { NoteSession } from '@/editor/note-session'
import { openSession } from '@/editor/open-documents'

/** The marker coordinates ({@link TaskMarker}) plus the note they live in. */
export interface TaskRef extends TaskMarker {
  notePath: string
}

/**
 * A task couldn't be toggled because its note is open with unsaved edits that
 * the session can't persist right now — it's read-only/protected, or a sync
 * conflict is parked. Distinct from `TaskStaleError` (a stale index): the
 * recovery is "save or resolve the note", not "reindex". We refuse rather than
 * write to disk, which would clobber the live buffer.
 */
export class NoteBusyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NoteBusyError'
  }
}

/**
 * Apply a Tasks-view change (toggle / edit / delete, Plan 18) and persist it,
 * routing the same way every time: when the note is **open**, through its live
 * session — which edits its in-memory buffer synchronously, so unsaved edits
 * survive and there's no read-then-write gap for a concurrent keystroke. The
 * session declines (and we refuse rather than clobber via disk) only when it
 * can't persist now (loading, protected/read-only, or a parked conflict),
 * surfaced as {@link NoteBusyError}. When the note is **not** open, disk is the
 * source of truth. A stale or ambiguous index surfaces as `TaskStaleError`
 * (from the core edit) rather than a silent wrong write.
 */
async function applyTaskChange(
  task: TaskRef,
  generation: number,
  viaSession: (owner: NoteSession, marker: TaskMarker) => Promise<boolean>,
  viaDisk: (source: string, marker: TaskMarker) => string,
): Promise<void> {
  // Pass only the marker coordinates onward — neither the session nor the disk
  // edit needs (or should depend on) the note path beyond locating the owner.
  const marker: TaskMarker = { markerOffset: task.markerOffset, raw: task.raw }
  const owner = openSession(task.notePath)
  if (owner !== null) {
    if (await viaSession(owner, marker)) {
      return
    }
    throw new NoteBusyError('This note can’t be updated right now — try again in a moment.')
  }
  const source = await readNote(task.notePath)
  await writeNote(task.notePath, viaDisk(source, marker), generation)
}

/**
 * Toggle a task's checkbox from the Tasks view (Plan 18). The open-tasks view
 * only ever flips `[ ]`→`[x]`, but the primitive toggles, hence the name; the
 * disk path is byte-exact (only the three marker characters change).
 */
export function toggleTask(task: TaskRef, generation: number): Promise<void> {
  return applyTaskChange(
    task,
    generation,
    (owner, marker) => owner.commitTaskToggle(marker),
    (source, marker) => toggleTaskMarker(source, marker).source,
  )
}

/**
 * Replace a task's text from the inline Tasks editor (Plan 18), preserving its
 * marker (and so its checked state). `content` is one line of markdown.
 */
export function editTask(task: TaskRef, content: string, generation: number): Promise<void> {
  return applyTaskChange(
    task,
    generation,
    (owner, marker) => owner.commitTaskEdit(marker, content),
    (source, marker) => editTaskLine(source, marker, content),
  )
}

/** Delete a task's whole line from the Tasks view (Plan 18) — the ⌫/⌘⌫ path. */
export function deleteTask(task: TaskRef, generation: number): Promise<void> {
  return applyTaskChange(
    task,
    generation,
    (owner, marker) => owner.commitTaskRemove(marker),
    (source, marker) => removeTaskLine(source, marker),
  )
}
