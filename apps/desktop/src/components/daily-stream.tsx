import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { Virtualizer, type VirtualizerHandle } from 'virtua'
import { dailyPath } from '@reflect/core'
import { NotePane } from '@/components/note-pane'
import type { NoteEditorHandle } from '@/editor/note-editor'
import { formatDayLabel, todayIso } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { useSettings } from '@/providers/settings-provider'
import { useToday } from '@/lib/use-today'
import { createDayWindow, dateAtIndex, indexOfDate, neighborDate } from '@/lib/day-window'
import { useSetFocusedDailyDate } from '@/providers/focused-daily-provider'
import { useRouter } from '@/routing/router'

interface DailyStreamProps {
  /** The day to anchor/scroll to, or the live local day for the `today` route. */
  target: { kind: 'today' } | { kind: 'date'; date: string }
}

/**
 * The reading gutter (`.reflect-content-gutter` in styles/index.css): the old
 * scroll-container `px-6` and centered `max-w-2xl` column folded into one
 * `padding-inline` applied *inside* an element instead of around it. The element
 * spans the pane's full width with its content in a centered column, so the side
 * gutters belong to the element: clicking anywhere across a daily row focuses that
 * day's note. The normal-note editor reuses the same class (route-content.tsx) so a
 * click anywhere in the note body, even the blank margin, still hits the editor.
 *
 * An ordinary class, not a `px-*` utility: on the editor it must out-cascade the
 * un-layered `.reflect-editor` padding reset, which every `@layer utilities` rule
 * loses to regardless of order.
 */
const CONTENT_GUTTER = 'reflect-content-gutter'

/** The size guess virtua uses for a row it has not measured yet. */
export const ESTIMATED_DAY_HEIGHT = 220

type PendingAutoFocus = {
  readonly date: string
  readonly selection: 'start' | 'end'
}

interface PendingAutoFocusState {
  readonly arrivalSeq: number
  readonly entryId: number
  readonly request: PendingAutoFocus | null
}

function autoFocusRequestForArrival({
  targetDate,
  arrivalFocusEditor,
  restored,
}: {
  targetDate: string
  arrivalFocusEditor: boolean
  restored: number | null
}): PendingAutoFocus | null {
  if (restored !== null && !arrivalFocusEditor) {
    return null
  }
  return {
    date: targetDate,
    selection: arrivalFocusEditor ? 'end' : 'start',
  }
}

/**
 * The daily stream (Plan 06b): a virtualized chronological run of days — past
 * above, future below — where **every day is a virtual note**. Each visible row
 * mounts the Plan 05 editor lazily (`createIfMissing`), so a day only becomes a
 * real `daily/*.md` when edited. Offscreen rows unmount and flush through the
 * save pipeline's final-flush path. The window is a fixed ±range around today
 * (virtual rows are free), so there is no bidirectional infinite-scroll
 * bookkeeping; index↔date is pure offset math.
 */
