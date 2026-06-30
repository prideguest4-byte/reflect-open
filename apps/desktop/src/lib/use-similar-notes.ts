import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hasBridge, isDaily, relatedNotes, type RetrievalHit } from '@reflect/core'
import { openSession, subscribeOpenDocumentChanges } from '@/editor/open-documents'
import { readNoteSource } from '@/lib/note-frontmatter'
import { isOstensiblyEmptyNoteSource } from '@/lib/note-emptiness'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { useSettings } from '@/providers/settings-provider'

const SIMILAR_NOTES_LIMIT = 6

function useOpenNoteSource(path: string, enabled: boolean): string | null {
  const subscribe = useCallback(
    (listener: () => void) =>
      enabled ? subscribeOpenDocumentChanges(path, listener) : () => {},
    [enabled, path],
  )
  const getSnapshot = useCallback(
    () => (enabled ? openSession(path)?.liveContent() ?? null : null),
    [enabled, path],
  )
  return useSyncExternalStore(subscribe, getSnapshot, () => null)
}

/**
 * The note's semantic neighbors ("Similar notes"), one query shared by every
 * surface that shows them (the in-note panel and the context sidebars). The
 * key shape is the contract with the index invalidation hook, so it is built
 * here exactly once; the graph root is part of the key because cached rows
 * must never outlive a graph switch.
 *
 * Gated on `semanticSearchEnabled` so disabling semantic search empties every
 * surface immediately: the query stops fetching, and the cached rows are
 * masked too — a disabled query still reports its last data, and stored
 * vectors would otherwise keep answering for the rest of the session.
 */
export function useSimilarNotes(path: string): RetrievalHit[] {
  const { graph } = useGraph()
  const { settings } = useSettings()
  const bridgeAvailable = hasBridge()
  const dailyNote = isDaily(path)
  const shouldCheckDailyEmptiness =
    bridgeAvailable && graph !== null && dailyNote && settings.semanticSearchEnabled
  const openSource = useOpenNoteSource(path, shouldCheckDailyEmptiness)
  const { data: dailyNoteIsEmpty } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'daily-empty', path],
    queryFn: async () => isOstensiblyEmptyNoteSource(await readNoteSource(path)),
    enabled: shouldCheckDailyEmptiness && openSource === null,
  })
  const openDailyNoteIsEmpty =
    openSource === null ? null : isOstensiblyEmptyNoteSource(openSource)
  const enabled =
    bridgeAvailable &&
    graph !== null &&
    settings.semanticSearchEnabled &&
    (!dailyNote || (openDailyNoteIsEmpty ?? dailyNoteIsEmpty) === false)
  const { data } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'related', path],
    queryFn: () => relatedNotes(path, SIMILAR_NOTES_LIMIT),
    enabled,
  })
  // Slice off the query result (reference-stable via structural sharing) only
  // when it or the gate changes, so consumers get a stable array across the
  // sidebar's frequent re-renders instead of a fresh one every call.
  return useMemo(
    () => (enabled ? (data ?? []).slice(0, SIMILAR_NOTES_LIMIT) : []),
    [data, enabled],
  )
}
