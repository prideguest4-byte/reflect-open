import { useEffect, useMemo, useRef } from 'react'
import { Priority } from '@prosekit/core'
import { type Command, TextSelection } from '@prosekit/pm/state'
import { useKeymap } from '@prosekit/react'

/**
 * "Type a title, press Return, start bullets" — old Reflect's capture flow.
 * When the `editorBulletAfterHeading` setting is on, pressing Enter at the **end
 * of a heading** drops the caret into a fresh empty bullet on the next line
 * instead of a plain paragraph.
 *
 * This is the heading-Enter half of the bullet feature; the empty-note seed
 * (`default-bullet.ts`, the `editorDefaultBullet` setting) is the other half.
 * They are deliberately independent settings: the seed decides a note's
 * *initial* document, this decides what Enter *after a heading* produces.
 */

/**
 * A ProseMirror command for the editor's Enter binding. It claims Enter only
 * when the selection is an empty caret at the very end of a heading; every other
 * Enter — mid-heading, in a paragraph, inside a list — returns false and falls
 * through to the editor's default handling. `isEnabled` is read at press time so
 * the setting toggles the behavior live without re-registering the keymap.
 */
export function bulletAfterHeadingOnEnter(isEnabled: () => boolean): Command {
  return (state, dispatch) => {
    if (!isEnabled()) {
      return false
    }
    const { $from, empty } = state.selection
    if (!empty || $from.parent.type.name !== 'heading') {
      return false
    }
    // Only at the end of the heading's text; Enter elsewhere splits as usual.
    if ($from.parentOffset !== $from.parent.content.size) {
      return false
    }
    const listType = state.schema.nodes['list']
    const paragraphType = state.schema.nodes['paragraph']
    if (!listType || !paragraphType) {
      return false
    }
    if (dispatch) {
      const bullet = listType.create({ kind: 'bullet' }, paragraphType.create())
      const afterHeading = $from.after()
      const tr = state.tr.insert(afterHeading, bullet)
      // The caret lands inside the new empty bullet: one past the list's open
      // token, one past the paragraph's, is the first text position within it.
      tr.setSelection(TextSelection.create(tr.doc, afterHeading + 2))
      dispatch(tr.scrollIntoView())
    }
    return true
  }
}

interface BulletAfterHeadingKeymapProps {
  /** Whether the `editorBulletAfterHeading` setting is on. */
  enabled: boolean
}

/**
 * Registers {@link bulletAfterHeadingOnEnter} on the editor's Enter key. Renders
 * nothing — it must mount **inside** `<MeowdownEditor>` so `useKeymap` binds to
 * that editor's ProseKit context (meowdown renders children there in the rich
 * modes). `enabled` is read through a ref so the keymap registers once and the
 * setting still takes effect immediately; the high priority lets the command run
 * before the editor's default Enter so it can claim the end-of-heading case.
 */
export function BulletAfterHeadingKeymap({ enabled }: BulletAfterHeadingKeymapProps): null {
  const enabledRef = useRef(enabled)
  useEffect(() => {
    enabledRef.current = enabled
  })
  const keymap = useMemo(
    // The getter is invoked only when the Enter command fires (a keypress),
    // never during render.
    // eslint-disable-next-line react-hooks/refs
    () => ({ Enter: bulletAfterHeadingOnEnter(() => enabledRef.current) }),
    [],
  )
  useKeymap(keymap, { priority: Priority.high })
  return null
}
