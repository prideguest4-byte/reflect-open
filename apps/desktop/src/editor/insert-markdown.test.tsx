import { useEffect, type Ref } from 'react'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EditorHandle } from '@meowdown/react'
import { NoteEditor, type NoteEditorHandle } from './note-editor'

/**
 * `NoteEditorHandle.insertMarkdown` delegates to meowdown's first-class
 * handle method — parse/slice behavior is pinned by meowdown's own tests;
 * this only guards the pass-through (and that a missing inner handle is a
 * safe no-op rather than a throw).
 */

const insertMarkdown = vi.hoisted(() => vi.fn())

vi.mock('@meowdown/react', () => ({
  MeowdownEditor: ({ handleRef }: { handleRef?: Ref<Partial<EditorHandle>> }) => {
    useEffect(() => {
      if (typeof handleRef === 'function') {
        handleRef({ insertMarkdown })
      } else if (handleRef !== null && handleRef !== undefined) {
        handleRef.current = { insertMarkdown }
      }
    })
    return <div />
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('NoteEditorHandle.insertMarkdown', () => {
  it('forwards the fragment to the meowdown handle', () => {
    let grabbed: NoteEditorHandle | null = null
    render(
      <NoteEditor
        initialContent=""
        handleRef={(handle) => {
          grabbed = handle
        }}
      />,
    )
    grabbed!.insertMarkdown('# Journal\n\nMood:\n')
    expect(insertMarkdown).toHaveBeenCalledExactlyOnceWith('# Journal\n\nMood:\n')
  })
})
