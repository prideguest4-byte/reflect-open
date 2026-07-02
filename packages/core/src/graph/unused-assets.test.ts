import { afterEach, describe, expect, it, vi } from 'vitest'
import { setBridge } from '../ipc/bridge'
import { unusedAssets } from './unused-assets'

afterEach(() => {
  setBridge(null)
})

function meta(path: string, size: number) {
  return { path, size, modifiedMs: 1 }
}

describe('unusedAssets', () => {
  it('lists unreferenced assets/ files, largest first, skipping description sidecars', async () => {
    const invoke = vi.fn(async (command: string) => {
      if (command === 'dir_list') {
        return [
          meta('assets/linked.png', 10),
          meta('assets/orphan-small.pdf', 5),
          meta('assets/orphan-big.mov', 900),
          meta('assets/orphan-big.mov.reflect.md', 1),
          meta('assets/linked.png.reflect.md', 1),
        ]
      }
      if (command === 'db_query') {
        return [{ asset_path: 'assets/linked.png' }]
      }
      return null
    })
    setBridge({ invoke, listen: async () => () => {} })

    const files = await unusedAssets(7)

    expect(files.map((file) => file.path)).toEqual([
      'assets/orphan-big.mov',
      'assets/orphan-small.pdf',
    ])
    expect(invoke).toHaveBeenCalledWith('dir_list', { dir: 'assets', generation: 7 })
  })

  it('reports an empty graph as having no unused assets', async () => {
    const invoke = vi.fn(async (command: string) => (command === 'dir_list' ? [] : []))
    setBridge({ invoke, listen: async () => () => {} })
    await expect(unusedAssets(7)).resolves.toEqual([])
  })
})
