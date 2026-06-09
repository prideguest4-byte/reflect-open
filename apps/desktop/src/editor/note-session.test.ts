import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createNoteSession, type NoteSessionSnapshot } from './note-session'
import type { RoundTripFidelity } from './roundtrip'

/**
 * Direct tests of the document state machine, no React. The full pipeline
 * (load, debounce, echo detection, conflict parking, protection) is covered
 * end-to-end through the hook in `use-note-document.test.tsx`; these pin the
 * session-level contracts the hook can't observe directly.
 */

interface Harness {
  snapshots: NoteSessionSnapshot[]
  writes: Array<{ path: string; contents: string }>
  setDisk: (contents: string) => void
  session: ReturnType<typeof createNoteSession>
}

function harness(options?: {
  write?: false
  classify?: (markdown: string) => RoundTripFidelity
}): Harness {
  const snapshots: NoteSessionSnapshot[] = []
  const writes: Array<{ path: string; contents: string }> = []
  let disk = '# Hello\n'
  const session = createNoteSession({
    path: 'notes/a.md',
    io: {
      read: async () => disk,
      write:
        options?.write === false
          ? null
          : async (path, contents) => {
              writes.push({ path, contents })
              disk = contents
            },
    },
    classify: options?.classify ?? (() => 'exact'),
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    applyContent: () => {},
    saveDebounceMs: 10,
  })
  return {
    snapshots,
    writes,
    setDisk: (contents) => {
      disk = contents
    },
    session,
  }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function settled(): Promise<void> {
  await vi.advanceTimersByTimeAsync(50)
}

describe('createNoteSession', () => {
  it('tracks dirtiness but never writes without a write capability', async () => {
    const { session, writes, snapshots } = harness({ write: false })
    session.load()
    await settled()

    session.editorChanged('# Edited\n')
    session.flush()
    await settled()

    expect(writes).toEqual([])
    expect(snapshots.at(-1)?.dirty).toBe(true) // edits are not silently "clean"
  })

  it('dispose flushes the pending edit but emits no further snapshots', async () => {
    const { session, writes, snapshots } = harness()
    session.load()
    await settled()

    session.editorChanged('# Final\n')
    const emittedBeforeDispose = snapshots.length
    session.dispose()
    await settled()

    expect(writes).toEqual([{ path: 'notes/a.md', contents: '# Final\n' }])
    expect(snapshots.length).toBe(emittedBeforeDispose)
  })

  it('does not re-emit identical snapshots', async () => {
    const { session, snapshots } = harness()
    session.load()
    await vi.advanceTimersByTimeAsync(0)

    const afterLoad = snapshots.length
    session.editorChanged('# Same edit\n')
    session.editorChanged('# Same edit\n')
    expect(snapshots.length).toBe(afterLoad + 1) // one dirty transition, not two
  })

  it('keepMine rewrites the file even when the conflict content equals the buffer', async () => {
    const { session, writes, snapshots, setDisk } = harness()
    session.load()
    await settled()

    // The user types X while the same X lands on disk externally (e.g. another
    // device synced the identical edit). The external content parks as a
    // conflict; "keep mine" must still persist deterministically.
    session.editorChanged('# Same on both\n')
    setDisk('# Same on both\n')
    session.externalChanged()
    await settled()
    expect(snapshots.at(-1)?.conflict).toBe('# Same on both\n')
    expect(writes).toEqual([]) // parked conflict paused the debounced save

    session.keepMine()
    await settled()
    expect(writes).toEqual([{ path: 'notes/a.md', contents: '# Same on both\n' }])
    expect(snapshots.at(-1)?.conflict).toBeNull()
    expect(snapshots.at(-1)?.dirty).toBe(false)
  })

  it('re-gates protection when external content stops being representable', async () => {
    const lossyWhenTasks = (markdown: string): RoundTripFidelity =>
      markdown.includes('- [ ]') ? 'lossy' : 'exact'
    const { session, snapshots, setDisk } = harness({ classify: lossyWhenTasks })
    session.load()
    await settled()
    expect(snapshots.at(-1)?.protected).toBe(false)

    setDisk('- [ ] now has tasks\n')
    session.externalChanged()
    await settled()
    expect(snapshots.at(-1)?.protected).toBe(true)
    expect(snapshots.at(-1)?.initialContent).toBe('- [ ] now has tasks\n')
  })
})
