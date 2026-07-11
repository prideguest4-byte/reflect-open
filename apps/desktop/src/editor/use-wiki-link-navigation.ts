import { useCallback, useEffect, useRef } from 'react'
import {
  errorMessage,
  normalizeWikiTarget,
  resolveOrCreateNoteWithTitle,
  resolveWikiTarget,
} from '@reflect/core'
import { reportAmbiguousNoteTitle } from '@/editor/ambiguous-note-feedback'
import { startOperation } from '@/lib/operations'
import { isNewWindowClick, openRouteInNewWindow } from '@/lib/windows/open-in-new-window'
import { routeForPath, type Route } from '@/routing/route'
import { useRouter } from '@/routing/router'

/**
 * Navigation for a clicked `[[wiki link]]`. Calendar-valid ISO dates preserve
 * ordinary resolution precedence, then open their lazy daily route on a miss.
 * Every other writable title goes through the ambiguity-preserving index +
 * disk resolver before it opens or creates, so an indexed duplicate cannot
 * bypass the same guard used for an index miss. With no graph generation
 * available, existing titles still use the read-only index resolver and
 * unresolved titles are a no-op.
 *
 * A ⌘-click (the originating `event`, when the caller passes it) opens the
 * resolved target in a secondary note window instead — falling back to
 * in-window navigation whenever the surface can't (browser dev, mobile), so
 * the modifier never makes a link do nothing. Keyboard follows (Mod-Enter)
 * deliberately stay in-window: their modifier is held by definition.
 *
 * Resolution is async, and the host pane can unmount while it's in flight
 * (route change, graph switch) — a late navigate would yank the user somewhere
 * they've already left, so the hook guards every navigation on its own
 * lifetime.
 *
 * @param generation the open graph's write generation (`GraphInfo.generation`),
 *   or `null` when no graph is writable.
 * @returns a stable-per-`generation` click handler for the editor's wiki-link
 *   extension.
 */
export function useWikiLinkNavigation(
  generation: number | null,
): (target: string, event?: MouseEvent | KeyboardEvent) => void {
  const { navigate } = useRouter()

  const unmountedRef = useRef(false)
  useEffect(() => {
    unmountedRef.current = false
    return () => {
      unmountedRef.current = true
    }
  }, [])

  return useCallback(
    (target: string, event?: MouseEvent | KeyboardEvent) => {
      const newWindow = isNewWindowClick(event)
      const open = async (route: Route): Promise<void> => {
        if (newWindow) {
          if (await openRouteInNewWindow(route)) {
            return
          }
          // The await above opened an unmount window; a late fallback must
          // not yank a pane the user already left.
          if (unmountedRef.current) {
            return
          }
        }
        navigate(route)
      }
      void (async () => {
        try {
          const normalized = normalizeWikiTarget(target)
          if (normalized.raw === '') {
            return
          }
          if (normalized.date !== undefined) {
            const resolution = await resolveWikiTarget(normalized.raw)
            if (unmountedRef.current) {
              return
            }
            await open(
              resolution.kind === 'resolved'
                ? routeForPath(resolution.ref)
                : { kind: 'daily', date: normalized.date },
            )
            return
          }
          if (generation !== null) {
            const outcome = await resolveOrCreateNoteWithTitle(normalized.raw, generation)
            if (unmountedRef.current) {
              return
            }
            if (outcome.kind === 'ambiguous') {
              reportAmbiguousNoteTitle('Opening link', normalized.raw)
            } else {
              await open(routeForPath(outcome.path))
            }
            return
          }

          const resolution = await resolveWikiTarget(normalized.raw)
          if (unmountedRef.current) {
            return
          }
          if (resolution.kind === 'resolved') {
            // Deliberately no focus request: on mobile, focusing mid-arrival
            // raises the keyboard through the stack animation. Desktop
            // autofocuses note arrivals on its own.
            await open(routeForPath(resolution.ref))
          }
        } catch (err) {
          console.error('wiki-link resolution failed:', err)
          startOperation('Opening link').fail(errorMessage(err))
        }
      })()
    },
    [navigate, generation],
  )
}
