import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FocusEvent,
  type MutableRefObject,
  type ReactElement,
} from 'react'
import { Priority } from '@prosekit/core'
import { useKeymap } from '@prosekit/react'
import { type TagItem, type WikilinkItem } from '@meowdown/react'
import { hasBridge, suggestTags, suggestWikiTargets, type OpenTask } from '@reflect/core'
import { NoteEditor, type NoteEditorHandle } from '@/editor/note-editor'
import { useWikiLinkNavigation } from '@/editor/use-wiki-link-navigation'
import { buildAutocompleteEntries } from '@/editor/wiki-autocomplete-entries'
import { createNoteWithTitle } from '@/lib/create-note'
import { formatDayLabel } from '@/lib/dates'
import { resolveTaskEdit, taskContent } from '@/lib/tasks/task-content'
import { useGraph } from '@/providers/graph-provider'
import { useSettings } from '@/providers/settings-provider'

/**
 * The inline task editor (Plan 18, V1 parity): the sole-selected task swaps its
 * read-only text for a one-line editor seeded with the content after its marker.
 * It reuses Reflect's note editor — so it gets meowdown's built-in `[[` backlink
 * and `#` tag menus — and adds a commit/cancel/delete keymap. The marker (and so
 * the checked state) is never in this editor; the write-back only rewrites the
 * content line.
 *
 * Finalizing is single-shot and idempotent: Enter (or focus leaving for good, or
 * the row unmounting as the selection moves) commits via editTask; Escape
 * cancels; an empty editor + Backspace, or committing empty, deletes the task. A
 * blur only commits once focus has truly left — the menus refocus the editor, so
 * a bounce back in is not a commit.
 */
interface TaskEditorProps {
  task: OpenTask
  /** Persist the new content (non-empty, changed) and exit edit mode. */
  onCommit: (content: string) => void
  /** Delete the task (emptied or backspaced-empty) and exit edit mode. */
  onDelete: () => void
  /** Exit edit mode without writing (Escape / unchanged). */
  onCancel: () => void
}

interface TaskEditorApi {
  commit: () => void
  cancel: () => void
  deleteEmpty: () => void
  isEmpty: () => boolean
}

/**
 * Binds Enter/Escape/Backspace inside the editor's ProseKit context (meowdown
 * renders children there). High priority so it runs before the editor's default
 * Enter — but the `[[`/`#` menus claim those keys first while open, so Enter
 * selects a menu item rather than committing.
 */
function TaskCommitKeymap({ apiRef }: { apiRef: MutableRefObject<TaskEditorApi> }): null {
  const keymap = useMemo(
    () => ({
      // A task is one line, never a new block.
      Enter: () => {
        apiRef.current.commit()
        return true
      },
      'Shift-Enter': () => {
        apiRef.current.commit()
        return true
      },
      Escape: () => {
        apiRef.current.cancel()
        return true
      },
      Backspace: () => {
        if (apiRef.current.isEmpty()) {
          apiRef.current.deleteEmpty()
          return true
        }
        return false
      },
    }),
    [apiRef],
  )
  useKeymap(keymap, { priority: Priority.high })
  return null
}

export function TaskEditor({ task, onCommit, onDelete, onCancel }: TaskEditorProps): ReactElement {
  const { graph } = useGraph()
  const { settings } = useSettings()
  const generation = graph?.generation ?? null
  const navigate = useWikiLinkNavigation(generation)

  const initial = useMemo(() => taskContent(task.raw), [task.raw])
  const currentRef = useRef(initial)
  const doneRef = useRef(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  // The keymap commands are bound once; they call through a ref that always
  // holds this render's finalizers.
  const apiRef = useRef<TaskEditorApi>({
    commit: () => {},
    cancel: () => {},
    deleteEmpty: () => {},
    isEmpty: () => false,
  })
  apiRef.current = {
    commit: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      const result = resolveTaskEdit(initial, currentRef.current)
      if (result.type === 'commit') {
        onCommit(result.content)
      } else if (result.type === 'delete') {
        onDelete()
      } else {
        onCancel()
      }
    },
    cancel: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      onCancel()
    },
    deleteEmpty: () => {
      if (doneRef.current) {
        return
      }
      doneRef.current = true
      onDelete()
    },
    isEmpty: () => currentRef.current.trim() === '',
  }

  const createFromAutocomplete = useCallback(
    async (title: string) => {
      if (generation !== null) {
        await createNoteWithTitle(title, generation)
      }
    },
    [generation],
  )

  const onWikilinkSearch = useCallback(
    async (query: string): Promise<WikilinkItem[]> => {
      if (!hasBridge() || graph === null) {
        return []
      }
      const suggestions = await suggestWikiTargets(query)
      return buildAutocompleteEntries(query, suggestions, { offerCreate: true }).map((entry) => {
        if (entry.kind === 'create') {
          return {
            target: entry.title,
            label: `Create “${entry.title}”`,
            onSelect: () => {
              void createFromAutocomplete(entry.title)
            },
          }
        }
        const { target, title, alias, date, path } = entry.suggestion
        const label = date !== null ? formatDayLabel(date, settings.dateFormat) : title
        const detail =
          alias !== null
            ? `${alias} → ${title}`
            : date !== null
              ? path === null
                ? `${date} · new`
                : date
              : undefined
        return { target, label, detail }
      })
    },
    [graph, settings.dateFormat, createFromAutocomplete],
  )

  const onTagSearch = useCallback(
    async (query: string): Promise<TagItem[]> => {
      if (!hasBridge() || graph === null) {
        return []
      }
      const tags = await suggestTags(query)
      return tags.map((tag) => ({ tag: tag.tag }))
    },
    [graph],
  )

  const handleRef = useCallback((handle: NoteEditorHandle | null) => {
    handle?.focus()
  }, [])

  // Commit any pending edit when the row unmounts (the selection moved off it).
  useEffect(() => () => apiRef.current.commit(), [])

  const onBlur = useCallback((_event: FocusEvent<HTMLDivElement>) => {
    // Defer: the `[[`/`#` menus refocus the editor after inserting, so only a
    // focus that has genuinely left the editor region commits.
    window.setTimeout(() => {
      if (!doneRef.current && rootRef.current && !rootRef.current.contains(document.activeElement)) {
        apiRef.current.commit()
      }
    }, 0)
  }, [])

  return (
    <div ref={rootRef} onBlur={onBlur} data-task-editor className="min-w-0 flex-1">
      <NoteEditor
        initialContent={initial}
        onChange={(markdown) => {
          currentRef.current = markdown
        }}
        markMode={settings.editorMarkdownSyntax}
        spellCheck={settings.editorSpellCheck}
        onWikiLinkClick={navigate}
        onWikilinkSearch={onWikilinkSearch}
        onTagSearch={onTagSearch}
        className="reflect-task-editor text-sm leading-6"
        handleRef={handleRef}
      >
        <TaskCommitKeymap apiRef={apiRef} />
      </NoteEditor>
    </div>
  )
}
