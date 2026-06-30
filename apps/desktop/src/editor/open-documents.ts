import type { NoteSession } from './note-session'

/**
 * The open note documents, as one app-global service (foundations hardening,
 * post-Plan-07). This consolidates what used to be two parallel registries —
 * a quit-flush list and a path→session lookup — because they were both views
 * of the same fact: *these documents are open right now*.
 *
 * Consumers:
 * - **Quit teardown** ({@link flushOpenDocuments}): every buffer flushes, and
 *   each document's settle-time work (pending title renames) fires and is
 *   awaited — the webview must not die before the writes land. React unmount
 *   effects never run on the quit paths, which is why this lives outside React.
 * - **Work that outlives a pane** ({@link openSession}): the rename
 *   coordinator's alias placement discovers whether its note is open (possibly
 *   *reopened* in a new pane) and routes through the live session's frontmatter
 *   channel instead of racing the disk under a dirty buffer.
 */

export interface OpenDocument {
  session: NoteSession
  /** Fire pending settle-time work (title renames) now. */
  settle?: () => void
  /** Resolves once fired settle-time work has landed. */
  settled?: () => Promise<void>
}

const documents = new Map<string, OpenDocument>()
const listeners = new Map<string, Set<() => void>>()

function emitOpenDocumentChanged(path: string): void {
  listeners.get(path)?.forEach((listener) => listener())
}

/**
 * Register an open document (keyed by its session's path); returns the
 * unregister. Unregistration is by **identity**, not key — a rename can
 * re-key the entry ({@link retargetOpenDocument}) between registration and
 * teardown, and the unregister must still find it.
 */
export function registerOpenDocument(document: OpenDocument): () => void {
  documents.set(document.session.path, document)
  emitOpenDocumentChanged(document.session.path)
  return () => {
    for (const [key, registered] of documents) {
      if (registered === document) {
        documents.delete(key)
        emitOpenDocumentChanged(key)
        return
      }
    }
  }
}

/** The live session for `path`, if that note is open in some pane. */
export function openSession(path: string): NoteSession | null {
  return documents.get(path)?.session ?? null
}

/**
 * Subscribe to the open-session presence or live-content snapshot for `path`.
 * Consumers still read through {@link openSession}; this only provides the
 * invalidation signal when an editor changes, loads, closes, or retargets.
 */
export function subscribeOpenDocumentChanges(path: string, listener: () => void): () => void {
  const existing = listeners.get(path)
  const scoped = existing ?? new Set<() => void>()
  scoped.add(listener)
  if (existing === undefined) {
    listeners.set(path, scoped)
  }
  return () => {
    scoped.delete(listener)
    if (scoped.size === 0) {
      listeners.delete(path)
    }
  }
}

/** Notify subscribers that `path`'s open-session snapshot may have changed. */
export function notifyOpenDocumentChanged(path: string): void {
  emitOpenDocumentChanged(path)
}

/**
 * Re-key an open document after its note file moved (Plan 17), so
 * {@link openSession} lookups under the new path find the live session. The
 * entry moves only when it actually holds `session` — a failed move's
 * compensating re-key must never grab a *different* pane's document that
 * legitimately sits at `from` (then quit-time flush and `openSession` would
 * target the wrong path). The old registration's unregister closure stays
 * correct either way (it checks identity, not keys), and the adopting pane
 * re-registers under the new path.
 */
export function retargetOpenDocument(from: string, to: string, session: NoteSession): void {
  const document = documents.get(from)
  if (document !== undefined && document.session === session) {
    documents.delete(from)
    documents.set(to, document)
    emitOpenDocumentChanged(from)
    emitOpenDocumentChanged(to)
  }
}

/**
 * Flush every open buffer, fire each document's pending settle-time work, and
 * settle once all of it has landed. Failures are surfaced per-document by the
 * save pipeline already; teardown must proceed past them, so rejections are
 * absorbed, never re-thrown.
 */
export async function flushOpenDocuments(): Promise<void> {
  await Promise.allSettled(
    [...documents.values()].map(async (document) => {
      await document.session.flush()
      // Settle after the flush so the rename tracker has seen the final title;
      // settle() appends the rewrite synchronously, settled() awaits it.
      document.settle?.()
      await document.settled?.()
    }),
  )
}
