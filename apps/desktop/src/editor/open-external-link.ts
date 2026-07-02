import type { LinkClickHandler } from '@meowdown/core'
import { openUrl } from '@tauri-apps/plugin-opener'
import { dispatchDeepLink } from '@/lib/deep-links/intake'
import { isDeepLinkUrl } from '@/lib/deep-links/parse'

/**
 * Open a rendered Markdown link in the OS browser instead of letting the click
 * navigate the app's WebView frame. The static `MarkdownView` surfaces aren't
 * contenteditable, so an `<a href>` click would otherwise unload the whole app.
 * A `reflect://` link routes through the in-app deep-link pipeline instead —
 * the OS opener denies the scheme.
 */
export const openExternalLink: LinkClickHandler = ({ href, event }) => {
  event.preventDefault()
  if (isDeepLinkUrl(href)) {
    dispatchDeepLink(href)
    return
  }
  if (/^https?:\/\//i.test(href)) {
    void openUrl(href)
  }
}
