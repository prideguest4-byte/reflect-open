import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { setBridge } from '@reflect/core'
import {
  FocusedDailyProvider,
  useFocusedDailyDate,
} from '@/providers/focused-daily-provider'
import type { Route } from '@/routing/route'
import { RouterProvider, useRouter, type NavigateOptions } from '@/routing/router'
import { todayIso } from '@/lib/dates'
import { createDayWindow, dateAtIndex, indexOfDate } from '@/lib/day-window'
import { installVirtuaTestEnv } from '@/test-utils/virtua-jsdom'
import { DailyStream, ESTIMATED_DAY_HEIGHT } from './daily-stream'

/**
 * The stream's first-paint anchor: virtua must put the scroll element at the
 * target day (or a back/forward entry's saved offset) before paint, so opening
 * the app never shows the top of the five-year window and then lurches down to
 * today. virtua applies an imperative scroll by assigning `scrollTop` in a
 * microtask, so these tests flush that and pin the *first* offset it writes. The
 * jsdom environment never resolves a note read, so they also cover the
 * loading-placeholder contract (reserved editor space, delayed hint).
 */

const editorProbe = vi.hoisted(() => ({
  focusCalls: 0,
  selectionCalls: [] as Array<'start' | 'end'>,
}))

vi.mock('@/editor/note-editor', async () => {
  const { useEffect } = await import('react')
  return {
    NoteEditor: ({
      initialContent,
      handleRef,
    }: {
      initialContent: string
      handleRef?: (handle: import('@/editor/note-editor').NoteEditorHandle | null) => void
    }) => {
      useEffect(() => {
        handleRef?.({
          setMarkdown: () => {},
          getMarkdown: () => '',
          insertMarkdown: () => {},
          focus: () => {
            editorProbe.focusCalls += 1
          },
          setSelection: (position: 'start' | 'end') => {
            editorProbe.selectionCalls.push(position)
          },
          getSelectedText: () => '',
          openSelectionMenu: () => {},
          startPendingReplacement: () => false,
          appendPendingReplacementText: () => {},
          acceptPendingReplacement: () => {},
          discardPendingReplacement: () => {},
        })
        return () => handleRef?.(null)
      }, [handleRef])
      return <div data-testid="fake-editor">{initialContent}</div>
    },
  }
})
vi.mock('@/providers/graph-provider', () => ({
  useGraph: () => ({
    graph: { root: '/g', name: 'g', generation: 1 },
    indexing: false,
  }),
}))
vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({
    settings: {
      dateFormat: 'mdy',
      editorMarkdownSyntax: 'hide',
      editorSpellCheck: true,
      aiProviders: [],
      defaultAiProviderId: null,
      aiPrompts: [],
    },
    updateSettings: async () => {},
    updateSettingsWith: () => {},
  }),
}))

// jsdom computes no layout; installVirtuaTestEnv lets virtua measure the scroll
// container (a tall viewport) and each row (exactly the estimate), so the range
// around the anchor renders without any size-correction churn.
installVirtuaTestEnv((element) =>
  element.dataset['testid'] === 'daily-stream' ? 800 : ESTIMATED_DAY_HEIGHT,
)
Element.prototype.scrollTo ??= () => {}

// virtua anchors by assigning `scrollTop` (not `scrollTo`); record the offsets it
// writes so a test can pin the first one.
const scrollTops: number[] = []
let scrollTop = 0
Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
  configurable: true,
  get() {
    return scrollTop
  },
  set(value: number) {
    scrollTop = Number(value)
    scrollTops.push(scrollTop)
  },
})

const mockInvoke = vi.fn<(command: string, args: Record<string, unknown>) => Promise<unknown>>()

setBridge({
  invoke: mockInvoke,
  listen: async () => () => {},
})

beforeEach(() => {
  scrollTops.length = 0
  editorProbe.focusCalls = 0
  editorProbe.selectionCalls = []
  mockInvoke.mockReset()
  // Reads never resolve by default: every day stays a loading placeholder.
  mockInvoke.mockImplementation(() => new Promise(() => {}))
})

afterEach(() => {
  vi.useRealTimers()
})

function StreamProviders({ children }: { children: ReactNode }): ReactElement {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
  )
  return (
    <QueryClientProvider client={client}>
      <RouterProvider initialRoute={{ kind: 'today' }}>{children}</RouterProvider>
    </QueryClientProvider>
  )
}

/** Records `offset` on the current history entry, as a view's scroll would. */
function SaveScrollProbe({ offset }: { offset: number }): ReactElement | null {
  const { saveScrollState } = useRouter()
  useEffect(() => {
    saveScrollState(offset)
  }, [saveScrollState, offset])
  return null
}

function NavigateTodayProbe({
  onReady,
}: {
  onReady: (navigateToday: (options?: NavigateOptions) => void) => void
}): null {
  const { navigate } = useRouter()
  useEffect(() => {
    onReady((options) => navigate({ kind: 'today' }, options))
  }, [navigate, onReady])
  return null
}

function NavigateRouteProbe({
  onReady,
}: {
  onReady: (navigateRoute: (route: Route, options?: NavigateOptions) => void) => void
}): null {
  const { navigate } = useRouter()
  useEffect(() => {
    onReady((route, options) => navigate(route, options))
  }, [navigate, onReady])
  return null
}

