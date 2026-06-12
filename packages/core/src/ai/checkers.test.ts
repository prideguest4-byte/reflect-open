import { describe, expect, it } from 'vitest'
import { assertCloudAllowed, isPrivateNoteError, PrivateNoteError } from './checkers'

describe('assertCloudAllowed', () => {
  it('passes a non-private note through', () => {
    expect(() => assertCloudAllowed({ path: 'notes/a.md', isPrivate: false })).not.toThrow()
  })

  it('throws PrivateNoteError for a private note', () => {
    expect(() => assertCloudAllowed({ path: 'notes/secret.md', isPrivate: true })).toThrow(
      PrivateNoteError,
    )
  })
})

describe('isPrivateNoteError', () => {
  it('recognizes the thrown refusal', () => {
    try {
      assertCloudAllowed({ path: 'notes/secret.md', isPrivate: true })
      expect.unreachable('should have thrown')
    } catch (cause) {
      expect(isPrivateNoteError(cause)).toBe(true)
    }
  })

  it('rejects other errors', () => {
    expect(isPrivateNoteError(new Error('boom'))).toBe(false)
    expect(isPrivateNoteError(null)).toBe(false)
  })
})
