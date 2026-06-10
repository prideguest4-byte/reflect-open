import { fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { setBridge } from '@reflect/core'
import { RouterProvider, useRouter } from '@/routing/router'
import { AllNotesScreen } from './all-notes-screen'

/**
 * The All Notes screen over the real query layer and a fake IPC bridge: rows
 * from compiled SQL, tag tabs from settings, the Custom menu from the facet
 * query, and navigation through the real router.
 */

vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({
    graph: { root: '/g', name: 'g', cloudSync: null, generation: 1 },
    indexing: false,
  }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: {
      editorMarkdownSyntax: 'focus',
      theme: 'system',
      allNotesFilterTags: ['book', 'person'],
    },
    updateSettings: () => {},
  }),
}))

// Deterministic regardless of the test run's clock: both timestamps are far in
// the past, so the Updated column always renders the short-date form.
const HEALTH_MTIME = new Date(2020, 0, 15, 12, 0).getTime()
const TOKYO_MTIME = new Date(2020, 0, 10, 12, 0).getTime()

const noteRows = [
  {
    path: 'notes/health.md',
    title: 'Health Stacked',
    mtime: HEALTH_MTIME,
    text_head: 'Health Stacked\nShop your health goals.\n',
  },
  {
    path: 'notes/tokyo.md',
    title: 'Tokyo Gâteau',
    mtime: TOKYO_MTIME,
    text_head: 'Tokyo Gâteau\nDandelion chocolate.\n',
  },
]
const tagRows = [
  { note_path: 'notes/health.md', tag: 'link' },
  { note_path: 'notes/tokyo.md', tag: 'link' },
]
const facetRows = [
  { tag: 'book', count: 3 },
  { tag: 'travel', count: 2 },
]

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

setBridge({ invoke: mockInvoke, listen: async () => () => {} })

beforeEach(() => {
  mockInvoke.mockReset()
  mockInvoke.mockImplementation(async (command, args) => {
    if (command !== 'db_query') {
      return null
    }
    const sql = String(args.sql)
    const params = args.params as unknown[]
    if (sql.includes('group by lower(tags.tag)')) {
      return facetRows
    }
    if (sql.includes('substr(note_text.text')) {
      // A tag-filtered list (EXISTS subquery carries the folded tag) — only
      // `travel` has matches in this fixture.
      if (sql.includes('exists')) {
        return params.includes('travel') ? [noteRows[1]] : []
      }
      return noteRows
    }
    if (sql.includes('"note_path" in')) {
      return tagRows.filter((row) => params.includes(row.note_path))
    }
    return []
  })
})

function RouteProbe(): ReactElement {
  const { route } = useRouter()
  return <output data-testid="route">{JSON.stringify(route)}</output>
}

function RoutedScreen(): ReactElement {
  const { route } = useRouter()
  return <AllNotesScreen tag={route.kind === 'allNotes' ? route.tag : null} />
}

function renderScreen() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider initialRoute={{ kind: 'allNotes', tag: null }}>
        <RoutedScreen />
        <RouteProbe />
      </RouterProvider>
    </QueryClientProvider>,
  )
}

function probedRoute(view: ReturnType<typeof renderScreen>): unknown {
  return JSON.parse(view.getByTestId('route').textContent ?? 'null')
}

describe('AllNotesScreen', () => {
  it('lists non-daily notes with subject, snippet, tags, and updated columns', async () => {
    const view = renderScreen()

    await view.findByText('Health Stacked')
    expect(view.getByText('Shop your health goals.')).toBeDefined()
    expect(view.getByText('Tokyo Gâteau')).toBeDefined()
    expect(view.getAllByText('#link')).toHaveLength(2)
    expect(view.getByText('1/15/2020')).toBeDefined()
    expect(view.getByText('1/10/2020')).toBeDefined()
    view.unmount()
  })

  it('opens a note when its row is clicked', async () => {
    const view = renderScreen()

    fireEvent.click(await view.findByRole('button', { name: /Health Stacked/ }))

    expect(probedRoute(view)).toEqual({ kind: 'note', path: 'notes/health.md' })
    view.unmount()
  })

  it('renders pinned tags from settings as tabs and filters through the route', async () => {
    const view = renderScreen()
    await view.findByText('Health Stacked')

    expect(view.getByRole('button', { name: '#person' })).toBeDefined()
    fireEvent.click(view.getByRole('button', { name: '#book' }))

    expect(probedRoute(view)).toEqual({ kind: 'allNotes', tag: 'book' })
    await view.findByText('No notes tagged #book.')
    expect(view.queryByText('Health Stacked')).toBeNull()
    view.unmount()
  })

  it('offers unpinned tags in the Custom menu and shows the chosen one', async () => {
    const view = renderScreen()

    // `book` is pinned, so the menu offers only `travel` (with its count).
    fireEvent.click(await view.findByRole('button', { name: 'Custom' }))
    const menu = view.getByRole('menu', { name: 'Filter by another tag' })
    expect(menu.textContent).toContain('#travel')
    expect(menu.textContent).toContain('2')
    expect(menu.textContent).not.toContain('#book')

    fireEvent.click(view.getByRole('menuitem', { name: /#travel/ }))

    expect(probedRoute(view)).toEqual({ kind: 'allNotes', tag: 'travel' })
    await view.findByText('Tokyo Gâteau')
    expect(view.queryByText('Health Stacked')).toBeNull()
    // The trigger adopts the active custom tag.
    await waitFor(() =>
      expect(view.getByRole('button', { name: /#travel/, expanded: false })).toBeDefined(),
    )
    view.unmount()
  })
})
