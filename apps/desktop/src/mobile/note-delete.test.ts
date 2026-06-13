import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteOpenNote } from './note-delete'

/**
 * `deleteOpenNote` suspends the live session before deleting, then either
 * commits the no-flush detach or rolls the session back to normal saving.
 */

const deleteNoteMock = vi.fn<(path: string, generation: number) => Promise<void>>()
const commitDelete = vi.fn()
const rollbackDelete = vi.fn()
const beginDelete = vi.fn<
  () => Promise<{ commit: () => void; rollback: () => void }>
>()
const openSessionMock = vi.fn<
  (path: string) => { beginDelete: () => Promise<{ commit: () => void; rollback: () => void }> } | null
>()

vi.mock('@reflect/core', () => ({
  deleteNote: (path: string, generation: number) => deleteNoteMock(path, generation),
}))
vi.mock('@/editor/open-documents', () => ({
  openSession: (path: string) => openSessionMock(path),
}))

afterEach(() => {
  deleteNoteMock.mockReset()
  beginDelete.mockReset()
  commitDelete.mockReset()
  rollbackDelete.mockReset()
  openSessionMock.mockReset()
})

describe('deleteOpenNote', () => {
  it('commits the open session delete guard after a successful delete', async () => {
    deleteNoteMock.mockResolvedValue()
    beginDelete.mockResolvedValue({ commit: commitDelete, rollback: rollbackDelete })
    openSessionMock.mockReturnValue({ beginDelete })

    await deleteOpenNote('notes/gone.md', 3)

    expect(beginDelete).toHaveBeenCalledOnce()
    expect(deleteNoteMock).toHaveBeenCalledWith('notes/gone.md', 3)
    expect(commitDelete).toHaveBeenCalledOnce()
    expect(rollbackDelete).not.toHaveBeenCalled()
  })

  it('waits for in-flight writes to settle before deleting', async () => {
    let releaseDeleteGuard = (): void => {}
    beginDelete.mockReturnValue(
      new Promise((resolve) => {
        releaseDeleteGuard = () => resolve({ commit: commitDelete, rollback: rollbackDelete })
      }),
    )
    openSessionMock.mockReturnValue({ beginDelete })
    deleteNoteMock.mockResolvedValue()

    const deleting = deleteOpenNote('notes/gone.md', 3)
    await Promise.resolve()
    expect(deleteNoteMock).not.toHaveBeenCalled()

    releaseDeleteGuard()
    await deleting
    expect(deleteNoteMock).toHaveBeenCalledWith('notes/gone.md', 3)
  })

  it('rolls back the session guard when the delete fails', async () => {
    deleteNoteMock.mockRejectedValue(new Error('disk full'))
    beginDelete.mockResolvedValue({ commit: commitDelete, rollback: rollbackDelete })
    openSessionMock.mockReturnValue({ beginDelete })

    await expect(deleteOpenNote('notes/gone.md', 3)).rejects.toThrow('disk full')

    // The session resumes saving — the screen stays editable.
    expect(rollbackDelete).toHaveBeenCalledOnce()
    expect(commitDelete).not.toHaveBeenCalled()
  })
})
