import { useCallback, useSyncExternalStore } from 'react'
import type { NoteRow } from '@reflect/core'

/**
 * The optimistic read overlay for note index rows (Plan 12 follow-up).
 *
 * The index lags an in-app frontmatter write by one watcher round-trip, so a
 * just-published note would briefly read as unpublished. Rather than each
 * surface (the gist action, the published-URL section, …) carrying its own
 * pending-state "bridge" — three near-duplicates, one of them with a
 * precedence bug — the optimism lives **once, in the read model**: an action
 * records what it just wrote, {@link useNoteRow} merges it over the index row,
 * and it retires the moment the index agrees. Every reader of `useNoteRow`
 * sees a single consistent value, so there is no second value to disagree.
 *
 * Module-level state, keyed by graph-relative path. Deliberately narrow — only
 * the projections an action flips and then waits to observe. Cleared on graph
 * switch ({@link resetNoteRowOverlays}) so an overlay can never bleed across
 * graphs that share a note path.
 */

/**
 * Index-row fields an action may assert ahead of the re-index. `gistUrl` is the
 * only one today (publishing always yields a concrete URL — never `null`, so a
 * publish can't be optimistically "unpublished"). `gistStale` is intentionally
 * absent: a body edited right after publishing keeps it `true`, which would
 * pin the overlay open forever and mute the republish nudge.
 */
export interface NoteRowOverlay {
  readonly gistUrl?: string
}

const overlays = new Map<string, NoteRowOverlay>()
const listeners = new Set<() => void>()

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Record an optimistic patch for `path`, reflected by every `useNoteRow(path)`
 * reader until the index row catches up. Merges with any existing patch.
 */
export function setNoteRowOverlay(path: string, patch: NoteRowOverlay): void {
  overlays.set(path, { ...overlays.get(path), ...patch })
  emit()
}

/**
 * Drop overlay fields the freshly-read index `row` has caught up to (and the
 * whole entry once nothing is left). Called from {@link useNoteRow} in an
 * effect, never during render. A `null` row (note not indexed yet) has nothing
 * to reconcile against, so the overlay is held.
 */
export function reconcileNoteRowOverlay(path: string, row: NoteRow | null): void {
  const overlay = overlays.get(path)
  if (overlay === undefined || row === null) {
    return
  }
  const remaining: { -readonly [Key in keyof NoteRowOverlay]: NoteRowOverlay[Key] } = {}
  let retired = false
  for (const key of Object.keys(overlay) as (keyof NoteRowOverlay)[]) {
    if (row[key] === overlay[key]) {
      retired = true
    } else {
      remaining[key] = overlay[key]
    }
  }
  if (!retired) {
    return
  }
  if (Object.keys(remaining).length === 0) {
    overlays.delete(path)
  } else {
    overlays.set(path, remaining)
  }
  emit()
}

/** Drop every overlay — the active graph changed, so prior optimism is moot. */
export function resetNoteRowOverlays(): void {
  if (overlays.size === 0) {
    return
  }
  overlays.clear()
  emit()
}

/**
 * Merge an overlay over an index row. The overlay only sharpens an existing
 * row; with no row there is nothing to display yet (a publish targets an
 * already-indexed note), so `null` passes through.
 */
export function applyNoteRowOverlay(row: NoteRow | null, overlay: NoteRowOverlay | null): NoteRow | null {
  if (row === null || overlay === null) {
    return row
  }
  return { ...row, ...overlay }
}

/** Subscribe a component to `path`'s overlay; `null` when none is pending. */
export function useNoteRowOverlay(path: string): NoteRowOverlay | null {
  const getSnapshot = useCallback(() => overlays.get(path) ?? null, [path])
  return useSyncExternalStore(subscribe, getSnapshot)
}
