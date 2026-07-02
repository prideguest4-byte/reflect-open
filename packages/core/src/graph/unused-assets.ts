import { db } from '../indexing/db'
import { listDir } from './commands'
import { DESCRIPTION_SUFFIX, isAssetPath } from './paths'
import type { FileMeta } from './schemas'

/**
 * The files under `assets/` that no note links to, largest first — deleting
 * a link (or a save that outlived its note) leaves the file behind, and on a
 * server that invisibility was permanent; here the orphans are plain files
 * a report can show. Managed `.reflect.md` description sidecars are never
 * listed themselves: one follows its asset's fate (Plan 20 reconcile removes
 * a description whose asset is gone).
 *
 * Reads the index `assets` projection, so a listing taken mid-edit can lag
 * the watcher by a debounce — callers surface results for an explicit,
 * per-file decision, never for automatic deletion.
 */
export async function unusedAssets(generation: number): Promise<FileMeta[]> {
  const [files, referencedRows] = await Promise.all([
    listDir('assets', generation),
    db.selectFrom('assets').select('assetPath').distinct().execute(),
  ])
  const referenced = new Set(referencedRows.map((row) => row.assetPath))
  return files
    .filter(
      (file) =>
        isAssetPath(file.path) &&
        !file.path.endsWith(DESCRIPTION_SUFFIX) &&
        !referenced.has(file.path),
    )
    .sort((left, right) => right.size - left.size)
}
