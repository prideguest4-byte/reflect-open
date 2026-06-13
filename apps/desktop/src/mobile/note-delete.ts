import { deleteNote } from '@reflect/core'
import { openSession } from '@/editor/open-documents'

/**
 * Delete a note from the mobile note screen (Plan 19, V1 parity). On mobile
 * `deleteNote` moves the file into the graph-local `.reflect/trash/`
 * (recoverable, sync-ignored) and emits the in-process `remove` so the index
 * and queries drop it.
 *
 * We suspend the open session before deleting, then wait for any write that
 * already entered the save pipeline to settle. Otherwise that in-flight write
 * could land after the file is moved to trash and recreate it at the original
 * path. If the delete fails, the guard rolls back and the mounted session
 * resumes saving normally. If it succeeds, the guard commits a no-flush detach
 * so the pane's unmount (flush → dispose) is a no-op. The caller navigates away
 * after this resolves.
 */
export async function deleteOpenNote(path: string, generation: number): Promise<void> {
  const deleteGuard = await openSession(path)?.beginDelete()
  try {
    await deleteNote(path, generation)
  } catch (cause) {
    deleteGuard?.rollback()
    throw cause
  }
  deleteGuard?.commit()
}
