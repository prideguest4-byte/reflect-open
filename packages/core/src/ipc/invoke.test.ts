import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { isAppError } from '../errors'
import { setBridge } from './bridge'
import { call } from './invoke'

afterEach(() => {
  setBridge(null)
})

describe('call', () => {
  it('returns the schema-validated response', async () => {
    const invoke = vi.fn().mockResolvedValue({ root: '/g', generation: 1 })
    setBridge({ invoke, listen: async () => () => {} })

    const schema = z.object({ root: z.string(), generation: z.number() })
    await expect(call('graph_open', { path: '/g' }, schema)).resolves.toEqual({
      root: '/g',
      generation: 1,
    })
    expect(invoke).toHaveBeenCalledWith('graph_open', { path: '/g' })
  })

  it('passes a well-formed Rust error through as an AppError', async () => {
    setBridge({
      invoke: async () => {
        throw { kind: 'notFound', message: 'missing' }
      },
      listen: async () => () => {},
    })

    const error = await call('note_read', { path: 'x' }, z.string()).catch(
      (caught: unknown) => caught,
    )
    expect(isAppError(error)).toBe(true)
    expect(error).toEqual({ kind: 'notFound', message: 'missing' })
  })

  it('coerces a foreign rejection into an unknown AppError', async () => {
    setBridge({
      invoke: async () => {
        throw new Error('socket closed')
      },
      listen: async () => () => {},
    })

    const error = await call('note_read', { path: 'x' }, z.string()).catch(
      (caught: unknown) => caught,
    )
    expect(error).toEqual({ kind: 'unknown', message: 'socket closed' })
  })

  it('turns a response that fails validation into a parse error naming the command', async () => {
    setBridge({ invoke: async () => ({ wrong: true }), listen: async () => () => {} })

    const error = await call('graph_open', {}, z.string()).catch((caught: unknown) => caught)
    expect(isAppError(error)).toBe(true)
    if (isAppError(error)) {
      expect(error.kind).toBe('parse')
      expect(error.message).toContain('graph_open')
    }
  })

  it('fails loudly when no bridge is installed', async () => {
    await expect(call('anything', {}, z.unknown())).rejects.toThrow(/no ipc bridge/i)
  })
})
