import { readDescriptionEntity } from '../actions/asset-description'
import { isAppError } from '../errors'
import { listDir, readNote } from '../graph/commands'
import { ASSETS_DIR, DESCRIPTION_SUFFIX, descriptionPathFor } from '../graph/paths'
import { applyAssetDescription, removeAssetDescription } from './commands'

/**
 * The `asset_descriptions` search-index entity (Plan 20): one row per asset with
 * a Reflect-managed `assets/<x>.reflect.md` sidecar, projected from that sidecar.
 * The note FTS fold reads description text from here (a DB join), the explicit
 * describe pass keeps it current, and a full rebuild repopulates it from the
 * sidecars. Rebuildable — the sidecars (and the markdown graph) stay the source
 * of truth.
 */

/**
 * Reconcile one asset's entity row with its sidecar on disk: upsert from a
 * managed description, or remove the row when the sidecar is missing or
 * user-authored (never indexed). Pinned to `generation` — Rust drops a stale
 * write. Used by the describe pass and the per-asset re-index seam.
 */
export async function reconcileAssetDescriptionRow(
  assetPath: string,
  generation: number,
): Promise<void> {
  let source: string
  try {
    source = await readNote(descriptionPathFor(assetPath), generation)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      await removeAssetDescription(assetPath, generation) // no sidecar — drop any stale row
      return
    }
    throw cause
  }
  const entity = readDescriptionEntity(source)
  if (entity === null) {
    await removeAssetDescription(assetPath, generation) // user-authored / empty — not indexed
    return
  }
  await applyAssetDescription({ assetPath, ...entity }, generation)
}

/**
 * Repopulate the whole `asset_descriptions` projection from the sidecars under
 * `assets/`. Run during a full rebuild **before** notes are indexed, so the note
 * fold can read descriptions from the entity. Reads sidecar markdown only — it
 * never generates descriptions, so it's safe on open. Assumes the table was just
 * cleared (no removes needed); skips user-authored files at the sidecar path.
 */
export async function rebuildAssetDescriptions(options: {
  generation: number
  signal?: AbortSignal | undefined
  isStale?: (() => boolean) | undefined
}): Promise<void> {
  const files = await listDir(ASSETS_DIR, options.generation)
  for (const file of files) {
    if (options.signal?.aborted === true || options.isStale?.() === true) {
      return
    }
    if (!file.path.endsWith(DESCRIPTION_SUFFIX)) {
      continue // only the description sidecars carry text to project
    }
    let source: string
    try {
      source = await readNote(file.path, options.generation)
    } catch {
      continue // vanished between listing and read
    }
    const entity = readDescriptionEntity(source)
    if (entity === null) {
      continue // user-authored markdown at the sidecar path — not ours to index
    }
    const assetPath = file.path.slice(0, -DESCRIPTION_SUFFIX.length)
    await applyAssetDescription({ assetPath, ...entity }, options.generation)
  }
}
