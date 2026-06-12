import { isAppError } from '../errors'
import { readNote, writeNote } from '../graph/commands'
import { dailyPath } from '../graph/paths'
import { appendBlock } from '../markdown/edit'

/**
 * Capture actions for audio memos (the first of the `actions/` capture
 * family — Plan 11's link capture will sit alongside).
 */

export interface AppendToDailyNoteInput {
  /** The target day, as a local ISO date (`YYYY-MM-DD`). */
  date: string
  /** The block to append (an audio-memo transcript). */
  text: string
  /** `GraphInfo.generation` — pins the write to the issuing graph. */
  generation: number
}

/**
 * Append `text` to the day's daily note, creating the file when the day has
 * none yet — capture must never depend on the note already existing. The
 * write goes straight to disk: the watcher reindexes it, and an open editor
 * session reconciles it like any external change (clean buffers reload in
 * place; dirty ones park a conflict rather than being clobbered).
 */
export async function appendToDailyNote(input: AppendToDailyNoteInput): Promise<void> {
  const path = dailyPath(input.date)
  let source = ''
  try {
    source = await readNote(path)
  } catch (cause) {
    if (!isAppError(cause) || cause.kind !== 'notFound') {
      throw cause
    }
  }
  await writeNote(path, appendBlock(source, input.text), input.generation)
}
