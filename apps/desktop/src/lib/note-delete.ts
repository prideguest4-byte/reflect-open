import { deleteNote, isDaily } from '@reflect/core'
import { openSession } from '@/editor/open-documents'

/**
 * Delete an open regular note and detach its editor session without flushing.
 *
 * `deleteNote` moves the file into the graph-local `.reflect/trash/`
 * (recoverable, sync-ignored) and emits the in-process `remove` so the index
 * and queries drop it. Daily notes are intentionally blocked: they are the
 * app's chronological spine and cannot be deleted.
 *
 * Delete first, discard second. If the delete fails, the open session is left
 * fully intact so mounted editors keep persisting. Only once the file is in
 * trash do we discard the session; otherwise a normal teardown flush could
 * recreate the deleted file.
 */
export async function deleteOpenNote(path: string, generation: number): Promise<void> {
  if (isDaily(path)) {
    throw new Error('Daily notes cannot be deleted')
  }
  await deleteNote(path, generation)
  openSession(path)?.discard()
}
