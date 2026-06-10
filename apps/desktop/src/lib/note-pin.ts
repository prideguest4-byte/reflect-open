import { parseNote, readNote, upsertFrontmatter, writeNote } from '@reflect/core'
import { openSession } from '@/editor/open-documents'

/**
 * Toggle a note's `pinned: true` frontmatter flag. Markdown is the source of
 * truth: the flag lands in the file, the watcher re-indexes it, and the
 * sidebar's Pinned section follows from the index — no UI-side pin state.
 *
 * Routes through the live session whenever the note is open (the same liveness
 * contract as the rename coordinator's alias placement): a direct disk write
 * under a dirty buffer would park a conflict caused by our own action, and
 * "keep mine" would silently undo the pin. With no live session (or one that
 * can't take patches), a read-patch-write on disk is reconciled by any
 * loading/clean session like an external change.
 *
 * Returns the note's new pinned state.
 */
export async function toggleNotePinned(path: string, generation: number): Promise<boolean> {
  const owner = openSession(path)
  if (owner !== null) {
    const pinned = !parseNote({ path, source: owner.content() }).frontmatter.pinned
    if (owner.updateFrontmatter({ pinned })) {
      // Flushed rather than riding the save debounce: a pin should show up in
      // the sidebar now, not 800ms from now.
      await owner.flush()
      return pinned
    }
  }
  const content = await readNote(path)
  const pinned = !parseNote({ path, source: content }).frontmatter.pinned
  const patched = upsertFrontmatter(content, { pinned: pinned ? true : undefined })
  if (patched !== content) {
    await writeNote(path, patched, generation)
  }
  return pinned
}
