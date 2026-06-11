import { useState, type KeyboardEvent, type ReactElement } from 'react'
import { errorMessage, parseGithubRemote, type GithubRepoRef } from '@reflect/core'
import { InlineAlert } from '@/components/inline-alert'
import { GithubAuthStep } from '@/components/settings/github-auth-step'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useSync } from '@/providers/sync-provider'

interface ConnectGithubDialogProps {
  /** A suggested name for a newly created backup repo (from the graph name). */
  suggestedRepoName: string
  onClose: () => void
}

/** Parse "owner/name" or a full GitHub URL into a repo ref. */
export function parseRepoInput(input: string): GithubRepoRef | null {
  const trimmed = input.trim()
  const fromUrl = parseGithubRemote(trimmed)
  if (fromUrl !== null) {
    return fromUrl
  }
  const match = /^([\w.-]+)\/([\w.-]+)$/.exec(trimmed)
  return match === null ? null : { owner: match[1], name: match[2] }
}

/**
 * The "Connect GitHub" modal: sign in ({@link GithubAuthStep}), then pick the
 * backup repo — create a new **private** one (the default) or connect an
 * existing one. Connecting a public repo demands explicit confirmation:
 * every note in the graph, including `private: true` ones, would be
 * world-readable.
 */
export function ConnectGithubDialog({
  suggestedRepoName,
  onClose,
}: ConnectGithubDialogProps): ReactElement {
  const { connectNewRepo, connectExistingRepo } = useSync()
  const [step, setStep] = useState<'auth' | 'repo'>('auth')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [mode, setMode] = useState<'create' | 'existing'>('create')
  const [repoName, setRepoName] = useState(suggestedRepoName)
  const [existingRepo, setExistingRepo] = useState('')
  const [publicConfirm, setPublicConfirm] = useState<GithubRepoRef | null>(null)

  async function connect(allowPublic = false): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      if (mode === 'create') {
        const name = repoName.trim()
        if (name.length === 0) {
          setError('Name the new repository.')
          return
        }
        await connectNewRepo(name)
        onClose()
        return
      }
      const ref = publicConfirm ?? parseRepoInput(existingRepo)
      if (ref === null) {
        setError('Enter the repository as owner/name or a GitHub URL.')
        return
      }
      const result = await connectExistingRepo(ref, { allowPublic })
      if (result === 'notFound') {
        setError('That repository was not found (check the name and the token’s repo access).')
        return
      }
      if (result === 'needsPublicConfirm') {
        setPublicConfirm(ref)
        return
      }
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
        aria-label="Connect GitHub"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-4 shadow-lg"
        onPointerDown={(event) => {
          event.stopPropagation()
        }}
        onKeyDown={handleDialogKeyDown}
      >
        <h2 className="text-sm font-semibold text-text">Connect GitHub</h2>

        {step === 'auth' ? (
          <div className="mt-3">
            <GithubAuthStep onAuthed={() => setStep('repo')} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-3">
            {publicConfirm === null ? (
              <>
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="radio"
                      checked={mode === 'create'}
                      onChange={() => setMode('create')}
                    />
                    Create a new private repository
                  </label>
                  {mode === 'create' ? (
                    <Input
                      autoFocus
                      value={repoName}
                      onChange={(event) => setRepoName(event.target.value)}
                      className="ml-6 w-auto"
                      aria-label="New repository name"
                    />
                  ) : null}
                  <label className="flex items-center gap-2 text-sm text-text">
                    <input
                      type="radio"
                      checked={mode === 'existing'}
                      onChange={() => setMode('existing')}
                    />
                    Use an existing repository
                  </label>
                  {mode === 'existing' ? (
                    <Input
                      autoFocus
                      value={existingRepo}
                      onChange={(event) => setExistingRepo(event.target.value)}
                      placeholder="owner/name"
                      className="ml-6 w-auto"
                      aria-label="Existing repository"
                    />
                  ) : null}
                </div>
                <Button onClick={() => void connect()} disabled={busy} size="sm">
                  {busy ? 'Connecting…' : 'Connect'}
                </Button>
              </>
            ) : (
              <>
                <InlineAlert tone="error">
                  <strong>
                    {publicConfirm.owner}/{publicConfirm.name} is public.
                  </strong>{' '}
                  Everything in this graph — including notes marked private — would be readable
                  by anyone on the internet.
                </InlineAlert>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPublicConfirm(null)}>
                    Choose another repo
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void connect(true)}
                    disabled={busy}
                  >
                    Back up to a public repo
                  </Button>
                </div>
              </>
            )}
            {error !== null ? <InlineAlert tone="error">{error}</InlineAlert> : null}
          </div>
        )}
      </div>
    </div>
  )
}
