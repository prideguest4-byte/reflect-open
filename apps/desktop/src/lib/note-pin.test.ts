import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NoteSession } from '@/editor/note-session'

const readNote = vi.hoisted(() => vi.fn<(path: string) => Promise<string>>())
const writeNote = vi.hoisted(() => vi.fn(async () => {}))
const openSession = vi.hoisted(() => vi.fn<(path: string) => NoteSession | null>(() => null))

vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  readNote,
  writeNote,
}))
vi.mock('@/editor/open-documents', () => ({ openSession }))

const { toggleNotePinned } = await import('./note-pin')

beforeEach(() => {
  readNote.mockReset()
  writeNote.mockClear()
  openSession.mockReset()
  openSession.mockReturnValue(null)
})

function fakeSession(content: string, canPatch = true) {
  const updateFrontmatter = vi.fn(() => canPatch)
  const flush = vi.fn(async () => {})
  const session = { content: () => content, updateFrontmatter, flush } as unknown as NoteSession
  return { session, updateFrontmatter, flush }
}

describe('toggleNotePinned', () => {
  it('pins an unopened note via read-patch-write on disk', async () => {
    readNote.mockResolvedValue('# A\n')
    await expect(toggleNotePinned('notes/a.md', 3)).resolves.toBe(true)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '---\npinned: true\n---\n# A\n', 3)
  })

  it('unpins on disk by removing the key (back to no frontmatter)', async () => {
    readNote.mockResolvedValue('---\npinned: true\n---\n# A\n')
    await expect(toggleNotePinned('notes/a.md', 3)).resolves.toBe(false)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '# A\n', 3)
  })

  it('routes through the live session and flushes, never racing the disk', async () => {
    const { session, updateFrontmatter, flush } = fakeSession('# A\n')
    openSession.mockReturnValue(session)
    await expect(toggleNotePinned('notes/a.md', 3)).resolves.toBe(true)
    expect(updateFrontmatter).toHaveBeenCalledWith({ pinned: true })
    expect(flush).toHaveBeenCalled()
    expect(readNote).not.toHaveBeenCalled()
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('toggles off through the session when the open note is pinned', async () => {
    const { session, updateFrontmatter } = fakeSession('---\npinned: true\n---\n# A\n')
    openSession.mockReturnValue(session)
    await expect(toggleNotePinned('notes/a.md', 3)).resolves.toBe(false)
    expect(updateFrontmatter).toHaveBeenCalledWith({ pinned: false })
  })

  it('falls back to disk when the session cannot take the patch', async () => {
    const { session } = fakeSession('# A\n', false)
    openSession.mockReturnValue(session)
    readNote.mockResolvedValue('# A\n')
    await expect(toggleNotePinned('notes/a.md', 3)).resolves.toBe(true)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '---\npinned: true\n---\n# A\n', 3)
  })
})
