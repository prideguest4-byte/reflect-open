import { defineKeymap, type PlainExtension } from '@prosekit/core'
import { setBlockType } from '@prosekit/pm/commands'
import type { Command, EditorState } from '@prosekit/pm/state'
import type { Node as ProseMirrorNode } from '@prosekit/pm/model'
import { MEOWDOWN_BINDING_DESCRIPTIONS } from './meowdown'

/**
 * The central keymap registry (Plan 05 step 9). Every shortcut the app binds —
 * editor formatting here, navigation (Plan 06), `[[` autocomplete (Plan 07),
 * `⌘K` (Plan 08), the AI sidebar (Plan 10) — registers through {@link
 * registerKeymap}, which rejects duplicates so bindings can never silently
 * collide across features. Registration happens once at module scope; creating
 * editors reuses the registered map.
 */

export type KeymapScope = 'editor' | 'app'

const registeredBindings = new Map<string, KeymapScope>()

/**
 * Register `bindings` under `scope`, throwing on any already-taken key.
 * All-or-nothing: validation happens before any key is committed, so a
 * colliding batch never leaves the registry partially mutated.
 */
export function registerKeymap<T>(scope: KeymapScope, bindings: Record<string, T>): Record<string, T> {
  const keys = Object.keys(bindings)
  for (const key of keys) {
    const existing = registeredBindings.get(key)
    if (existing) {
      throw new Error(`duplicate keybinding "${key}": already registered by the ${existing} scope`)
    }
  }
  for (const key of keys) {
    registeredBindings.set(key, scope)
  }
  return bindings
}

/** Every registered binding (for the collision test + a future shortcuts UI). */
export function listRegisteredBindings(): ReadonlyMap<string, KeymapScope> {
  return registeredBindings
}

/**
 * Toggle the current block between `heading` at `level` and `paragraph`.
 * Headings are real nodes in meowdown (block syntax is reconstructed by the
 * serializer), so a block-type change round-trips exactly.
 */
function toggleHeading(level: number): Command {
  return (state, dispatch, view) => {
    const { heading, paragraph } = state.schema.nodes
    if (!heading || !paragraph) {
      return false
    }
    const { $from } = state.selection
    const isSame = $from.parent.type === heading && $from.parent.attrs.level === level
    const target = isSame ? setBlockType(paragraph) : setBlockType(heading, { level })
    return target(state, dispatch, view)
  }
}

interface ListNodeAtSelection {
  node: ProseMirrorNode
  pos: number
}

function listNodeAtSelection(state: EditorState): ListNodeAtSelection | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'list') {
      return { node, pos: $from.before(depth) }
    }
  }
  return null
}

const toggleTaskAtSelection: Command = (state, dispatch) => {
  const target = listNodeAtSelection(state)
  if (!target) {
    return false
  }
  const { node, pos } = target
  if (node.attrs.kind !== 'task' && node.attrs.kind !== 'bullet') {
    return false
  }
  const attrs =
    node.attrs.kind === 'task'
      ? { ...node.attrs, checked: !node.attrs.checked }
      : { ...node.attrs, kind: 'task', checked: false }
  if (dispatch) {
    dispatch(state.tr.setNodeMarkup(pos, undefined, attrs))
  }
  return true
}

interface EditorBindingDefinition {
  /** The keybinding (ProseMirror key string, e.g. `Mod-1`). */
  binding: string
  /** What the binding does — shown in the Keyboard settings section. */
  description: string
  command: Command
}

/**
 * The bindings Reflect adds on top of meowdown's, one definition each: the
 * keymap the editor registers and the descriptions the shortcuts UI shows both
 * derive from this list, so a new binding can't ship without its settings row
 * (and vice versa).
 */
const EDITOR_BINDING_DEFINITIONS: EditorBindingDefinition[] = [
  { binding: 'Mod-1', description: 'Heading 1', command: toggleHeading(1) },
  { binding: 'Mod-2', description: 'Heading 2', command: toggleHeading(2) },
  { binding: 'Mod-3', description: 'Heading 3', command: toggleHeading(3) },
  { binding: 'Mod-Enter', description: 'Toggle task', command: toggleTaskAtSelection },
]

/** Display descriptions for the editor-scope bindings (the shortcuts UI). */
export const EDITOR_BINDING_DESCRIPTIONS: Record<string, string> = registerKeymap('editor', {
  ...MEOWDOWN_BINDING_DESCRIPTIONS,
  ...Object.fromEntries(
    EDITOR_BINDING_DEFINITIONS.map(({ binding, description }) => [binding, description]),
  ),
})

/** Reflect's own editor-scope commands (meowdown's toggles live in the engine). */
export const EDITOR_BINDINGS: Record<string, Command> = Object.fromEntries(
  EDITOR_BINDING_DEFINITIONS.map(({ binding, command }) => [binding, command]),
)

/** The editor keymap extension, composed into the editor via `union`. */
export function defineReflectKeymap(): PlainExtension {
  return defineKeymap(EDITOR_BINDINGS)
}
