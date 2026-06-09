import { describe, expect, it } from 'vitest'
import { buildFtsMatch } from './search-query'

describe('buildFtsMatch', () => {
  it('returns null for an empty or whitespace-only query', () => {
    expect(buildFtsMatch('')).toBeNull()
    expect(buildFtsMatch('   \t \n ')).toBeNull()
  })

  it('quotes a single term as a literal phrase', () => {
    expect(buildFtsMatch('hello')).toBe('"hello"')
  })

  it('quotes each term so FTS5 operators are treated as literal text', () => {
    expect(buildFtsMatch('cats AND (dogs*)')).toBe('"cats" "AND" "(dogs*)"')
  })

  it('doubles embedded double-quotes (FTS5 escaping)', () => {
    expect(buildFtsMatch('say "hi"')).toBe('"say" """hi"""')
  })

  it('collapses runs of whitespace between terms', () => {
    expect(buildFtsMatch('  alpha   beta ')).toBe('"alpha" "beta"')
  })
})
