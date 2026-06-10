import type { ReactElement } from 'react'
import { SimilarNotesSection } from './similar-notes-section'

interface NoteContextSidebarProps {
  /** Graph-relative path of the open note the sidebar describes. */
  path: string
}

/**
 * An ordinary note's contextual sidebar: the note's semantic neighbors.
 * Inbound links live under the note itself (the incoming-backlinks panel),
 * not here. Rendered in the AppShell's right region on `note` routes; the
 * note pane hides its inline similar-notes panel at the breakpoint where
 * this sidebar appears, so the context shows exactly once at every window
 * size.
 */
export function NoteContextSidebar({ path }: NoteContextSidebarProps): ReactElement {
  return (
    <div className="flex flex-col px-2 py-2 text-text">
      <SimilarNotesSection path={path} />
    </div>
  )
}
