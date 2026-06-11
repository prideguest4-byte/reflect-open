import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import {
  errorMessage,
  getGithubToken,
  githubRemoteUrl,
  gitClone,
  ReflectError,
} from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import { GithubAuthStep } from '@/components/settings/github-auth-step'
import { parseRepoInput } from '@/components/settings/connect-github-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { providerFetch } from '@/lib/provider-fetch'
import { useGraph } from '@/providers/graph-provider'

interface RestoreFromGithubDialogProps {
  onClose: () => void
}

const FIELD_LABEL_CLASS = 'text-xs font-medium text-text-secondary'

/**
 * Restore a backed-up graph on a fresh machine (Plan 12 acceptance): sign in
 * ({@link GithubAuthStep}), name the backup repo, choose where to put it, and
 * clone. The clone lands in `<chosen folder>/<repo name>` — `git_clone`
 * refuses non-empty destinations, so a restore can never overwrite existing
 * notes — and the result opens as a normal graph (the index rebuilds from
 * the files, Plan 04).
 */
export function RestoreFromGithubDialog({ onClose }: RestoreFromGithubDialogProps): ReactElement {
  const { openRecent } = useGraph()
  const [step, setStep] = useState<'auth' | 'repo'>('auth')
  const [repoInput, setRepoInput] = useState('')
  const [destination, setDestination] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function pickDestination(): Promise<void> {
    const picked = await open({ directory: true, multiple: false, title: 'Restore into folder' })
    if (typeof picked === 'string') {
      setDestination(picked)
    }
  }

  async function restore(): Promise<void> {
    setError(null)
    const ref = parseRepoInput(repoInput)
    if (ref === null) {
      setError('Enter the repository as owner/name or a GitHub URL.')
      return
    }
    if (destination === null) {
      setError('Choose a folder to restore into.')
      return
    }
    setBusy(true)
    try {
      const token = await getGithubToken(providerFetch)
      if (token === null) {
        throw new ReflectError('auth', 'Sign in to GitHub first')
      }
      const target = `${destination}/${ref.name}`
      await gitClone(githubRemoteUrl(ref), target, token)
      await openRecent(target) // opens the clone as a graph; the index rebuilds
      onClose()
    } catch (caught: unknown) {
      setError(errorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const handleDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/20 pt-[18vh]"
      onPointerDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Restore from GitHub"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-lg"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onKeyDown={handleDialogKeyDown}
      >
        <h2 className="text-sm font-semibold text-text">Restore from GitHub</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          Download a graph you backed up from another device.
        </p>

        {step === 'auth' ? (
          <div className="mt-3">
            <GithubAuthStep onAuthed={() => setStep('repo')} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className={FIELD_LABEL_CLASS}>Backup repository</span>
              <Input
                autoFocus
                value={repoInput}
                onChange={(event) => setRepoInput(event.target.value)}
                placeholder="owner/name"
              />
            </label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void pickDestination()}>
                Restore into…
              </Button>
              <span className="min-w-0 truncate text-xs text-text-muted">
                {destination ?? 'No folder chosen'}
              </span>
            </div>
            <Button onClick={() => void restore()} disabled={busy} size="sm">
              {busy ? 'Restoring…' : 'Restore'}
            </Button>
            {error !== null ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          </div>
        )}
      </div>
    </div>
  )
}
