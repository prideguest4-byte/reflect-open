import { beforeEach, describe, expect, it, vi } from 'vitest'
import { appendToDailyNote } from './audio-memo'
import { readNote, writeNote } from '../graph/commands'

vi.mock('../graph/commands', () => ({
  readNote: vi.fn(),
  writeNote: vi.fn(),
}))

const readNoteMock = vi.mocked(readNote)
const writeNoteMock = vi.mocked(writeNote)

beforeEach(() => {
  readNoteMock.mockReset()
  writeNoteMock.mockReset()
  writeNoteMock.mockResolvedValue(undefined)
})

describe('appendToDailyNote', () => {
  it('appends to the existing daily note, pinned to the generation', async () => {
    readNoteMock.mockResolvedValue('morning thoughts\n')

    await appendToDailyNote({ date: '2026-06-11', text: 'memo text', generation: 7 })

    expect(readNoteMock).toHaveBeenCalledWith('daily/2026-06-11.md')
    expect(writeNoteMock).toHaveBeenCalledWith(
      'daily/2026-06-11.md',
      'morning thoughts\n\nmemo text\n',
      7,
    )
  })

  it('creates the note when the day has none yet', async () => {
    readNoteMock.mockRejectedValue({ kind: 'notFound', message: 'no such note' })

    await appendToDailyNote({ date: '2026-06-11', text: 'memo text', generation: 7 })

    expect(writeNoteMock).toHaveBeenCalledWith('daily/2026-06-11.md', 'memo text\n', 7)
  })

  it('rethrows read failures other than notFound and never writes', async () => {
    readNoteMock.mockRejectedValue({ kind: 'io', message: 'disk gone' })

    await expect(
      appendToDailyNote({ date: '2026-06-11', text: 'memo text', generation: 7 }),
    ).rejects.toMatchObject({ kind: 'io' })
    expect(writeNoteMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid date before any file access', async () => {
    await expect(
      appendToDailyNote({ date: 'not-a-date', text: 'memo text', generation: 7 }),
    ).rejects.toThrow()
    expect(readNoteMock).not.toHaveBeenCalled()
    expect(writeNoteMock).not.toHaveBeenCalled()
  })
})
