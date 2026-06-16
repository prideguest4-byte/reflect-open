import { describe, expect, it } from 'vitest'
import type { FileChange } from './file-changes'
import { emitIndexApplied, subscribeIndexApplied } from './index-applied'

const batch: FileChange[] = [{ path: 'assets/a.png', kind: 'upsert', modifiedMs: 1 }]

describe('subscribeIndexApplied', () => {
  it('delivers emitted batches to every subscriber until it unsubscribes', () => {
    const a: FileChange[][] = []
    const b: FileChange[][] = []
    const unsubA = subscribeIndexApplied((changes) => a.push([...changes]))
    const unsubB = subscribeIndexApplied((changes) => b.push([...changes]))

    emitIndexApplied(batch)
    expect(a).toEqual([batch])
    expect(b).toEqual([batch])

    unsubA()
    emitIndexApplied(batch)
    expect(a).toHaveLength(1) // no longer delivered
    expect(b).toHaveLength(2)

    unsubB()
  })

  it('tolerates a listener unsubscribing during emit', () => {
    const seen: number[] = []
    const unsub = subscribeIndexApplied(() => {
      seen.push(1)
      unsub() // remove self mid-emit
    })
    expect(() => emitIndexApplied(batch)).not.toThrow()
    emitIndexApplied(batch)
    expect(seen).toEqual([1]) // fired once, then gone
  })
})
