import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openUrl } from '@tauri-apps/plugin-opener'
import { dispatchDeepLink } from '@/lib/deep-links/intake'
import { openExternalLink } from '@/editor/open-external-link'

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: vi.fn(async () => {}),
}))

vi.mock('@/lib/deep-links/intake', () => ({
  dispatchDeepLink: vi.fn(),
}))

function click(href: string): MouseEvent {
  const event = new MouseEvent('click', { cancelable: true })
  openExternalLink({ href, event })
  return event
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('openExternalLink', () => {
  it('opens an http(s) link in the OS browser and blocks the frame navigation', () => {
    const event = click('https://example.com')

    expect(openUrl).toHaveBeenCalledWith('https://example.com')
    expect(event.defaultPrevented).toBe(true)
  })

  it('routes a reflect:// link through the in-app deep-link intake, not the URL opener', () => {
    click('reflect://note/abc123')

    expect(dispatchDeepLink).toHaveBeenCalledWith('reflect://note/abc123')
    expect(openUrl).not.toHaveBeenCalled()
  })

  it('drops other schemes without opening anything', () => {
    const event = click('javascript:alert(1)')

    expect(openUrl).not.toHaveBeenCalled()
    expect(dispatchDeepLink).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })
})
