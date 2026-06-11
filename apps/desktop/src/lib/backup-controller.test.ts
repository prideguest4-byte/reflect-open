import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge, type GraphInfo } from '@reflect/core'
import { createBackupController, type BackupState } from './backup-controller'

afterEach(() => {
  setBridge(null)
})

const GRAPH: GraphInfo = { root: '/g', name: 'G', cloudSync: null, generation: 3 }

const AUTH = JSON.stringify({ kind: 'pat', token: 'ghp_abc' })
const CLEAN_COMMIT = { committed: false, sha: null, ahead: 0, skippedLargeFiles: [] }
const UP_TO_DATE = { kind: 'upToDate', conflictedPaths: [], changedFiles: [] }

interface FakeOptions {
  auth?: string | null
  /** Hold the listen promise until `release()` (the teardown-race window). */
  gateListen?: boolean
  failStatus?: boolean
}

/** Bridge fake with a mutable repo status, recording every command. */
function fakeBridge(options: FakeOptions = {}) {
  const calls: string[] = []
  const status = {
    initialized: true,
    branch: 'main',
    remoteUrl: 'https://github.com/alex/notes.git' as string | null,
    ahead: 0,
    behind: 0,
    inProgress: false,
  }
  let releaseListen: (() => void) | null = null
  setBridge({
    invoke: async (command) => {
      calls.push(command)
      switch (command) {
        case 'git_status':
          if (options.failStatus === true) {
            throw { kind: 'io', message: 'broken repo' }
          }
          return status
        case 'secret_get':
          return options.auth === undefined ? AUTH : options.auth
        case 'git_commit_all':
          return CLEAN_COMMIT
        case 'git_fetch':
          return { ahead: 0, behind: 0 }
        case 'git_merge_remote':
          return UP_TO_DATE
        case 'git_push':
          return { pushed: true, nonFastForward: false, rejectionMessage: null }
        case 'git_disconnect':
          status.remoteUrl = null
          return status
        default:
          return null
      }
    },
    listen: async () => {
      if (options.gateListen === true) {
        await new Promise<void>((resolve) => {
          releaseListen = resolve
        })
      }
      return () => {}
    },
  })
  return { calls, status, releaseListen: () => releaseListen?.() }
}

function trackStates(controller: ReturnType<typeof createBackupController>): BackupState[] {
  const states: BackupState[] = []
  controller.subscribe(() => states.push(controller.getState()))
  return states
}

describe('createBackupController', () => {
  it('reports disconnected when no credential is stored', async () => {
    const { calls } = fakeBridge({ auth: null })
    const controller = createBackupController({ graph: GRAPH, indexGeneration: 1 })
    await controller.start()

    expect(controller.getState()).toEqual({ phase: 'disconnected' })
    expect(calls).not.toContain('git_commit_all')
    controller.dispose()
  })

  it('runs the launch pull when fully connected — and skips the idle push', async () => {
    const { calls } = fakeBridge()
    const controller = createBackupController({ graph: GRAPH, indexGeneration: 1 })
    const states = trackStates(controller)
    await controller.start()
    await vi.waitFor(() => {
      expect(calls).toContain('git_merge_remote')
    })

    expect(states.at(-1)).toMatchObject({ phase: 'connected', status: { state: 'idle' } })
    // Both sides in step: the cycle must end without a network push.
    expect(calls).not.toContain('git_push')
    controller.dispose()
  })

  it('disposing mid-subscribe stops the engine before any git work runs', async () => {
    const { calls, releaseListen } = fakeBridge({ gateListen: true })
    const controller = createBackupController({ graph: GRAPH, indexGeneration: 1 })
    const started = controller.start()
    await vi.waitFor(() => {
      expect(calls).toContain('git_status')
    })

    controller.dispose() // teardown wins the race against the subscription
    releaseListen()
    await started

    expect(calls).not.toContain('git_commit_all')
    expect(calls.filter((command) => command === 'git_status')).toHaveLength(1)
  })

  it('disconnectGraph drops the remote and lands on disconnected', async () => {
    const { calls } = fakeBridge()
    const controller = createBackupController({ graph: GRAPH, indexGeneration: 1 })
    await controller.start()

    await controller.disconnectGraph()

    expect(calls).toContain('git_disconnect')
    expect(controller.getState()).toEqual({ phase: 'disconnected' })
    controller.dispose()
  })

  it('a failed probe tears down to disconnected instead of leaving a zombie', async () => {
    const { calls } = fakeBridge({ failStatus: true })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = createBackupController({ graph: GRAPH, indexGeneration: 1 })
    await controller.start()

    expect(controller.getState()).toEqual({ phase: 'disconnected' })
    expect(calls).not.toContain('git_commit_all')
    controller.dispose()
    errorSpy.mockRestore()
  })
})
