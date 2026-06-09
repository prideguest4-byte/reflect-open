import { describe, expect, it } from 'vitest'
import { foldKey } from './keys'

describe('foldKey', () => {
  it('trims and lowercases', () => {
    expect(foldKey('  Project X  ')).toBe('project x')
  })

  it('is idempotent', () => {
    const once = foldKey('  Charlotte ')
    expect(foldKey(once)).toBe(once)
  })

  it('leaves an already-folded key unchanged', () => {
    expect(foldKey('charlotte')).toBe('charlotte')
  })
})
