import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listDir, readNote } from '../graph/commands'
import { applyAssetDescription, removeAssetDescription } from './commands'
import { rebuildAssetDescriptions, reconcileAssetDescriptionRow } from './asset-description-index'

vi.mock('../graph/commands', () => ({
  listDir: vi.fn(),
  readNote: vi.fn(),
}))
vi.mock('./commands', () => ({
  applyAssetDescription: vi.fn(),
  removeAssetDescription: vi.fn(),
}))

const readNoteMock = vi.mocked(readNote)
const listDirMock = vi.mocked(listDir)
const applyMock = vi.mocked(applyAssetDescription)
const removeMock = vi.mocked(removeAssetDescription)

const notFound = (): unknown => ({ kind: 'notFound', message: 'missing' })

/** A Reflect-managed description sidecar for `assetPath`. */
function managed(assetPath: string, body: string): string {
  return [
    '---',
    'reflectAsset: true',
    `source: ${assetPath}`,
    'sourceHash: hash-1',
    'sourceSize: 5',
    'provider: anthropic',
    'model: claude-opus-4-8',
    'generatedAt: 2026-06-16T00:00:00.000Z',
    '---',
    '',
    body,
    '',
  ].join('\n')
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reconcileAssetDescriptionRow', () => {
  it('upserts the entity from a managed sidecar', async () => {
    readNoteMock.mockResolvedValue(managed('assets/a.png', 'A flow diagram.'))

    await reconcileAssetDescriptionRow('assets/a.png', 7)

    expect(readNoteMock).toHaveBeenCalledWith('assets/a.png.reflect.md', 7)
    expect(applyMock).toHaveBeenCalledWith(
      {
        assetPath: 'assets/a.png',
        sourceHash: 'hash-1',
        sourceSize: 5,
        provider: 'anthropic',
        model: 'claude-opus-4-8',
        generatedAt: '2026-06-16T00:00:00.000Z',
        description: 'A flow diagram.',
      },
      7,
    )
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('removes the entity when no sidecar exists', async () => {
    readNoteMock.mockRejectedValue(notFound())

    await reconcileAssetDescriptionRow('assets/a.png', 7)

    expect(removeMock).toHaveBeenCalledWith('assets/a.png', 7)
    expect(applyMock).not.toHaveBeenCalled()
  })

  it('removes the entity for a user-authored sidecar (no managed marker)', async () => {
    readNoteMock.mockResolvedValue('# My own caption\n\nHand-written.\n')

    await reconcileAssetDescriptionRow('assets/a.png', 7)

    expect(removeMock).toHaveBeenCalledWith('assets/a.png', 7)
    expect(applyMock).not.toHaveBeenCalled()
  })
})

describe('rebuildAssetDescriptions', () => {
  it('projects every managed sidecar under assets/, skipping non-sidecars and user-authored files', async () => {
    listDirMock.mockResolvedValue([
      { path: 'assets/a.png', size: 1, modifiedMs: 1 }, // the image itself — not a sidecar
      { path: 'assets/a.png.reflect.md', size: 1, modifiedMs: 1 }, // managed
      { path: 'assets/b.png.reflect.md', size: 1, modifiedMs: 1 }, // user-authored
      { path: 'assets/notes.txt', size: 1, modifiedMs: 1 }, // unrelated
    ])
    readNoteMock.mockImplementation(async (path: string) => {
      if (path === 'assets/a.png.reflect.md') return managed('assets/a.png', 'Described.')
      if (path === 'assets/b.png.reflect.md') return '# Hand-written\n\nnotes\n'
      throw notFound()
    })

    await rebuildAssetDescriptions({ generation: 7 })

    expect(applyMock).toHaveBeenCalledTimes(1)
    expect(applyMock).toHaveBeenCalledWith(
      expect.objectContaining({ assetPath: 'assets/a.png', description: 'Described.' }),
      7,
    )
    expect(removeMock).not.toHaveBeenCalled() // rebuild assumes a cleared table
  })
})
