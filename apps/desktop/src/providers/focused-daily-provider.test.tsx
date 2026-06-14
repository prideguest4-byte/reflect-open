import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'
import {
  FocusedDailyProvider,
  useFocusedDailyDate,
  useSetFocusedDailyDate,
} from './focused-daily-provider'

function wrapper({ children }: { children: ReactNode }) {
  return <FocusedDailyProvider>{children}</FocusedDailyProvider>
}

function useFocusedDaily() {
  return { date: useFocusedDailyDate(), set: useSetFocusedDailyDate() }
}

describe('FocusedDailyProvider', () => {
  it('reads back the focused day, and clears it with null', () => {
    const { result } = renderHook(useFocusedDaily, { wrapper })
    expect(result.current.date).toBeNull()

    act(() => result.current.set('2026-06-01'))
    expect(result.current.date).toBe('2026-06-01')

    act(() => result.current.set(null))
    expect(result.current.date).toBeNull()
  })

  it('defaults to null with a no-op setter when no provider is mounted', () => {
    const { result } = renderHook(useFocusedDaily)
    expect(result.current.date).toBeNull()
    expect(() => act(() => result.current.set('2026-06-01'))).not.toThrow()
    expect(result.current.date).toBeNull()
  })
})
