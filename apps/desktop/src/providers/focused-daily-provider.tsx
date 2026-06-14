import { createContext, useContext, useState, type ReactElement, type ReactNode } from 'react'

/**
 * Which day in the daily stream currently holds the user's focus, so the
 * context sidebar can describe *that* day rather than the routed one.
 *
 * The daily stream is a run of per-day editors under a single `daily/:date`
 * route: scrolling or clicking to another day moves focus but never changes the
 * route (only the calendar does). Without this, the right sidebar — derived
 * purely from the route — stays pinned to the routed day while the user edits a
 * different one, so its note actions (pin, private, publish) and the published
 * URL all describe the wrong note.
 *
 * The stream is the only writer (it sets the focused day on focus); the
 * workspace shell reads it and falls back to the routed day when nothing in the
 * stream is focused — which is also the calendar-pick path. Split into separate
 * value/setter contexts so the heavy stream can consume the (stable) setter
 * without re-rendering every time the focused day changes.
 */

const FocusedDailyDateContext = createContext<string | null>(null)
const SetFocusedDailyDateContext = createContext<(date: string | null) => void>(() => {})

/** Provides the focused-day state to the workspace shell and the daily stream. */
export function FocusedDailyProvider({ children }: { children: ReactNode }): ReactElement {
  const [focusedDate, setFocusedDate] = useState<string | null>(null)
  return (
    <SetFocusedDailyDateContext.Provider value={setFocusedDate}>
      <FocusedDailyDateContext.Provider value={focusedDate}>
        {children}
      </FocusedDailyDateContext.Provider>
    </SetFocusedDailyDateContext.Provider>
  )
}

/** The focused day, or `null` when nothing in the stream is focused. */
export function useFocusedDailyDate(): string | null {
  return useContext(FocusedDailyDateContext)
}

/** Record (or clear, with `null`) the focused day. No-op without a provider. */
export function useSetFocusedDailyDate(): (date: string | null) => void {
  return useContext(SetFocusedDailyDateContext)
}
