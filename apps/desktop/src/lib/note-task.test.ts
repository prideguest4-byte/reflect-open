import { TaskStaleError } from '@reflect/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteTask, editTask, NoteBusyError, toggleTask } from './note-task'

const openSession = vi.hoisted(() => vi.fn())
vi.mock('@/editor/open-documents', () => ({ openSession }))

const readNote = vi.hoisted(() => vi.fn())
const writeNote = vi.hoisted(() => vi.fn())
vi.mock('@reflect/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@reflect/core')>()),
  readNote,
  writeNote,
}))

// The marker `[` sits at offset 2 of `- [ ] do it`.
const task = { notePath: 'notes/a.md', markerOffset: 2, raw: '[ ] do it' }

beforeEach(() => {
  openSession.mockReset()
  readNote.mockReset()
  writeNote.mockReset()
})

describe('toggleTask', () => {
  it('writes the toggled marker to disk when the note is not open', async () => {
    openSession.mockReturnValue(null)
    readNote.mockResolvedValue('- [ ] do it\n')
    writeNote.mockResolvedValue(undefined)

    await toggleTask(task, 7)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '- [x] do it\n', 7)
  })

  it('routes through the live session whenever the note is open — never disk', async () => {
    // No isDirty gate: an open note always goes through the session, which reads
    // its buffer synchronously, so there is no read/write race with the editor.
    const commitTaskToggle = vi.fn().mockResolvedValue(true)
    openSession.mockReturnValue({ commitTaskToggle })

    await toggleTask(task, 7)
    expect(commitTaskToggle).toHaveBeenCalledWith({ markerOffset: 2, raw: '[ ] do it' })
    expect(writeNote).not.toHaveBeenCalled()
    expect(readNote).not.toHaveBeenCalled()
  })

  it('throws NoteBusyError when the session declines, never clobbering via disk', async () => {
    const commitTaskToggle = vi.fn().mockResolvedValue(false)
    openSession.mockReturnValue({ commitTaskToggle })

    await expect(toggleTask(task, 7)).rejects.toBeInstanceOf(NoteBusyError)
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('propagates TaskStaleError from the disk path when the index is stale', async () => {
    openSession.mockReturnValue(null)
    readNote.mockResolvedValue('- [ ] something else entirely\n')

    await expect(toggleTask(task, 7)).rejects.toBeInstanceOf(TaskStaleError)
    expect(writeNote).not.toHaveBeenCalled()
  })
})

describe('editTask', () => {
  it('writes the rewritten content to disk when the note is not open', async () => {
    openSession.mockReturnValue(null)
    readNote.mockResolvedValue('- [ ] do it\n')
    writeNote.mockResolvedValue(undefined)

    await editTask(task, 'do it well', 7)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '- [ ] do it well\n', 7)
  })

  it('routes the new content through the live session when the note is open', async () => {
    const commitTaskEdit = vi.fn().mockResolvedValue(true)
    openSession.mockReturnValue({ commitTaskEdit })

    await editTask(task, 'do it well', 7)
    expect(commitTaskEdit).toHaveBeenCalledWith({ markerOffset: 2, raw: '[ ] do it' }, 'do it well')
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('throws NoteBusyError when the session declines, never clobbering via disk', async () => {
    openSession.mockReturnValue({ commitTaskEdit: vi.fn().mockResolvedValue(false) })
    await expect(editTask(task, 'x', 7)).rejects.toBeInstanceOf(NoteBusyError)
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('propagates TaskStaleError from the disk path when the index is stale', async () => {
    openSession.mockReturnValue(null)
    readNote.mockResolvedValue('- [ ] something else entirely\n')
    await expect(editTask(task, 'x', 7)).rejects.toBeInstanceOf(TaskStaleError)
    expect(writeNote).not.toHaveBeenCalled()
  })
})

describe('deleteTask', () => {
  it('removes the task line on disk when the note is not open', async () => {
    openSession.mockReturnValue(null)
    readNote.mockResolvedValue('- [ ] do it\n- [ ] keep\n')
    writeNote.mockResolvedValue(undefined)

    await deleteTask(task, 7)
    expect(writeNote).toHaveBeenCalledWith('notes/a.md', '- [ ] keep\n', 7)
  })

  it('routes through the live session when the note is open', async () => {
    const commitTaskRemove = vi.fn().mockResolvedValue(true)
    openSession.mockReturnValue({ commitTaskRemove })

    await deleteTask(task, 7)
    expect(commitTaskRemove).toHaveBeenCalledWith({ markerOffset: 2, raw: '[ ] do it' })
    expect(writeNote).not.toHaveBeenCalled()
  })

  it('throws NoteBusyError when the session declines, never clobbering via disk', async () => {
    openSession.mockReturnValue({ commitTaskRemove: vi.fn().mockResolvedValue(false) })
    await expect(deleteTask(task, 7)).rejects.toBeInstanceOf(NoteBusyError)
    expect(writeNote).not.toHaveBeenCalled()
  })
})
