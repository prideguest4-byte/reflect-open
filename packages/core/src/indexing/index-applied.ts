import type { FileChange } from './file-changes'

/**
 * The post-index "batch applied" signal (Plan 20 search/privacy closure).
 *
 * The live indexer ({@link subscribeIndexChanges}) emits here **after** a
 * watcher batch has been written to the index — so a subscriber that reads the
 * index sees the batch's note rows (privacy flags, `assets` projection) already
 * settled, never a stale snapshot. The asset-description controller drives its
 * privacy gate off this rather than the raw `index:changed` stream, closing the
 * race where the gate could run before a just-written private note was indexed.
 *
 * In-process only (no IPC): both the emitter and the subscriber live in the
 * frontend. The payload is the full batch — note changes *and* asset-file
 * changes — so the consumer filters for what it cares about.
 */

/** A listener for applied watcher batches; receives the full batch, post-index. */
export type IndexAppliedListener = (changes: readonly FileChange[]) => void

const listeners = new Set<IndexAppliedListener>()

/**
 * Subscribe to post-index batch-applied notifications. Returns an unsubscribe
 * function. Independent of `generation`: callers that pin to a graph session
 * compare it themselves (and tear down on graph switch).
 */
export function subscribeIndexApplied(listener: IndexAppliedListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Notify subscribers that `changes` have been applied to the index. */
export function emitIndexApplied(changes: readonly FileChange[]): void {
  for (const listener of [...listeners]) {
    listener(changes)
  }
}
