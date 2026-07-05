import type { ReactElement } from 'react'
import { RouteContent } from '@/components/route-content'

/**
 * A secondary note window's whole surface (⌘-click → new window): the routed
 * view, full-bleed — no workspace sidebar, no context panel, no palette or
 * dialogs. A note window is an editing surface; every other affordance lives
 * in the main window.
 */
export function NoteWindowContent(): ReactElement {
  return (
    <div className="h-screen w-screen">
      <RouteContent />
    </div>
  )
}
