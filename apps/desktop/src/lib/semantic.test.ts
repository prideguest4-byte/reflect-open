import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '@reflect/core'
import { ensureEmbeddingsVisibly } from './semantic'

const startOperation = vi.hoisted(() => vi.fn())
vi.mock('@/lib/operations', () => ({ startOperation }))

afterEach(() => {
  setBridge(null)
  startOperation.mockReset()
})

function operationHandle() {
  const handle = { progress: vi.fn(), done: vi.fn(), fail: vi.fn() }
  startOperation.mockReturnValue(handle)
  return handle
}

describe('ensureEmbeddingsVisibly', () => {
  it('resolves the operation only at a terminal status (a racing ensure returns loading)', async () => {
    const handle = operationHandle()
    let emit: ((payload: unknown) => void) | null = null
    setBridge({
      invoke: async (command) => {
        if (command === 'embed_ensure') {
          return { status: 'loading' } // someone else is mid-download
        }
        if (command === 'embed_status') {
          return { status: 'loading' }
        }
        return null
      },
      listen: async (_event, handler) => {
        emit = handler
        return () => {
          emit = null
        }
      },
    })

    const pending = ensureEmbeddingsVisibly()
    await vi.waitFor(() => expect(emit).not.toBeNull())
    expect(handle.done).not.toHaveBeenCalled() // still loading — not "done"

    emit?.({ status: 'ready', model: 'all-MiniLM-L6-v2' })
    const status = await pending
    expect(status).toEqual({ status: 'ready', model: 'all-MiniLM-L6-v2' })
    expect(handle.done).toHaveBeenCalledTimes(1)
  })

  it('a failed load fails the operation with the message', async () => {
    const handle = operationHandle()
    setBridge({
      invoke: async (command) =>
        command === 'embed_ensure' ? { status: 'failed', message: 'no disk space' } : null,
      listen: async () => () => {},
    })
    const status = await ensureEmbeddingsVisibly()
    expect(status.status).toBe('failed')
    expect(handle.fail).toHaveBeenCalledWith('no disk space')
  })
})
