import { useCallback } from 'react'
import type { GraphInfo } from '@reflect/core'
import { AppShell } from '@/components/app-shell'
import { NotePane } from '@/components/note-pane'
import { useAppVersion } from '@/hooks/use-app-version'
import { useInitialNotePath } from '@/hooks/use-initial-note-path'
import { useTheme } from '@/providers/theme-provider'

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
 * The main surface once a graph is open: the three-region shell with a header
 * (graph name, a cloud-sync warning when relevant, version, theme toggle) and
 * the editor. Daily-note wiring + persistence land in Plan 06.
 */
export function GraphWorkspace({ graph }: GraphWorkspaceProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const version = useAppVersion()
  const openPath = useInitialNotePath(graph)

  const toggleTheme = useCallback((): void => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const cloudLabel = graph.cloudSync ? (CLOUD_LABELS[graph.cloudSync] ?? graph.cloudSync) : null

  return (
    <AppShell
      rail={
        <span className="text-xs font-semibold text-[color:var(--text-secondary)]">R</span>
      }
      sidebar={
        <div className="p-4 text-sm text-[color:var(--text-secondary)]">Context</div>
      }
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-black/10 px-6 py-3 dark:border-white/10">
          <h1 className="truncate text-sm font-semibold" title={graph.root}>
            {graph.name}
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[color:var(--text-muted)]">v{version ?? '—'}</span>
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium dark:border-white/10"
            >
              {resolvedTheme === 'dark' ? 'Light' : 'Dark'} mode
            </button>
          </div>
        </header>

        {cloudLabel ? (
          <div className="border-b border-amber-500/30 bg-amber-500/10 px-6 py-2 text-xs text-amber-700 dark:text-amber-300">
            This graph is inside {cloudLabel}. Reflect syncs via GitHub — a cloud-synced
            folder is unsupported and can corrupt the local index. Consider moving it to a
            non-synced location.
          </div>
        ) : null}

        <div className="mx-auto w-full max-w-2xl flex-1 overflow-auto px-6 py-8">
          {openPath ? (
            <NotePane path={openPath} />
          ) : (
            <div className="text-sm text-[color:var(--text-muted)]">Opening note…</div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
