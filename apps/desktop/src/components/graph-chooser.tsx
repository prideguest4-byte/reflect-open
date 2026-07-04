import { useState, type ReactElement, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { hasBridge, icloudStatus } from '@reflect/core'
import { ArrowLeft, Cloud, Folder, FolderInput, FolderPlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useGraphColors } from '@/hooks/use-graph-colors'
import { graphColorCss } from '@/lib/graph-colors'
import { cn } from '@/lib/utils'
import { useGraph } from '@/providers/graph-provider'

/**
 * Steps a Reflect V1 user follows to bring their notes across. Kept as data so
 * the numbered list stays readable and the test can assert on the key actions.
 * The V1 menu path ("Settings → Graph → Export") is V1's own label, quoted
 * verbatim so it matches what the user sees in the old app.
 */
const V1_STEPS: ReactNode[] = [
  <>
    In Reflect v1, go to <Emphasis>Settings → Graph → Export</Emphasis> and export a{' '}
    <Emphasis>“Reflect Open folder”</Emphasis>.
  </>,
  <>Unzip the file and move the folder wherever you’d like to keep your notes.</>,
  <>
    Click <Emphasis>Open exported folder</Emphasis> below and select it.
  </>,
]

function Emphasis({ children }: { children: ReactNode }): ReactElement {
  return <span className="font-medium text-text">{children}</span>
}

/** iCloud is a real option only in the macOS shell. */
function isIcloudCapablePlatform(): boolean {
  return import.meta.env.TAURI_ENV_PLATFORM === 'darwin'
}

/** `/…/Documents/My Notes` → `My Notes`. */
function graphNameFromRoot(root: string): string {
  return root.split('/').filter(Boolean).at(-1) ?? 'your notes'
}

/**
 * A folder name safe to create inside the container: no separators, no
 * leading dot, trimmed. Anything else disables Create rather than guessing.
 */
function cleanGraphName(raw: string): string | null {
  const trimmed = raw.trim()
  if (trimmed.length === 0 || trimmed.startsWith('.')) {
    return null
  }
  if (/[/\\:]/.test(trimmed)) {
    return null
  }
  return trimmed
}

/**
 * First-run / no-graph screen (Plan 21 UX pass). One decision, stated
 * plainly: where do your notes live? iCloud is the recommended default —
 * name the graph, click Create, done; returning users get "Open" for the
 * graph found in their container instead. Choosing a folder yourself is the
 * self-managed path (Git sync, local-only). The Reflect v1 import is a
 * separate second step behind a quiet link, so migrators get the full
 * guided flow without the welcome screen carrying it for everyone else.
 *
 * "Graph" is deliberately absent — newcomers don't know the word yet; the
 * iCloud card asks for a "name" and the folder card talks about folders.
 */
export function GraphChooser(): ReactElement {
  const { recents, error, pickAndOpen, openRecent, createAt, forget } = useGraph()
  const { colorFor } = useGraphColors()
  const [step, setStep] = useState<'welcome' | 'v1'>('welcome')
  const icloudCapable = isIcloudCapablePlatform()

  if (step === 'v1') {
    return (
      <ChooserShell>
        <div className="space-y-1.5 text-center">
          <h1 className="text-2xl font-semibold text-text">Import from Reflect v1</h1>
          <p className="text-sm text-text-secondary">Bring your notes across in three steps.</p>
        </div>
        <section className="mx-auto flex w-full max-w-md flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <ol className="space-y-2.5">
            {V1_STEPS.map((step, index) => (
              <li key={index} className="flex gap-2.5 text-sm text-text-secondary">
                <span
                  aria-hidden
                  className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-xs font-medium text-text-secondary"
                >
                  {index + 1}
                </span>
                <span className="leading-5">{step}</span>
              </li>
            ))}
          </ol>
          <Button type="button" className="w-full" onClick={() => void pickAndOpen()}>
            <FolderInput aria-hidden strokeWidth={1.75} />
            Open exported folder…
          </Button>
        </section>
        <div className="text-center">
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep('welcome')}>
            <ArrowLeft aria-hidden strokeWidth={1.75} />
            Back
          </Button>
        </div>
        {error ? (
          <p role="alert" className="text-center text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </ChooserShell>
    )
  }

  return (
    <ChooserShell>
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold text-text">Welcome to Reflect</h1>
        <p className="text-sm text-text-secondary">
          Your notes are plain markdown files. Choose where to keep them.
        </p>
      </div>

      <div
        className={cn(
          'grid items-stretch gap-4',
          icloudCapable ? 'sm:grid-cols-2' : 'mx-auto max-w-sm',
        )}
      >
        {icloudCapable ? <IcloudCard openRecent={openRecent} createAt={createAt} /> : null}

        {/* The self-managed path: any folder, synced however the user likes. */}
        <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-text">A folder you choose</h2>
            <p className="text-sm text-text-secondary">
              Keep notes in any folder on this Mac. Sync with GitHub from Settings, or keep them
              local.
            </p>
          </div>
          <Button
            type="button"
            variant={icloudCapable ? 'outline' : 'default'}
            className="mt-auto w-full"
            onClick={() => void pickAndOpen()}
          >
            <FolderPlus aria-hidden strokeWidth={1.75} />
            Choose a folder…
          </Button>
        </section>
      </div>

      <div className="text-center">
        <Button type="button" variant="link" size="sm" onClick={() => setStep('v1')}>
          Coming from Reflect v1? Import your notes
        </Button>
      </div>

      {error ? (
        <p role="alert" className="text-center text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {recents.length > 0 ? (
        <div className="mx-auto w-full max-w-sm space-y-2">
          <p className="px-2 text-[11px] font-semibold tracking-[0.08em] text-text-muted uppercase">
            Recent
          </p>
          <ul className="space-y-px">
            {recents.map((recent) => {
              const color = colorFor(recent.root)
              return (
                <li
                  key={recent.root}
                  className="group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-surface-hover"
                >
                  <button
                    type="button"
                    onClick={() => void openRecent(recent.root)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                  >
                    <Folder
                      aria-hidden
                      strokeWidth={1.75}
                      className={cn('size-4 shrink-0', color === undefined && 'text-text-muted')}
                      style={color === undefined ? undefined : { color: graphColorCss(color) }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-text">
                        {recent.name}
                      </span>
                      <span className="block truncate text-xs text-text-muted">{recent.root}</span>
                    </span>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => void forget(recent.root)}
                    aria-label={`Forget ${recent.name}`}
                    className="shrink-0 text-text-muted opacity-0 transition-opacity duration-100 hover:text-text-secondary group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                  >
                    Forget
                  </Button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
    </ChooserShell>
  )
}

function ChooserShell({ children }: { children: ReactNode }): ReactElement {
  return (
    <div className="flex h-screen w-screen overflow-auto bg-surface-app p-8">
      {/* Auto margins (not items-center) so the content centers when it fits but
          scrolls from the top when the recents list outgrows the viewport —
          flex centering would clip the overflowing top edge. */}
      <div className="m-auto w-full max-w-2xl space-y-8">{children}</div>
    </div>
  )
}

/**
 * The recommended path. Three states from `icloud_status`: a graph already
 * in the container (returning user — open it), a live container with no
 * graph (name it, create it), or no container (signed out / unentitled
 * build — honest copy, disabled action).
 */
function IcloudCard({
  openRecent,
  createAt,
}: {
  openRecent: (root: string) => Promise<boolean>
  createAt: (root: string) => Promise<boolean>
}): ReactElement {
  const [name, setName] = useState('Notes')
  const [busy, setBusy] = useState(false)
  const { data: status } = useQuery({
    queryKey: ['icloud-status'],
    queryFn: icloudStatus,
    enabled: hasBridge(),
  })

  const available = status?.available === true
  const existing = status?.existingGraphRoot ?? null
  const cleanName = cleanGraphName(name)

  async function create(): Promise<void> {
    if (status?.documentsRoot == null || cleanName === null) {
      return
    }
    setBusy(true)
    try {
      await createAt(`${status.documentsRoot}/${cleanName}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-text">iCloud</h2>
          <Badge variant="secondary">Recommended</Badge>
        </div>
        <p className="text-sm text-text-secondary">
          {existing !== null
            ? 'Your notes are already in iCloud.'
            : available
              ? 'Syncs across your Mac and iPhone. Backed up automatically.'
              : status === undefined
                ? 'Checking iCloud…'
                : 'Sign in to iCloud on this Mac to sync your notes across devices.'}
        </p>
      </div>
      {existing !== null ? (
        <Button
          type="button"
          className="mt-auto w-full"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void openRecent(existing).finally(() => setBusy(false))
          }}
        >
          <Cloud aria-hidden strokeWidth={1.75} />
          Open “{graphNameFromRoot(existing)}”
        </Button>
      ) : (
        <div className="mt-auto space-y-2">
          <Input
            aria-label="Name"
            value={name}
            disabled={!available || busy}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void create()
              }
            }}
          />
          <Button
            type="button"
            className="w-full"
            disabled={!available || busy || cleanName === null}
            onClick={() => void create()}
          >
            <Cloud aria-hidden strokeWidth={1.75} />
            Create
          </Button>
        </div>
      )}
    </section>
  )
}
