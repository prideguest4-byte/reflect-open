import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { NoteEditor } from './note-editor'

/**
 * Plan 05 step 8 — interactive task checkboxes. meowdown 0.3.0 parses
 * `- [ ]`/`- [x]` into flat-list nodes with kind "task", and prosekit's list
 * extension (bundled in meowdown's editor extension) toggles `checked` on
 * marker click. These tests pin the end-to-end contract Reflect relies on:
 * clicking the checkbox rewrites the underlying markdown via `onChange`.
 */
describe('task checkbox toggling', () => {
  async function renderEditor(markdown: string) {
    const handleChange = vi.fn<(markdown: string) => void>()
    const { container } = render(<NoteEditor initialContent={markdown} onChange={handleChange} />)
    // prosekit attaches `useExtension` extensions (including the doc-change
    // handler behind `onChange`) on a macrotask after mount; flush it so the
    // handler observes the interactions below.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    return { container, handleChange }
  }

  function taskMarker(container: HTMLElement, index = 0): Element {
    // Plain bullets also render an (empty) marker container, so scope the
    // click target to task items, which hold the actual checkbox.
    const markers = container.querySelectorAll('[data-list-kind="task"] > .list-marker-click-target')
    const marker = markers[index]
    expect(marker).toBeDefined()
    return marker
  }

  it('renders a task item with a checkbox marker', async () => {
    const { container } = await renderEditor('- [ ] todo')
    const item = container.querySelector('[data-list-kind="task"]')
    expect(item).not.toBeNull()
    expect(item?.querySelector('.list-marker-click-target input[type="checkbox"]')).not.toBeNull()
    expect(item?.textContent).toContain('todo')
  })

  it('checks an unchecked item and serializes it as - [x]', async () => {
    const { container, handleChange } = await renderEditor('- [ ] todo')
    fireEvent.mouseDown(taskMarker(container))
    await waitFor(() => {
      expect(handleChange).toHaveBeenLastCalledWith('- [x] todo\n')
    })
    expect(container.querySelector('[data-list-checked]')).not.toBeNull()
  })

  it('unchecks a checked item and serializes it as - [ ]', async () => {
    const { container, handleChange } = await renderEditor('- [x] done')
    fireEvent.mouseDown(taskMarker(container))
    await waitFor(() => {
      expect(handleChange).toHaveBeenLastCalledWith('- [ ] done\n')
    })
  })

  it('only toggles the clicked item in a mixed list', async () => {
    const { container, handleChange } = await renderEditor('- [ ] first\n- plain\n- [x] last')
    fireEvent.mouseDown(taskMarker(container, 1))
    await waitFor(() => {
      expect(handleChange).toHaveBeenLastCalledWith('- [ ] first\n- plain\n- [ ] last\n')
    })
  })
})
