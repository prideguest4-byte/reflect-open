import type { ReactElement } from 'react'
import type { NoteListEntry } from '@reflect/core'
import { cn } from '@/lib/utils'
import { ALL_NOTES_GRID, AllNotesRow } from './all-notes-row'

interface AllNotesTableProps {
  /** `undefined` while the index query settles (renders nothing, not "empty"). */
  notes: NoteListEntry[] | undefined
  /** The active tag filter, for the empty state's wording. */
  tag: string | null
  onOpen: (path: string) => void
}

/** The All Notes table: a header row over clickable note rows. */
export function AllNotesTable({ notes, tag, onOpen }: AllNotesTableProps): ReactElement | null {
  if (notes === undefined) {
    return null
  }
  return (
    <div className="mt-4">
      <div
        className={cn(
          ALL_NOTES_GRID,
          'border-b border-border px-3 pb-2 text-xs font-medium text-text-muted',
        )}
      >
        <span>Subject</span>
        <span>Snippet</span>
        <span>Tags</span>
        <span className="text-right">Updated</span>
      </div>
      {notes.length === 0 ? (
        <p className="px-3 py-8 text-sm text-text-muted">
          {tag === null ? 'No notes yet.' : `No notes tagged #${tag}.`}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {notes.map((note) => (
            <AllNotesRow key={note.path} note={note} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </div>
  )
}
