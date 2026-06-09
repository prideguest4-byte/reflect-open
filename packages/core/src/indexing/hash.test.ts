import { describe, expect, it } from 'vitest'
import { hashContent } from './hash'

describe('hashContent', () => {
  it('is deterministic, content-sensitive, and hex-encoded', async () => {
    const a = await hashContent('hello')
    expect(a).toBe(await hashContent('hello'))
    expect(a).not.toBe(await hashContent('hello!'))
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
})
