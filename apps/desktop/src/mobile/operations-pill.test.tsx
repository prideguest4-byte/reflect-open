import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resetOperations, startOperation, type OperationHandle } from '@/lib/operations'
import { publishKeyboardHeight } from '@/mobile/use-keyboard'
import { MobileOperationsPills } from './operations-pill'
import { MobileStatusLayer } from './status-layer'

/**
 * The mobile face of the operations store: failed/warning background work
 * shows as pills above the tab bar (running work stays silent), a tap
 * dismisses, and the layer yields to the keyboard like the sync pill.
 */

// The layer renders the sync pill too; keep it quiet so these tests only see
// operation pills (its own behavior is covered in sync-status-pill.test.tsx).
vi.mock('@/mobile/use-sync-status', () => ({ useMobileSyncStatus: () => null }))

beforeEach(() => {
  vi.useFakeTimers()
  resetOperations()
})

afterEach(() => {
  cleanup()
  publishKeyboardHeight(0)
  vi.useRealTimers()
})

/** Start an operation inside act so the store emit lands in a React batch. */
function operate(run: () => OperationHandle): OperationHandle {
  let handle: OperationHandle | undefined
  act(() => {
    handle = run()
  })
  return handle!
}

describe('MobileOperationsPills', () => {
  it('renders nothing while operations are merely running', () => {
    render(<MobileOperationsPills />)
    operate(() => startOperation('Completing task'))

    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows a failed operation with its label and message', () => {
    render(<MobileOperationsPills />)
    const handle = operate(() => startOperation('Completing task'))
    act(() => handle.fail('The note is busy.'))

    const pill = screen.getByRole('alert')
    expect(pill.textContent).toContain('Completing task')
    expect(pill.textContent).toContain('The note is busy.')
  })

  it('shows a warning as a status pill', () => {
    render(<MobileOperationsPills />)
    const handle = operate(() => startOperation('Importing notes'))
    act(() => handle.warn('2 files skipped.'))

    expect(screen.getByRole('status').textContent).toContain('2 files skipped.')
  })

  it('dismisses a pill on tap', () => {
    render(<MobileOperationsPills />)
    const handle = operate(() => startOperation('Completing task'))
    act(() => handle.fail('The note is busy.'))

    fireEvent.click(screen.getByRole('alert'))

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('expires with the store’s linger window', () => {
    render(<MobileOperationsPills />)
    const handle = operate(() => startOperation('Completing task'))
    act(() => handle.fail('The note is busy.'))

    act(() => vi.runAllTimers())

    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MobileStatusLayer', () => {
  it('yields to the software keyboard', () => {
    render(<MobileStatusLayer />)
    const handle = operate(() => startOperation('Completing task'))
    act(() => handle.fail('The note is busy.'))
    expect(screen.getByRole('alert')).toBeTruthy()

    act(() => publishKeyboardHeight(300))

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
