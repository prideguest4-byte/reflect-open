import type { Route } from '@/routing/route'

/** What the AppShell's right context region should describe for a route. */
export type ContextSidebarTarget =
  | { kind: 'daily'; date: string }
  | { kind: 'note'; path: string }

/**
 * The subject of the context sidebar for `route`, or `null` when the route
 * gets none: the `today` route follows the live clock, a `daily/:date` route
 * uses its date (real by the router's `normalizeRoute` invariant), a `note`
 * route uses its path, and `allNotes`/`search`/`chat`/`settings` routes show
 * no note context.
 */
export function contextSidebarTarget(route: Route, today: string): ContextSidebarTarget | null {
  switch (route.kind) {
    case 'today':
      return { kind: 'daily', date: today }
    case 'daily':
      return { kind: 'daily', date: route.date }
    case 'note':
      return { kind: 'note', path: route.path }
    case 'allNotes':
    case 'search':
    case 'chat':
    case 'settings':
      return null
  }
}

/**
 * Override a daily context target with the day currently focused in the daily
 * stream, when there is one. The stream keeps one `daily/:date` route while
 * focus moves between days, so the sidebar must describe the focused day, not
 * the routed one. A non-daily target — or an unfocused stream (`null`) — passes
 * through unchanged: there the routed subject is the right one (and `null` is
 * the calendar-pick path, where focus stays out of the stream).
 */
export function contextTargetForFocus(
  target: ContextSidebarTarget | null,
  focusedDailyDate: string | null,
): ContextSidebarTarget | null {
  if (target?.kind === 'daily' && focusedDailyDate !== null) {
    return { kind: 'daily', date: focusedDailyDate }
  }
  return target
}
