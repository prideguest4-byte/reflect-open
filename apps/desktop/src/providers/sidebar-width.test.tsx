import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidebarWidthEffect } from './sidebar-width'

const settingsState = vi.hoisted(() => ({ sidebarWidth: 260, contextSidebarWidth: 320 }))

vi.mock('@/providers/settings-provider', () => ({
  useSettings: () => ({ settings: settingsState }),
}))

function rootVariable(name: string): string {
  return document.documentElement.style.getPropertyValue(name)
}

afterEach(() => {
  cleanup()
  document.documentElement.style.removeProperty('--sidebar-width')
  document.documentElement.style.removeProperty('--context-sidebar-width')
  settingsState.sidebarWidth = 260
  settingsState.contextSidebarWidth = 320
})

describe('SidebarWidthEffect', () => {
  it('mirrors the live settings onto the document root', async () => {
    const view = render(<SidebarWidthEffect />)
    await waitFor(() => expect(rootVariable('--sidebar-width')).toBe('260px'))
    expect(rootVariable('--context-sidebar-width')).toBe('320px')

    settingsState.sidebarWidth = 340
    settingsState.contextSidebarWidth = 400
    view.rerender(<SidebarWidthEffect />)

    await waitFor(() => expect(rootVariable('--sidebar-width')).toBe('340px'))
    expect(rootVariable('--context-sidebar-width')).toBe('400px')
  })

  it('removes the overrides on unmount so the token defaults apply', async () => {
    const view = render(<SidebarWidthEffect />)
    await waitFor(() => expect(rootVariable('--sidebar-width')).toBe('260px'))

    view.unmount()

    expect(rootVariable('--sidebar-width')).toBe('')
    expect(rootVariable('--context-sidebar-width')).toBe('')
  })
})
