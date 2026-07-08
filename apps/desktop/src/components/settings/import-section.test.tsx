import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { V1ImportState } from '@/providers/v1-import-provider'

const open = vi.hoisted(() => vi.fn<() => Promise<string | null>>())
const startImport = vi.hoisted(() => vi.fn())
const importState = vi.hoisted((): { state: V1ImportState } => ({
  state: { phase: 'idle' },
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({ open }))
vi.mock('@/providers/v1-import-provider', () => ({
  useV1Import: () => ({
    state: importState.state,
    startImport,
    cancelImport: vi.fn(),
    dismiss: vi.fn(),
  }),
}))

const { ImportSection } = await import('./import-section')

beforeEach(() => {
  open.mockResolvedValue('/Users/alex/Downloads/reflect-v1.zip')
  importState.state = { phase: 'idle' }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function importButton(): HTMLButtonElement {
  const element = screen.getByRole('button', { name: /import/i })
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('expected button')
  }
  return element
}

describe('ImportSection', () => {
  it('hands the picked Reflect V1 zip to the import controller', async () => {
    render(<ImportSection />)

    fireEvent.click(importButton())

    await waitFor(() =>
      expect(open).toHaveBeenCalledWith({
        multiple: false,
        directory: false,
        title: 'Import Reflect V1 export',
        filters: [{ name: 'Zip archives', extensions: ['zip'] }],
      }),
    )
    await waitFor(() =>
      expect(startImport).toHaveBeenCalledWith('/Users/alex/Downloads/reflect-v1.zip'),
    )
  })

  it('does nothing when the picker is cancelled', async () => {
    open.mockResolvedValueOnce(null)
    render(<ImportSection />)

    fireEvent.click(importButton())

    await waitFor(() => expect(open).toHaveBeenCalledTimes(1))
    expect(startImport).not.toHaveBeenCalled()
  })

  it('is disabled while an import runs', () => {
    importState.state = { phase: 'running', progress: null, cancelling: false }
    render(<ImportSection />)

    expect(importButton().hasAttribute('disabled')).toBe(true)
    expect(importButton().textContent).toContain('Importing')
  })
})
