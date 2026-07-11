import type { ReactElement } from 'react'
import { useSidebarResize, type ResizableSidebarPanel } from '@/hooks/use-sidebar-resize'
import { cn } from '@/lib/utils'

const PANEL_LABELS: Record<ResizableSidebarPanel, string> = {
  workspace: 'Resize sidebar',
  context: 'Resize context panel',
}

interface SidebarResizeHandleProps {
  panel: ResizableSidebarPanel
}

/**
 * The draggable divider on a sidebar's inner edge. Invisible at rest — the
 * aside's hairline border stays the only chrome — it tints on hover (after a
 * short delay, so mousing past doesn't flash), while dragging, and on
 * keyboard focus. A focusable `separator`: arrow keys nudge the divider,
 * Home/End jump it to its extremes, and double-click resets the width.
 */
export function SidebarResizeHandle({ panel }: SidebarResizeHandleProps): ReactElement {
  const { width, range, dragging, handlers } = useSidebarResize(panel)

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={PANEL_LABELS[panel]}
      aria-valuenow={width}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      {...handlers}
      className={cn(
        'absolute inset-y-0 z-10 w-1 cursor-col-resize touch-none outline-none',
        'transition-colors duration-100 hover:bg-border-strong hover:delay-150',
        'focus-visible:bg-accent/40',
        panel === 'workspace' ? 'right-0' : 'left-0',
        dragging && 'bg-accent/60 hover:bg-accent/60',
      )}
    />
  )
}
