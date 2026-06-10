import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hasBridge, listNotes, listNoteTags } from '@reflect/core'
import { INDEX_QUERY_SCOPE } from '@/lib/query-client'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'
import { AllNotesFilters } from './all-notes-filters'
import { AllNotesTable } from './all-notes-table'
import { NewNoteButton } from './new-note-button'

interface AllNotesScreenProps {
  /** Active tag filter carried by the route (`null` = all non-daily notes). */
  tag: string | null
}

/**
 * The All Notes screen (a routed view, like settings): every non-daily note,
 * newest first, filterable by tag. The active tag lives on the route so
 * back/forward and "open a note, come back" keep the filter. Daily notes are
 * deliberately absent — the stream is their home.
 */
export function AllNotesScreen({ tag }: AllNotesScreenProps): ReactElement {
  const { graph } = useGraph()
  const { navigate } = useRouter()
  const enabled = hasBridge() && graph !== null

  const { data: notes } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'all-notes', tag === null ? null : tag.toLowerCase()],
    queryFn: () => listNotes({ tag }),
    enabled,
  })
  const { data: facets } = useQuery({
    queryKey: [INDEX_QUERY_SCOPE, graph?.root, 'all-notes-tags'],
    queryFn: () => listNoteTags(),
    enabled,
  })

  return (
    <div aria-label="All notes">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-text">Notes</h1>
        <div className="flex flex-wrap items-center gap-3">
          <AllNotesFilters
            tag={tag}
            facets={facets ?? []}
            onSelect={(next) => navigate({ kind: 'allNotes', tag: next })}
          />
          <NewNoteButton />
        </div>
      </header>
      <AllNotesTable notes={notes} tag={tag} onOpen={(path) => navigate(routeForPath(path))} />
    </div>
  )
}
