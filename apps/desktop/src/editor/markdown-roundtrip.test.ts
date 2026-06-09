import { createEditor } from '@prosekit/core'
import { defineEditorExtension, docToMarkdown, markdownToDoc, type TypedEditor } from '@meowdown/core'
import { describe, expect, it } from 'vitest'

/**
 * Spike gate (Plan 01 step 8): does markdown — and specifically `[[wiki links]]`,
 * which meowdown has no dedicated support for — survive a markdownToDoc →
 * docToMarkdown round-trip without loss? meowdown keeps inline syntax as literal
 * text, so the expectation is yes.
 */
function roundtrip(markdown: string): string {
  const editor: TypedEditor = createEditor({ extension: defineEditorExtension() })
  return docToMarkdown(markdownToDoc(editor, markdown))
}

describe('meowdown markdown round-trip', () => {
  const cases = [
    '# Heading',
    'A paragraph with [[Wiki Link]] inside.',
    '[[Note|alias]]',
    'Link to [[2026-06-09]] daily note.',
    '**bold** and _em_ and `code`',
    '> a quote',
    // Tight lists stay tight as of meowdown 0.3.0 (no blank line between
    // items), so list edits no longer create spurious sync diffs (Plan 12).
    '- item one\n- item two',
    '- parent\n  - child',
    // Task lists (meowdown 0.3.0): `- [ ]`/`- [x]` parse to flat-list nodes
    // with kind "task" + checked, keep their text, and serialize back
    // byte-identically. Foundation for Plan 05 step 8 (checkbox toggling).
    '- [ ] todo',
    '- [x] done',
    '- [ ] todo\n- [x] done\n- plain item',
  ]

  for (const markdown of cases) {
    it(`preserves ${JSON.stringify(markdown)}`, () => {
      // docToMarkdown appends a single trailing newline (standard block-level
      // markdown serialization); content must otherwise be byte-identical.
      expect(roundtrip(markdown).replace(/\n$/, '')).toBe(markdown)
    })
  }

  it('appends exactly one trailing newline', () => {
    expect(roundtrip('# Heading')).toBe('# Heading\n')
  })

  it('parses a task item to the flat-list task kind with its text intact', () => {
    const editor: TypedEditor = createEditor({ extension: defineEditorExtension() })
    const doc = markdownToDoc(editor, '- [x] done').toJSON() as {
      content: Array<{ attrs: { kind: string; checked: boolean } }>
    }
    expect(doc.content[0].attrs).toMatchObject({ kind: 'task', checked: true })
  })
})
