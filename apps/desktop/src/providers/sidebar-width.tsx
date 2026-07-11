import { useEffect, type ReactElement } from 'react'
import { useSettings } from '@/providers/settings-provider'

/**
 * Applies the persisted sidebar widths to the document root.
 *
 * Mirrors `sidebarWidth` and `contextSidebarWidth` onto the `--sidebar-width`
 * and `--context-sidebar-width` variables the AppShell's aside widths read.
 * The design-system tokens keep the fresh-install defaults, so removing the
 * overrides on unmount falls back cleanly. During a drag the resize handle
 * writes the same variables directly (per-frame, without settings churn);
 * this effect re-asserts whatever the drag commits to settings on release.
 */
export function SidebarWidthEffect(): ReactElement | null {
  const { settings } = useSettings()
  const sidebarWidth = settings.sidebarWidth
  const contextSidebarWidth = settings.contextSidebarWidth

  useEffect(() => {
    const style = document.documentElement.style
    style.setProperty('--sidebar-width', `${sidebarWidth}px`)
    style.setProperty('--context-sidebar-width', `${contextSidebarWidth}px`)
    return () => {
      style.removeProperty('--sidebar-width')
      style.removeProperty('--context-sidebar-width')
    }
  }, [sidebarWidth, contextSidebarWidth])

  return null
}
