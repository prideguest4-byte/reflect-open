import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { confirmLargeFile, resetLargeFileConfirms } from '@/lib/large-file-confirm'
import { LargeAttachmentDialog } from './large-attachment-dialog'

function largeFile(name: string, bytes: number): File {
  const file = new File([new Uint8Array(0)], name)
  Object.defineProperty(file, 'size', { value: bytes })
  return file
}

afterEach(() => {
  act(() => resetLargeFileConfirms())
  cleanup()
})

describe('LargeAttachmentDialog', () => {
  it('renders nothing without a pending confirm', () => {
    render(<LargeAttachmentDialog />)
    expect(screen.queryByText('Add large file?')).toBeNull()
  })

  it('names the file, its size, and the git constraint', () => {
    render(<LargeAttachmentDialog />)
    act(() => {
      void confirmLargeFile(largeFile('demo.mov', 132 * 1024 * 1024))
    })
    expect(screen.queryByText('Add large file?')).not.toBeNull()
    expect(screen.queryByText(/“demo\.mov” is 132 MB/)).not.toBeNull()
    expect(screen.queryByText(/100 MB/)).not.toBeNull()
  })

  it('approves on Add file and declines on Cancel', async () => {
    const user = userEvent.setup()
    render(<LargeAttachmentDialog />)

    let approved: Promise<boolean> | null = null
    act(() => {
      approved = confirmLargeFile(largeFile('a.zip', 0))
    })
    await user.click(screen.getByRole('button', { name: 'Add file' }))
    await expect(approved).resolves.toBe(true)

    let declined: Promise<boolean> | null = null
    act(() => {
      declined = confirmLargeFile(largeFile('b.zip', 0))
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(declined).resolves.toBe(false)
  })
})
