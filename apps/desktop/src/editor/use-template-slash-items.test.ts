import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { NoteEditorHandle } from './note-editor'

const listTemplates = vi.hoisted(() =>
  vi.fn(async () => [
    { path: 'templates/journal.md', title: 'Journal', mtime: 1 },
    { path: 'templates/person.md', title: 'Person', mtime: 2 },
  ]),
)
const hasBridge = vi.hoisted(() => vi.fn(() => true))
const templateBody = vi.hoisted(() => vi.fn(async () => '# Journal\n\nMood:\n'))
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  listTemplates,
  hasBridge,
}))
vi.mock('@/lib/note-templates', () => ({ templateBody }))
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({ graph: { root: '/g', generation: 1 } }),
}))

const { useTemplateSlashItems } = await import('./use-template-slash-items')

function fakeEditor(): NoteEditorHandle & { inserted: string[] } {
  const inserted: string[] = []
  return {
    inserted,
    getMarkdown: () => '',
    setMarkdown: () => {},
    insertMarkdown: (markdown) => {
      inserted.push(markdown)
    },
    focus: () => {},
    setSelection: () => {},
  }
}

describe('useTemplateSlashItems', () => {
  it('maps templates to slash rows whose select inserts the body', async () => {
    const editor = fakeEditor()
    const { result } = renderHook(() => useTemplateSlashItems(() => editor))

    const items = await result.current('jour')
    expect(items.map((item) => ({ id: item.id, label: item.label }))).toEqual([
      { id: 'templates/journal.md', label: 'Journal' },
      { id: 'templates/person.md', label: 'Person' },
    ])

    items[0]!.onSelect()
    await waitFor(() => expect(editor.inserted).toEqual(['# Journal\n\nMood:\n']))
    expect(templateBody).toHaveBeenCalledWith('templates/journal.md')
  })

  it('inserts nowhere when the pane already unmounted', async () => {
    const { result } = renderHook(() => useTemplateSlashItems(() => null))
    const items = await result.current('')
    items[0]!.onSelect()
    await waitFor(() => expect(templateBody).toHaveBeenCalled())
    // No editor — the resolved body is dropped, never inserted somewhere stale.
  })

  it('returns nothing without a bridge', async () => {
    hasBridge.mockReturnValueOnce(false)
    const { result } = renderHook(() => useTemplateSlashItems(() => fakeEditor()))
    await expect(result.current('')).resolves.toEqual([])
  })
})
