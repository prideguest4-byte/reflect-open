import { useEffect, type ReactElement } from 'react'
import type { GraphInfo } from '@reflect/core'
import { PanelLeft } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { CommandPalette } from '@/components/command-palette/command-palette'
import { EmbeddingsSync } from '@/components/embeddings-sync'
import { PaletteProvider, usePalette } from '@/components/command-palette/palette-provider'
import { DailyStream } from '@/components/daily-stream'
import { NotePane } from '@/components/note-pane'
import { SettingsScreen } from '@/components/settings-screen'
import { Sidebar } from '@/components/sidebar/sidebar'
import { isIsoDate } from '@/lib/dates'
import { useToday } from '@/lib/use-today'
import { OperationsStatus } from '@/components/operations-status'
import { SidebarProvider, useSidebar } from '@/providers/sidebar-provider'
import { useAppShortcuts } from '@/routing/app-shortcuts'
import { RouterProvider, useRouter } from '@/routing/router'
import { ScrollRestored } from '@/routing/scroll-restore'

const CLOUD_LABELS: Record<string, string> = {
  icloud: 'iCloud Drive',
  dropbox: 'Dropbox',
  googleDrive: 'Google Drive',
  oneDrive: 'OneDrive',
}

interface GraphWorkspaceProps {
  graph: GraphInfo
}

/**
 * The main surface once a graph is open: the sidebar + note pane around the
 * route-driven content (Plan 06). The app opens to today's daily note — the
 * chronological spine — and all navigation goes through the typed router.
 * Keyed by the graph root so switching graphs starts a fresh history.
 */
export function GraphWorkspace({ graph }: GraphWorkspaceProps): ReactElement {
  return (
    <RouterProvider key={graph.root}>
      <PaletteProvider>
        <SidebarProvider>
          <WorkspaceContent graph={graph} />
        </SidebarProvider>
      </PaletteProvider>
    </RouterProvider>
  )
}

function WorkspaceContent({ graph }: GraphWorkspaceProps): ReactElement {
  const { collapsed } = useSidebar()
  const commandContext = useAppShortcuts()

  const cloudLabel = graph.cloudSync ? (CLOUD_LABELS[graph.cloudSync] ?? graph.cloudSync) : null

  return (
    <AppShell sidebar={collapsed ? undefined : <Sidebar graph={graph} context={commandContext} />}>
      <div className="relative flex h-full flex-col">
        {collapsed ? (
          <button
            type="button"
            aria-label="Show sidebar"
            title="Show sidebar"
            onClick={() => commandContext.toggleSidebar()}
            className="absolute top-2.5 left-3 z-10 rounded-md p-1 text-[color:var(--text-muted)] transition-colors duration-100 hover:bg-[var(--surface-hover)] hover:text-[color:var(--text-secondary)]"
          >
            <PanelLeft aria-hidden strokeWidth={1.75} className="size-4" />
          </button>
        ) : null}

        {cloudLabel ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-700 dark:text-amber-300">
            This graph is inside {cloudLabel}. Reflect syncs via GitHub — a cloud-synced
            folder is unsupported and can corrupt the local index. Consider moving it to a
            non-synced location.
          </div>
        ) : null}

        <div className="min-h-0 flex-1">
          <RouteContent />
        </div>

        <OperationsStatus />
        <CommandPalette context={commandContext} />
        <EmbeddingsSync />
      </div>
    </AppShell>
  )
}

/**
 * `search/:query` is a deep-link target, not a second search surface (decided
 * 2026-06-09): arriving opens the ⌘K palette pre-filled over the stream.
 */
function SearchRoute({ query, today }: { query: string; today: string }): ReactElement {
  const { openPalette } = usePalette()
  const { arrivalSeq, entryId } = useRouter()
  // Keyed on the *arrival*, not just the value (the daily stream's lesson):
  // re-navigating to the same search route bumps arrivalSeq without a remount,
  // and back/forward changes entryId without bumping arrivalSeq — both are
  // arrivals, and arriving on search opens the palette (decided).
  useEffect(() => {
    openPalette(query)
  }, [query, arrivalSeq, entryId, openPalette])
  return <DailyStream targetDate={today} />
}

/** Route → view. `today` tracks the live clock — midnight re-renders it. */
function RouteContent(): ReactElement {
  const { route } = useRouter()
  const today = useToday()
  switch (route.kind) {
    case 'today':
      return <DailyStream targetDate={today} />
    case 'daily':
      // A malformed date (impossible calendar day) anchors to today instead of
      // letting dailyPath throw mid-render.
      return <DailyStream targetDate={isIsoDate(route.date) ? route.date : today} />
    case 'note':
      return (
        <ScrollRestored className="h-full overflow-auto px-6 py-8">
          <div className="mx-auto w-full max-w-2xl">
            <NotePane path={route.path} lazy autoFocus />
          </div>
        </ScrollRestored>
      )
    case 'search':
      return <SearchRoute query={route.query} today={today} />
    case 'settings':
      return (
        <ScrollRestored className="h-full overflow-auto px-6 py-8">
          <div className="mx-auto w-full max-w-2xl">
            <SettingsScreen />
          </div>
        </ScrollRestored>
      )
  }
}
