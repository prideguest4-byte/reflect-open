import { browser, type Browser } from 'wxt/browser'
import { isCapturableUrl, type CapturedPage } from './capture-message'

/**
 * The result of trying to snapshot the active tab for capture.
 */
export type CapturedPageState =
  | { status: 'uncapturable' }
  | { status: 'ready'; page: CapturedPage; tabId: number }

const SCREENSHOT_QUALITY = 85

/**
 * Snapshot a tab: URL + title from the tab, an optional screenshot,
 * and the page's current selection. Chrome-restricted pages degrade to URL +
 * title when possible, and non-http(s) pages are rejected.
 */
export async function snapshotTab(tab: Browser.tabs.Tab | undefined): Promise<CapturedPageState> {
  if (!tab || tab.id === undefined || !isCapturableUrl(tab.url)) {
    return { status: 'uncapturable' }
  }

  let screenshotDataUrl: string | undefined
  try {
    screenshotDataUrl = await browser.tabs.captureVisibleTab({
      format: 'jpeg',
      quality: SCREENSHOT_QUALITY,
    })
  } catch {
    screenshotDataUrl = undefined
  }

  let selection: string | undefined
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? '',
    })
    const text = result?.result
    selection = typeof text === 'string' && text.trim() !== '' ? text : undefined
  } catch {
    selection = undefined
  }

  return {
    status: 'ready',
    page: { url: tab.url, title: tab.title ?? '', screenshotDataUrl, selection },
    tabId: tab.id,
  }
}

/**
 * Snapshot whichever tab is active when the async query runs.
 */
export async function snapshotActiveTab(): Promise<CapturedPageState> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  return snapshotTab(tab)
}
