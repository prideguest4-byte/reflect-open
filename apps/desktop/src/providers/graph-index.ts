import { openIndex, reconcileIndex } from '@reflect/core'

/**
 * The active graph's index lifecycle, factored out of `GraphProvider` so the
 * abort/await/open/reconcile dance is testable on its own and the provider is
 * left to own graph state and the open-ordering guards.
 *
 * Usage on a graph switch (the caller still gates on its own open token):
 *
 * ```ts
 * await index.stop()              // halt the previous graph's reconcile
 * const ready = await index.open() // open the new graph's index
 * if (stale) return
 * if (ready) index.reconcile()    // kick a background reconcile pass
 * ```
 */
export interface GraphIndex {
  /**
   * Abort the in-flight reconcile (if any) and wait for it to fully settle, so a
   * stale pass can't write into the next graph's index after the Rust connection
   * is swapped.
   */
  stop: () => Promise<void>
  /**
   * Open + migrate the index for the now-active graph. Best-effort: returns
   * `false` (and reports via `onError`) if the open fails, so a broken index
   * never blocks editing.
   */
  open: () => Promise<boolean>
  /**
   * Start a background reconcile pass for the active graph. Call only after a
   * successful {@link GraphIndex.open}; a later {@link GraphIndex.stop} aborts it.
   */
  reconcile: () => void
}

/** Stage of the index lifecycle that failed, for `onError` reporting. */
export type GraphIndexStage = 'open' | 'reconcile'

export interface GraphIndexOptions {
  /** Called when a stage fails. The lifecycle itself never throws. */
  onError?: (stage: GraphIndexStage, error: unknown) => void
}

/**
 * Create a {@link GraphIndex}. Holds the in-flight reconcile's `AbortController`
 * and settlement promise internally; the caller keeps one instance (e.g. in a
 * ref) across graph switches.
 */
export function createGraphIndex(options: GraphIndexOptions = {}): GraphIndex {
  const { onError } = options
  let abort: AbortController | null = null
  let done: Promise<void> = Promise.resolve()

  async function stop(): Promise<void> {
    abort?.abort()
    await done.catch(() => {})
  }

  async function open(): Promise<boolean> {
    try {
      await openIndex()
      return true
    } catch (error) {
      onError?.('open', error)
      return false
    }
  }

  function reconcile(): void {
    const controller = new AbortController()
    abort = controller
    done = reconcileIndex({ signal: controller.signal }).catch((error) => {
      onError?.('reconcile', error)
    })
  }

  return { stop, open, reconcile }
}
