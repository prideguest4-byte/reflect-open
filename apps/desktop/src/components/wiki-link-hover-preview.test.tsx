import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileChange } from '@reflect/core'
import { WikiLinkHoverPreview } from './wiki-link-hover-preview'

const mocks = vi.hoisted(() => ({
  resolveExistingWikiTarget: vi.fn(),
  readExistingNoteSource: vi.fn(),
  markdownPreview: vi.fn(),
}))

let fileChangeHandler: ((changes: FileChange[]) => void) | null = null
let fileChangesReady = true
let fileChangeCycle: object = {}

vi.mock('@reflect/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@reflect/core')>()
  return {
    ...actual,
    resolveExistingWikiTarget: mocks.resolveExistingWikiTarget,
  }
})

vi.mock('@/lib/read-existing-note-source', () => ({
  readExistingNoteSource: mocks.readExistingNoteSource,
}))

vi.mock('@/lib/use-file-changes', () => ({
  useFileChanges: (handler: ((changes: FileChange[]) => void) | null) => {
    fileChangeHandler = handler
    return { cycle: fileChangeCycle, settled: fileChangesReady }
  },
}))

vi.mock('@/editor/markdown-preview', () => ({
  MarkdownPreview: (props: {
    content: string
    interactive: boolean
    renderEmbeds: boolean
    resolveImageUrl: (src: string) => string | null
  }) => {
    mocks.markdownPreview(props)
    return <div data-testid="markdown-preview">{props.content}</div>
  },
}))

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function renderPreview(
  target: string,
  options: {
    dismiss?: () => void
    generation?: number | null
    graphKey?: string | null
  } = {},
) {
  return render(
    <WikiLinkHoverPreview
      target={target}
      dismiss={options.dismiss ?? vi.fn()}
      generation={options.generation === undefined ? 7 : options.generation}
      graphKey={options.graphKey === undefined ? '/graph' : options.graphKey}
      dateFormat="mdy"
      resolveAssetOpenPath={(source) =>
        source.startsWith('assets/') && !source.includes('..') ? source : null
      }
      resolveImageUrl={(source) => `reflect-asset://${source}`}
    />,
  )
}

