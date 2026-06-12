import type { ReactElement } from 'react'
import { FileText, LoaderCircle, Search } from 'lucide-react'
import type { AssistantPart } from '@/lib/chat-transcript'
import { routeForPath } from '@/routing/route'
import { useRouter } from '@/routing/router'

interface ChatToolChipProps {
  part: Extract<AssistantPart, { kind: 'search' | 'read' }>
}

/**
 * The transparent-context chip for one tool call: what the assistant searched
 * for (and how many notes came back), or which note it read. Read chips click
 * through to the note; a refused read (private, missing) shows the refusal
 * instead of pretending the note was used.
 */
export function ChatToolChip({ part }: ChatToolChipProps): ReactElement {
  const { navigate } = useRouter()

  if (part.kind === 'search') {
    return (
      <span className="flex items-center gap-1.5 text-xs text-text-muted">
        {part.hits === null ? (
          <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        ) : (
          <Search aria-hidden className="size-3.5" />
        )}
        <span className="truncate">
          Searched “{part.query}”
          {part.hits !== null
            ? ` · ${part.hits.length} ${part.hits.length === 1 ? 'note' : 'notes'}`
            : ''}
        </span>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-text-muted">
      {part.pending ? (
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
      ) : (
        <FileText aria-hidden className="size-3.5" />
      )}
      {part.error === null ? (
        <button
          type="button"
          onClick={() => navigate(routeForPath(part.path))}
          className="truncate underline-offset-2 hover:text-text hover:underline"
        >
          Read {part.title ?? part.path}
        </button>
      ) : (
        <span className="truncate">
          {part.path} — {part.error}
        </span>
      )}
    </span>
  )
}
