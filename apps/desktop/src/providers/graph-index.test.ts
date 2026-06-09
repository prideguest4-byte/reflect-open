import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@reflect/core', () => ({
  openIndex: vi.fn(),
  reconcileIndex: vi.fn(),
}))

import { openIndex, reconcileIndex } from '@reflect/core'
import { createGraphIndex } from './graph-index'

const mockOpen = vi.mocked(openIndex)
const mockReconcile = vi.mocked(reconcileIndex)

beforeEach(() => {
  mockOpen.mockReset()
  mockReconcile.mockReset()
})

describe('createGraphIndex', () => {
  it('open() returns true when the index opens', async () => {
    mockOpen.mockResolvedValue(undefined)
    expect(await createGraphIndex().open()).toBe(true)
  })

  it('open() returns false and reports the failure (editing is never blocked)', async () => {
    const onError = vi.fn()
    mockOpen.mockRejectedValue(new Error('boom'))
    expect(await createGraphIndex({ onError }).open()).toBe(false)
    expect(onError).toHaveBeenCalledWith('open', expect.any(Error))
  })

  it('reconcile() passes an abort signal, and stop() aborts it then waits to settle', async () => {
    let captured: AbortSignal | undefined
    let settle: () => void = () => {}
    mockReconcile.mockImplementation((options) => {
      captured = options?.signal
      return new Promise<void>((resolve) => {
        settle = resolve
      })
    })

    const index = createGraphIndex()
    index.reconcile()
    expect(captured).toBeInstanceOf(AbortSignal)
    expect(captured?.aborted).toBe(false)

    const stopped = index.stop()
    expect(captured?.aborted).toBe(true) // aborted synchronously

    let resolved = false
    void stopped.then(() => {
      resolved = true
    })
    await Promise.resolve()
    expect(resolved).toBe(false) // stop() is still awaiting the reconcile

    settle()
    await stopped
  })

  it('stop() before any reconcile resolves immediately', async () => {
    await expect(createGraphIndex().stop()).resolves.toBeUndefined()
  })

  it('reports a reconcile failure yet stop() still settles', async () => {
    const onError = vi.fn()
    mockReconcile.mockRejectedValue(new Error('reconcile boom'))
    const index = createGraphIndex({ onError })
    index.reconcile()
    await index.stop()
    expect(onError).toHaveBeenCalledWith('reconcile', expect.any(Error))
  })
})