export function DailyStream({ target }: DailyStreamProps): ReactElement {
  const { arrivalSeq, arrivalFocusEditor, entryId, saveScrollState, savedScroll } = useRouter()
  const virtualizerRef = useRef<VirtualizerHandle>(null)
  // The window anchors at today-on-mount and stays stable for the view's life.
  // (`dayWindow`, not `window` — shadowing the DOM global here was a footgun.)
  const [dayWindow] = useState(() => createDayWindow(todayIso()))
  // Per-row data is unused (the date is derived from the index); a stable array
  // of the window's length just tells virtua how many rows exist.
  const data = useMemo(() => Array.from({ length: dayWindow.count }), [dayWindow.count])
  const today = useToday()
  const targetDate = target.kind === 'today' ? today : target.date
  const { settings } = useSettings()

  // targetDate is read at arrival time, not reacted to. On the `today` route
  // it follows this component's live clock — the same value that paints the
  // today highlight — but midnight drift alone is not a navigation. The next
  // real arrival (⌘D, a link) reads the fresh value and anchors to the new day.
  const targetDateRef = useRef(targetDate)
  useLayoutEffect(() => {
    targetDateRef.current = targetDate
  }, [targetDate])

  // Only the day navigated to receives focus, once per navigation — a row that
  // scrolls offscreen and back must not steal focus from wherever the user is.
  // Kept in state rather than a ref so a same-row arrival still re-renders the
  // mounted NotePane with a fresh autofocus prop.
  const [pendingAutoFocusState, setPendingAutoFocusState] = useState<PendingAutoFocusState>(() => ({
    arrivalSeq,
    entryId,
    request: autoFocusRequestForArrival({
      targetDate,
      arrivalFocusEditor,
      restored: savedScroll(),
    }),
  }))
  if (
    pendingAutoFocusState.arrivalSeq !== arrivalSeq ||
    pendingAutoFocusState.entryId !== entryId
  ) {
    setPendingAutoFocusState({
      arrivalSeq,
      entryId,
      request: autoFocusRequestForArrival({
        targetDate,
        arrivalFocusEditor,
        restored: savedScroll(),
      }),
    })
  }
  const pendingAutoFocus = pendingAutoFocusState.request
  const consumeFocus = useCallback(() => {
    setPendingAutoFocusState((current) =>
      current.request === null ? current : { ...current, request: null },
    )
  }, [])

  // Report the day the user is editing to the context sidebar: the route stays
  // on the day navigated to, but focus moves freely between stream rows, and the
  // sidebar's note actions / published link must describe the focused day.
  const setFocusedDailyDate = useSetFocusedDailyDate()

  // Cross-note arrow navigation (ArrowUp at the top of a day -> end of the
  // previous day; ArrowDown at the bottom -> start of the next day). The stream
  // is virtualized, so the neighbor day's editor may not be mounted: we keep a
  // registry of mounted day handles plus a single pending-focus slot that
  // carries the target caret position, applied when the neighbor row mounts and
  // registers. This is independent of the Daily-arrival autofocus path.
  const dayHandlesRef = useRef(new Map<string, NoteEditorHandle>())
  const pendingFocusRef = useRef<{ date: string; position: 'start' | 'end' } | null>(null)

  const focusDay = useCallback((handle: NoteEditorHandle, position: 'start' | 'end') => {
    handle.focus()
    // meowdown's setSelection also scrolls the caret into view.
    handle.setSelection(position)
  }, [])

  const registerHandle = useCallback(
    (date: string, handle: NoteEditorHandle | null) => {
      if (handle === null) {
        dayHandlesRef.current.delete(date)
        return
      }
      dayHandlesRef.current.set(date, handle)
      const pending = pendingFocusRef.current
      if (pending?.date === date) {
        pendingFocusRef.current = null
        focusDay(handle, pending.position)
      }
    },
    [focusDay],
  )

  const handleExitBoundary = useCallback(
    (date: string, direction: 'up' | 'down'): boolean => {
      const target = neighborDate(dayWindow, date, direction === 'up' ? -1 : 1)
      if (target === null) {
        // Window edge: no neighbor — hand the key back so the editor no-ops.
        return false
      }
      const position: 'start' | 'end' = direction === 'up' ? 'end' : 'start'
      const mounted = dayHandlesRef.current.get(target)
      if (mounted) {
        focusDay(mounted, position)
        return true
      }
      // The neighbor is virtualized away: queue the focus, then scroll its row
      // into the rendered range so it mounts and `registerHandle` applies it.
      pendingFocusRef.current = { date: target, position }
      virtualizerRef.current?.scrollToIndex(indexOfDate(dayWindow, target), {
        align: direction === 'up' ? 'end' : 'start',
      })
      return true
    },
    [dayWindow, focusDay],
  )

  // Re-anchor on every explicit arrival (`arrivalSeq` bumps even when ⌘D is
  // pressed while already on today — the router clears the entry's saved
  // offset for that case; `entryId` covers back/forward between entries whose
  // routes resolve to the same day). A back/forward-restored entry carries its
  // offset; a fresh navigation anchors to the target day. Focus arrivals are
  // append/capture gestures (⌘D, Daily sidebar row, mobile Daily double-tap):
  // they focus the target editor at the document end so meowdown reveals the
  // caret after the row itself is anchored.
  //
  // A layout effect, not a passive one: virtua applies an imperative scroll in a
  // pre-paint microtask, so anchoring here pins the target day to the viewport
  // top before the first frame is shown, instead of painting the top of the
  // five-year window and then lurching down.
  useLayoutEffect(() => {
    const restored = savedScroll()
    if (restored !== null && !arrivalFocusEditor) {
      // A restored arrival also cancels any focus still pending from a prior
      // navigation the user backed out of before that day's editor mounted (both
      // the ⌘D autofocus and a queued cross-note boundary focus). The day would
      // otherwise steal focus when its row scrolls into view.
      pendingFocusRef.current = null
      virtualizerRef.current?.scrollTo(restored)
      return
    }
    const target = targetDateRef.current
    pendingFocusRef.current = null
    virtualizerRef.current?.scrollToIndex(indexOfDate(dayWindow, target), { align: 'start' })
  }, [arrivalSeq, arrivalFocusEditor, entryId, dayWindow, savedScroll])

  return (
    <div
      data-testid="daily-stream"
      className="h-full overflow-auto"
      onScroll={(event) => saveScrollState(event.currentTarget.scrollTop)}
      // An explicit click/touch picks its own focus target — a focus still
      // pending for a day whose editor hasn't mounted yet must not steal the
      // caret later. Typing is deliberately not a cancel: ⌘D-then-type should
      // still land focus in today once its editor mounts.
      onPointerDownCapture={() => {
        setPendingAutoFocusState((current) =>
          current.request === null ? current : { ...current, request: null },
        )
        pendingFocusRef.current = null
      }}
    >
      <Virtualizer
        ref={virtualizerRef}
        data={data}
        itemSize={ESTIMATED_DAY_HEIGHT}
        bufferSize={2 * ESTIMATED_DAY_HEIGHT}
        shift={true}
      >
        {(_, index) => {
          const date = dateAtIndex(dayWindow, index)
          const isToday = date === today
          // V1's daily-note sizing: past days hug their content (an empty day
          // collapses to a short row), while today and future days reserve
          // most of a viewport of writing room. ISO dates compare lexically.
          const isPast = date < today
          const pendingFocus = pendingAutoFocus
          const autoFocus = pendingFocus?.date === date
          return (
            <section
              key={date}
              data-index={index}
              className="border-b border-border py-6"
              // Focus entering this row (clicking its editor, tabbing in) makes
              // it the day the sidebar describes.
              onFocusCapture={() => setFocusedDailyDate(date)}
            >
              {/* V1 renders the date as the note's H1-sized subject, with
                  today's tinted brand (its `highlightSubject`). */}
              <h2
                className={cn('reflect-daily-subject mb-3', CONTENT_GUTTER, isToday && 'text-accent')}
              >
                {formatDayLabel(date, settings.dateFormat)}
              </h2>
              <NotePane
                path={dailyPath(date)}
                dailyDate={date}
                registerHandle={registerHandle}
                onExitBoundary={handleExitBoundary}
                lazy
                autoFocus={autoFocus}
                autoFocusSelection={pendingFocus?.selection ?? 'start'}
                onAutoFocused={consumeFocus}
                gutterClassName={CONTENT_GUTTER}
                editorClassName={isPast ? 'min-h-[100px]' : 'min-h-[60vh]'}
              />
            </section>
          )
        }}
      </Virtualizer>
      {/* Trailing room so the last day isn't pinned to the viewport bottom */}
      <div aria-hidden className="h-60" />
    </div>
  )
}