function installReadableNotes(files: Record<string, string>): void {
  mockInvoke.mockImplementation(async (command, args) => {
    if (command === 'note_read') {
      const content = files[(args as { path: string }).path]
      if (content === undefined) {
        throw { kind: 'notFound', message: 'missing' }
      }
      return content
    }
    if (command === 'note_write') {
      const { path, contents } = args as { path: string; contents: string }
      files[path] = contents
      return null
    }
    if (command === 'note_exists') {
      return (args as { path: string }).path in files
    }
    if (command === 'db_query') {
      return []
    }
    return null
  })
}

describe('DailyStream', () => {
  it('anchors its first scroll to today, with no top-of-window flicker', async () => {
    const today = todayIso()
    const view = render(
      <StreamProviders>
        <DailyStream target={{ kind: 'today' }} />
      </StreamProviders>,
    )

    const expected = indexOfDate(createDayWindow(today), today) * ESTIMATED_DAY_HEIGHT
    await waitFor(() => expect(scrollTops.length).toBeGreaterThan(0))
    // The very first offset virtua applies is the anchor, not 0 (the top of the
    // window): the stream never paints the top and then jumps down to today.
    expect(scrollTops[0]).toBe(expected)
    view.unmount()
  })

  it('re-anchors a today arrival to the stream-local day after midnight', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 5, 27, 23, 59, 0))
    let navigateToday: () => void = () => {
      throw new Error('navigate not ready')
    }
    const view = render(
      <StreamProviders>
        <DailyStream target={{ kind: 'today' }} />
        <NavigateTodayProbe
          onReady={(run) => {
            navigateToday = run
          }}
        />
      </StreamProviders>,
    )

    const dayWindow = createDayWindow('2026-06-27')
    await act(async () => {
      vi.advanceTimersByTime(2 * 60 * 1000)
    })
    scrollTops.length = 0

    await act(async () => {
      navigateToday()
    })

    const expected = indexOfDate(dayWindow, '2026-06-28') * ESTIMATED_DAY_HEIGHT
    expect(scrollTops.length).toBeGreaterThan(0)
    expect(scrollTops[0]).toBe(expected)
    view.unmount()
  })

  it('mounts straight at a restored entry’s saved offset, not the anchor', async () => {
    const view = render(
      <StreamProviders>
        <SaveScrollProbe offset={4321} />
      </StreamProviders>,
    )
    scrollTops.length = 0

    view.rerender(
      <StreamProviders>
        <SaveScrollProbe offset={4321} />
        <DailyStream target={{ kind: 'today' }} />
      </StreamProviders>,
    )

    await waitFor(() => expect(scrollTops.length).toBeGreaterThan(0))
    expect(scrollTops[0]).toBe(4321)
    view.unmount()
  })

  it('reports the focused day so the sidebar can follow it within the stream', async () => {
    const today = todayIso()
    const dayWindow = createDayWindow(today)
    let focused: string | null = 'unset'
    function FocusProbe(): null {
      focused = useFocusedDailyDate()
      return null
    }
    const view = render(
      <StreamProviders>
        <FocusedDailyProvider>
          <DailyStream target={{ kind: 'date', date: today }} />
          <FocusProbe />
        </FocusedDailyProvider>
      </StreamProviders>,
    )

    // Focus enters a stream row (the route is unchanged): the sidebar's day
    // must move to that row's date, not stay on the routed day.
    const row = (await waitFor(() => {
      const el = view.container.querySelector('[data-index]')
      expect(el).not.toBeNull()
      return el
    })) as HTMLElement
    const date = dateAtIndex(dayWindow, Number(row.getAttribute('data-index')))
    fireEvent.focusIn(row)

    expect(focused).toBe(date)
    view.unmount()
  })

  it('focuses a focused daily arrival at the end of the daily note', async () => {
    const dayWindow = createDayWindow(todayIso())
    const target = dateAtIndex(dayWindow, 2)
    installReadableNotes({ [`daily/${target}.md`]: 'first thought\nsecond thought\n' })
    let navigateRoute: (route: Route, options?: NavigateOptions) => void = () => {
      throw new Error('navigate route not ready')
    }
    const view = render(
      <StreamProviders>
        <DailyStream target={{ kind: 'date', date: target }} />
        <NavigateRouteProbe
          onReady={(run) => {
            navigateRoute = run
          }}
        />
      </StreamProviders>,
    )

    await waitFor(() => {
      expect(view.getAllByTestId('fake-editor').length).toBeGreaterThan(0)
    })
    editorProbe.focusCalls = 0
    editorProbe.selectionCalls = []
    scrollTops.length = 0

    await act(async () => {
      navigateRoute({ kind: 'daily', date: target }, { focusEditor: true })
    })

    const expected = indexOfDate(dayWindow, target) * ESTIMATED_DAY_HEIGHT
    expect(scrollTops.length).toBeGreaterThan(0)
    expect(scrollTops[0]).toBe(expected)
    await waitFor(() => expect(editorProbe.focusCalls).toBeGreaterThan(0))
    expect(editorProbe.selectionCalls).toContain('end')
    view.unmount()
  })

  it('reserves the editor’s space on loading placeholders, with the hint delayed', async () => {
    const view = render(
      <StreamProviders>
        <DailyStream target={{ kind: 'today' }} />
      </StreamProviders>,
    )

    const placeholders = await view.findAllByText('Loading note…')
    expect(placeholders.length).toBeGreaterThan(0)
    for (const placeholder of placeholders) {
      expect(placeholder.className).toContain('reflect-note-loading')
      expect(placeholder.className).toMatch(/min-h-/)
    }
    view.unmount()
  })
})
