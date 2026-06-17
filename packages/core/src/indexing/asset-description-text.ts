import { db } from './db'

/**
 * Folding asset descriptions into a note's search text (Plan 20, search
 * integration). A note's referenced assets each may have a managed description
 * (the `asset_descriptions` entity, projected from `<asset>.reflect.md`); their
 * bodies are appended to the note's FTS document so a query matching a
 * description surfaces the note — transparently, as an ordinary hit. The text
 * goes into `search_fts.body` only, never the All-Notes preview or AI-reachable
 * note text.
 */

/** Cap on folded description text per note (chars) — bounds the FTS document. */
export const MAX_ASSET_TEXT_CHARS = 8_000

/**
 * The combined description text of a note's referenced assets, for folding into
 * its search index. Reads from the `asset_descriptions` entity in a single
 * query — not per-asset sidecar files — keeping the note's reference order,
 * deduped and capped. Assets without a managed description contribute nothing.
 * The read is unpinned, matching the indexer's other index reads (the *write* is
 * generation-pinned, so a graph switch drops the stale row regardless).
 */
export async function gatherAssetDescriptionText(assetPaths: readonly string[]): Promise<string> {
  const unique = [...new Set(assetPaths)]
  if (unique.length === 0) {
    return ''
  }
  const rows = await db
    .selectFrom('assetDescriptions')
    .where('assetPath', 'in', unique)
    .select(['assetPath', 'description'])
    .execute()
  const byPath = new Map(rows.map((row) => [row.assetPath, row.description]))

  const bodies: string[] = []
  let total = 0
  for (const assetPath of unique) {
    const body = byPath.get(assetPath)?.trim()
    if (body === undefined || body === '') {
      continue // no managed description for this asset
    }
    bodies.push(body)
    total += body.length
    if (total >= MAX_ASSET_TEXT_CHARS) {
      break
    }
  }
  return bodies.join('\n\n').slice(0, MAX_ASSET_TEXT_CHARS)
}
