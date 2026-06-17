import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { gatherAssetDescriptionText, MAX_ASSET_TEXT_CHARS } from './asset-description-text'

/** The `asset_descriptions` entity rows the fold reads, keyed by asset path. */
const descriptions = new Map<string, string>()

beforeEach(() => {
  descriptions.clear()
  setBridge({
    invoke: async (command) => {
      if (command === 'db_query') {
        // The gather selects (assetPath, description); return the whole entity —
        // the gather looks up only the paths it was asked about.
        return [...descriptions].map(([assetPath, description]) => ({ assetPath, description }))
      }
      return null
    },
    listen: async () => () => {},
  })
})

afterEach(() => {
  setBridge(null)
})

describe('gatherAssetDescriptionText', () => {
  it('returns empty for no assets', async () => {
    expect(await gatherAssetDescriptionText([])).toBe('')
  })

  it("joins the descriptions of a note's assets, in reference order", async () => {
    descriptions.set('assets/b.pdf', 'Q4 revenue report.')
    descriptions.set('assets/a.png', 'A flow diagram of the pipeline.')

    const text = await gatherAssetDescriptionText(['assets/a.png', 'assets/b.pdf'])

    expect(text).toBe('A flow diagram of the pipeline.\n\nQ4 revenue report.')
  })

  it('skips assets with no entity row (undescribed)', async () => {
    descriptions.set('assets/a.png', 'Described.')
    expect(await gatherAssetDescriptionText(['assets/a.png', 'assets/b.pdf'])).toBe('Described.')
  })

  it('folds an asset referenced twice only once', async () => {
    descriptions.set('assets/a.png', 'Once.')
    expect(await gatherAssetDescriptionText(['assets/a.png', 'assets/a.png'])).toBe('Once.')
  })

  it('caps the combined text', async () => {
    descriptions.set('assets/a.png', 'x'.repeat(MAX_ASSET_TEXT_CHARS + 5_000))
    const text = await gatherAssetDescriptionText(['assets/a.png'])
    expect(text.length).toBe(MAX_ASSET_TEXT_CHARS)
  })
})
