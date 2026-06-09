import { useEffect, useState } from 'react'
import { isAppError, notePath, readNote, writeNote, type GraphInfo } from '@reflect/core'

/** The fixed note the workspace opens until Plan 06 brings navigation. */
export const WELCOME_PATH = notePath('welcome')

/** Seed content, written once when the welcome note doesn't exist yet. */
const WELCOME_NOTE = `# Welcome to Reflect

This is the **meowdown** editor — markdown you can _see_, backed by plain files.
Everything you type here is saved to \`${WELCOME_PATH}\` in your graph.

Daily notes link to people and ideas with [[Wiki Links]], and to dates like [[2026-06-09]].

- capture first
- organize later

> Backlinks are the organizing primitive.
`

/**
 * Bootstrap the graph's entry note and return its path once the editor can
 * mount on a real file — `null` while the bootstrap is in flight. Seeds the
 * welcome note on first open; any other failure still resolves to the path so
 * `NotePane`'s own read can surface the real error instead of an endless
 * loading state. Re-runs when the graph (root or generation) changes.
 */
export function useInitialNotePath(graph: GraphInfo): string | null {
  const [openPath, setOpenPath] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setOpenPath(null)
    void (async () => {
      try {
        await readNote(WELCOME_PATH)
      } catch (err) {
        if (isAppError(err) && err.kind === 'notFound') {
          try {
            await writeNote(WELCOME_PATH, WELCOME_NOTE, graph.generation)
          } catch {
            // fall through — NotePane surfaces the open error
          }
        }
      } finally {
        if (active) {
          setOpenPath(WELCOME_PATH)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [graph.root, graph.generation])

  return openPath
}
