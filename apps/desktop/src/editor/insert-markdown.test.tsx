import { useEffect, type Ref } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorHandle } from '@meowdown/react'
import { NoteEditor, type NoteEditorHandle } from './note-editor'

/**
 * `NoteEditorHandle.insertMarkdown` delegates to meowdown's first-class
 * handle method — parse/slice behavior is pinned by meowdown's own tests.
 * This guards the pass-through and the interim collapse shim
 * (prosekit/meowdown#206): an insert must never delete selected text.
 */

const insertMarkdown = vi.hoisted(() => vi.fn())
const setSelection = vi.hoisted(() => vi.fn())
const selection = vi.hoisted(() => ({ current: { type: 'text', anchor: 3, head: 3 } }))

vi.mock('@meowdown/react', () => ({
  MeowdownEditor: ({ handleRef }: { handleRef?: Ref<Partial<EditorHandle>> }) => {
    const handle = {
      insertMarkdown,
      setSelection,
      getSelection: () => selection.current,
    }
    useEffect(() => {
      if (typeof handleRef === 'function') {
        handleRef(handle)
      } else if (handleRef !== null && handleRef !== undefined) {
        handleRef.current = handle
      }
    })
    return <div />
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  selection.current = { type: 'text', anchor: 3, head: 3 }
})

function renderAndGrabHandle(): NoteEditorHandle {
  let grabbed: NoteEditorHandle | null = null
  render(
    <NoteEditor
      initialContent=""
      handleRef={(handle) => {
        grabbed = handle
      }}
    />,
  )
  if (grabbed === null) {
    throw new Error('NoteEditor never delivered its handle')
  }
  return grabbed
}

describe('NoteEditorHandle.insertMarkdown', () => {
  it('forwards the fragment to the meowdown handle without touching a caret', () => {
    const handle = renderAndGrabHandle()
    handle.insertMarkdown('# Journal\n\nMood:\n')
    expect(insertMarkdown).toHaveBeenCalledExactlyOnceWith('# Journal\n\nMood:\n')
    expect(setSelection).not.toHaveBeenCalled()
  })

  it('collapses an active selection first — an insert never deletes selected text', () => {
    selection.current = { type: 'text', anchor: 9, head: 4 }
    const handle = renderAndGrabHandle()
    handle.insertMarkdown('Goodbye ')
    // Collapsed to the selection's start (v1's TextSelection.near($from)).
    expect(setSelection).toHaveBeenCalledExactlyOnceWith({ type: 'text', anchor: 4, head: 4 })
    expect(insertMarkdown).toHaveBeenCalledExactlyOnceWith('Goodbye ')
  })
})
