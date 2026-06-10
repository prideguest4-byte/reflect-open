import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTitleRenameTracker, type TitleRename } from './title-rename'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

function tracked() {
  const renames: TitleRename[] = []
  const tracker = createTitleRenameTracker({
    path: 'notes/x.md',
    quietMs: 5000,
    onRename: (rename) => renames.push(rename),
  })
  return { tracker, renames }
}

describe('createTitleRenameTracker', () => {
  it('fires after the quiet period once a saved title differs from baseline', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# Old Title\n')
    tracker.saved('# New Title\n')
    expect(renames).toEqual([])
    vi.advanceTimersByTime(5000)
    expect(renames).toEqual([
      { from: 'Old Title', to: 'New Title', previousAutoAlias: null, content: '# New Title\n' },
    ])
  })

  it('re-arms on every save: intermediate titles never fire', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# My Note\n')
    tracker.saved('# My N\n') // mid-edit garbage state
    vi.advanceTimersByTime(4000)
    tracker.saved('# My Notebook\n')
    vi.advanceTimersByTime(4999)
    expect(renames).toEqual([])
    vi.advanceTimersByTime(1)
    expect(renames).toHaveLength(1)
    expect(renames[0]).toMatchObject({ from: 'My Note', to: 'My Notebook' })
  })

  it('settle fires the pending rename immediately', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# A\n')
    tracker.saved('# B\n')
    tracker.settle()
    expect(renames).toHaveLength(1)
    tracker.settle() // nothing pending — no double fire
    expect(renames).toHaveLength(1)
  })

  it('a reverted title clears the pending rename', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# A\n')
    tracker.saved('# B\n')
    tracker.saved('# A\n') // changed their mind
    vi.advanceTimersByTime(10_000)
    tracker.settle()
    expect(renames).toEqual([])
  })

  it('a pure case change is not a rename (resolution is case-insensitive)', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# my note\n')
    tracker.saved('# My Note\n')
    vi.advanceTimersByTime(10_000)
    expect(renames).toEqual([])
  })

  it('external content re-baselines without firing and resets the alias chain', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# A\n')
    tracker.saved('# B\n')
    tracker.baseline('# C\n') // external edit adopted mid-quiet-period
    vi.advanceTimersByTime(10_000)
    expect(renames).toEqual([])
    tracker.saved('# D\n')
    tracker.settle()
    expect(renames).toEqual([
      { from: 'C', to: 'D', previousAutoAlias: null, content: '# D\n' },
    ])
  })

  it('chained renames carry the previous auto-alias for pruning', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# First\n')
    tracker.saved('# Second\n')
    tracker.settle()
    tracker.saved('# Third\n')
    tracker.settle()
    expect(renames).toEqual([
      { from: 'First', to: 'Second', previousAutoAlias: null, content: '# Second\n' },
      { from: 'Second', to: 'Third', previousAutoAlias: 'First', content: '# Third\n' },
    ])
  })

  it('derives the title from frontmatter when present', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('---\ntitle: Real Title\n---\n# Heading\n')
    tracker.saved('---\ntitle: Renamed\n---\n# Heading\n')
    tracker.settle()
    expect(renames[0]).toMatchObject({ from: 'Real Title', to: 'Renamed' })
  })

  it('does nothing after dispose', () => {
    const { tracker, renames } = tracked()
    tracker.baseline('# A\n')
    tracker.saved('# B\n')
    tracker.dispose()
    vi.advanceTimersByTime(10_000)
    tracker.settle()
    expect(renames).toEqual([])
  })
})
