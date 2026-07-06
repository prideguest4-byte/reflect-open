import type { ReactNode } from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MonthPickerDrawer } from './month-picker-drawer'

/**
 * The month title's picker sheet: a year pager over a twelve-month grid.
 * Year browsing must never navigate, each open must start from the header's
 * month, and the selection/today months carry the strip's markings.
 */

// vaul needs browser APIs jsdom doesn't provide (matchMedia, pointer
// capture); its drag/animation is verified on-device. This passthrough
// honours `open` so open/close behavior stays testable.
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? <div data-testid="drawer">{children}</div> : null,
  DrawerContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}))

afterEach(cleanup)

function mount(overrides: Partial<Parameters<typeof MonthPickerDrawer>[0]> = {}) {
  const onPick = vi.fn()
  const view = render(
    <MonthPickerDrawer
      open
      onOpenChange={() => {}}
      month="2026-06"
      selected="2026-06"
      today="2026-07"
      onPick={onPick}
      {...overrides}
    />,
  )
  return { view, onPick }
}

describe('MonthPickerDrawer', () => {
  it('opens on the header month’s year with the selection and today marked', () => {
    mount()

    expect(screen.getByText('2026')).toBeTruthy()
    const months = screen.getAllByRole('button', { name: /2026$/ })
    expect(months).toHaveLength(12)
    expect(
      screen.getByRole('button', { name: 'June 2026' }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(
      screen.getByRole('button', { name: 'July 2026' }).getAttribute('aria-current'),
    ).toBe('date')
  })

  it('picks a month of the shown year', async () => {
    const user = userEvent.setup()
    const { onPick } = mount()

    await user.click(screen.getByRole('button', { name: 'September 2026' }))
    expect(onPick).toHaveBeenCalledWith('2026-09')
  })

  it('pages years without navigating, then picks in the browsed year', async () => {
    const user = userEvent.setup()
    const { onPick } = mount()

    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    await user.click(screen.getByRole('button', { name: 'Previous year' }))
    expect(screen.getByText('2024')).toBeTruthy()
    expect(onPick).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'March 2024' }))
    expect(onPick).toHaveBeenCalledWith('2024-03')
  })

  it('reopens on the header month’s year, not the last browsed one', async () => {
    const user = userEvent.setup()
    const { view } = mount()

    await user.click(screen.getByRole('button', { name: 'Next year' }))
    expect(screen.getByText('2027')).toBeTruthy()

    view.rerender(
      <MonthPickerDrawer
        open={false}
        onOpenChange={() => {}}
        month="2026-06"
        selected="2026-06"
        today="2026-07"
        onPick={() => {}}
      />,
    )
    expect(screen.queryByTestId('drawer')).toBeNull()

    view.rerender(
      <MonthPickerDrawer
        open
        onOpenChange={() => {}}
        month="2026-06"
        selected="2026-06"
        today="2026-07"
        onPick={() => {}}
      />,
    )
    expect(screen.getByText('2026')).toBeTruthy()
  })
})