describe('WikiLinkHoverPreview', () => {
  afterEach(cleanup)

  beforeEach(() => {
    fileChangeHandler = null
    fileChangesReady = true
    fileChangeCycle = {}
    mocks.resolveExistingWikiTarget.mockReset()
    mocks.readExistingNoteSource.mockReset()
    mocks.markdownPreview.mockReset()
  })

  it('stays invisible while loading, strips frontmatter, and renders passively', async () => {
    const read = deferred<string>()
    mocks.resolveExistingWikiTarget.mockResolvedValue({
      kind: 'resolved',
      path: 'notes/alpha.md',
    })
    mocks.readExistingNoteSource.mockReturnValue(read.promise)

    renderPreview('Alpha')
    expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()

    await act(async () => {
      read.resolve('---\nprivate: true\n---\n# Alpha\n\nBody')
      await read.promise
    })

    expect((await screen.findByTestId('markdown-preview')).textContent).toBe(
      '# Alpha\n\nBody',
    )
    const props = mocks.markdownPreview.mock.calls.at(-1)?.[0]
    expect(props).toMatchObject({
      content: '# Alpha\n\nBody',
      interactive: false,
      renderEmbeds: false,
    })
    expect(props.resolveImageUrl('https://example.com/cat.png')).toBeNull()
    expect(props.resolveImageUrl('assets/../secret.png')).toBeNull()
    expect(props.resolveImageUrl('assets/vector.svg')).toBeNull()
    expect(props.resolveImageUrl('assets/cat.png')).toBe(
      'reflect-asset://assets/cat.png?reflect-preview=raster',
    )
  })

  it('dismisses missing, ambiguous, and unavailable targets without showing a card', async () => {
    for (const resolution of [
      { kind: 'missing' },
      { kind: 'ambiguous', paths: ['notes/a.md', 'notes/b.md'] },
      { kind: 'unavailable', paths: ['notes/a.md'] },
    ]) {
      const dismiss = vi.fn()
      mocks.resolveExistingWikiTarget.mockResolvedValueOnce(resolution)
      const view = renderPreview('Target', { dismiss })

      await waitFor(() => expect(dismiss).toHaveBeenCalledOnce())
      expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()
      view.unmount()
    }
    expect(mocks.readExistingNoteSource).not.toHaveBeenCalled()
  })

  it('does not let a late request for A replace a newer preview for B', async () => {
    const aResolution = deferred<{ kind: 'resolved'; path: string }>()
    mocks.resolveExistingWikiTarget.mockImplementation((target: string) =>
      target === 'A'
        ? aResolution.promise
        : Promise.resolve({ kind: 'resolved', path: 'notes/b.md' }),
    )
    mocks.readExistingNoteSource.mockResolvedValue('# B')
    const dismiss = vi.fn()
    const view = renderPreview('A', { dismiss })

    view.rerender(
      <WikiLinkHoverPreview
        target="B"
        dismiss={dismiss}
        generation={7}
        graphKey="/graph"
        dateFormat="mdy"
        resolveAssetOpenPath={() => null}
        resolveImageUrl={() => null}
      />,
    )
    expect((await screen.findByTestId('markdown-preview')).textContent).toBe('# B')

    await act(async () => {
      aResolution.resolve({ kind: 'resolved', path: 'notes/a.md' })
      await aResolution.promise
    })

    expect(screen.getByTestId('markdown-preview').textContent).toBe('# B')
    expect(mocks.readExistingNoteSource).toHaveBeenCalledTimes(1)
  })

  it('dismisses a target changed while resolution is still pending', async () => {
    const resolution = deferred<{ kind: 'resolved'; path: string }>()
    const dismiss = vi.fn()
    mocks.resolveExistingWikiTarget.mockReturnValue(resolution.promise)
    renderPreview('Alpha', { dismiss })

    act(() => {
      fileChangeHandler?.([{ path: 'notes/alpha.md', kind: 'remove' }])
    })
    await act(async () => {
      resolution.resolve({ kind: 'resolved', path: 'notes/alpha.md' })
      await resolution.promise
    })

    await waitFor(() => expect(dismiss).toHaveBeenCalledOnce())
    expect(mocks.readExistingNoteSource).not.toHaveBeenCalled()
    expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()
  })

  it('does not restart a visible request on an unrelated parent rerender', async () => {
    const dismiss = vi.fn()
    mocks.resolveExistingWikiTarget.mockResolvedValue({
      kind: 'resolved',
      path: 'notes/alpha.md',
    })
    mocks.readExistingNoteSource.mockResolvedValue('# Alpha')
    const view = renderPreview('Alpha', { dismiss })
    await screen.findByTestId('wiki-link-hover-preview')

    view.rerender(
      <WikiLinkHoverPreview
        target="Alpha"
        dismiss={dismiss}
        generation={7}
        graphKey="/graph"
        dateFormat="dmy"
        resolveAssetOpenPath={() => null}
        resolveImageUrl={() => null}
      />,
    )

    expect(mocks.resolveExistingWikiTarget).toHaveBeenCalledOnce()
    expect(mocks.readExistingNoteSource).toHaveBeenCalledOnce()
  })

  it('hides the old body until a resubscribed watcher reloads it', async () => {
    const dismiss = vi.fn()
    mocks.resolveExistingWikiTarget.mockResolvedValue({
      kind: 'resolved',
      path: 'notes/alpha.md',
    })
    mocks.readExistingNoteSource.mockResolvedValue('# Original')
    const view = renderPreview('Alpha', { dismiss })
    expect((await screen.findByTestId('markdown-preview')).textContent).toBe('# Original')

    fileChangesReady = false
    fileChangeCycle = {}
    view.rerender(
      <WikiLinkHoverPreview
        target="Alpha"
        dismiss={dismiss}
        generation={7}
        graphKey="/graph"
        dateFormat="mdy"
        resolveAssetOpenPath={() => null}
        resolveImageUrl={() => null}
      />,
    )
    expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()

    const resolution = deferred<{ kind: 'resolved'; path: string }>()
    mocks.resolveExistingWikiTarget.mockReturnValue(resolution.promise)
    fileChangesReady = true
    view.rerender(
      <WikiLinkHoverPreview
        target="Alpha"
        dismiss={dismiss}
        generation={7}
        graphKey="/graph"
        dateFormat="mdy"
        resolveAssetOpenPath={() => null}
        resolveImageUrl={() => null}
      />,
    )
    expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()

    await act(async () => {
      resolution.resolve({ kind: 'resolved', path: 'notes/alpha.md' })
      await resolution.promise
    })
    expect((await screen.findByTestId('markdown-preview')).textContent).toBe('# Original')
    expect(mocks.resolveExistingWikiTarget).toHaveBeenCalledTimes(2)
    expect(mocks.readExistingNoteSource).toHaveBeenCalledTimes(2)
  })

  it('dismisses when the resolved target is updated or removed', async () => {
    const dismiss = vi.fn()
    mocks.resolveExistingWikiTarget.mockResolvedValue({
      kind: 'resolved',
      path: 'notes/alpha.md',
    })
    mocks.readExistingNoteSource.mockResolvedValue('# Alpha')
    renderPreview('Alpha', { dismiss })

    await screen.findByTestId('wiki-link-hover-preview')
    expect(fileChangeHandler).not.toBeNull()
    act(() => {
      fileChangeHandler?.([{ path: 'notes/alpha.md', kind: 'upsert' }])
    })

    expect(dismiss).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('wiki-link-hover-preview')).toBeNull()
  })

  it('shows a formatted subject and Empty note for an empty daily note', async () => {
    mocks.resolveExistingWikiTarget.mockResolvedValue({
      kind: 'resolved',
      path: 'daily/2026-06-09.md',
    })
    mocks.readExistingNoteSource.mockResolvedValue('---\nid: day\n---\n\n')
    renderPreview('2026-06-09')

    expect(await screen.findByText('Tue, June 9th, 2026')).not.toBeNull()
    expect(screen.getByText('Empty note')).not.toBeNull()
    expect(mocks.markdownPreview).not.toHaveBeenCalled()
  })
})
