/**
 * Quit-time backup seam. The backup controller registers a flusher (a local
 * `git commit` of anything dirty — never a network push, which could stall
 * the quit) while a graph is connected; `quit-flush.ts` runs it after the
 * note buffers have landed so the final commit captures them. Errors are
 * swallowed: refusing to quit would trap the user, and anything uncommitted
 * is picked up by the next launch's sync cycle anyway.
 */

let flusher: (() => Promise<void>) | null = null

/** Install (or clear, with `null`) the active graph's quit-commit hook. */
export function setBackupFlusher(next: (() => Promise<void>) | null): void {
  flusher = next
}

/** Run the registered quit-commit, if any. Never throws, never blocks quit. */
export async function flushBackup(): Promise<void> {
  try {
    await flusher?.()
  } catch {
    // Surfaced on the next launch's sync instead.
  }
}
