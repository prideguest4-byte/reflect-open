import { describe, expect, it } from 'vitest'
import {
  TaskStaleError,
  appendBlock,
  appendUnderHeading,
  renameWikiLink,
  toggleTaskMarker,
} from './edit'

describe('renameWikiLink', () => {
  it('rewrites matching targets, preserves aliases, skips code and non-matches', () => {
    const source = '[[Foo]] and [[foo|bar]] and `[[Foo]]` and [[Other]]'
    expect(renameWikiLink(source, 'Foo', 'Baz')).toBe(
      '[[Baz]] and [[Baz|bar]] and `[[Foo]]` and [[Other]]',
    )
  })

  it('is a byte-identical no-op when nothing matches', () => {
    const source = 'see [[Alpha]] and [[Beta]]'
    expect(renameWikiLink(source, 'Gamma', 'Delta')).toBe(source)
  })

  it('matches on the trimmed, case-folded target', () => {
    const source = '[[ Foo ]] and [[Foo]] and [[ foo|bar]]'
    expect(renameWikiLink(source, 'Foo', 'Baz')).toBe('[[Baz]] and [[Baz]] and [[Baz|bar]]')
  })

  it('rejects a destination target containing wiki-link syntax', () => {
    expect(() => renameWikiLink('[[Foo]]', 'Foo', 'A|B')).toThrow(/invalid wiki-link target/i)
  })
})

describe('appendUnderHeading', () => {
  const doc = '# A\n\nalpha\n\n# B\n\nbeta'

  it('inserts at the end of a heading section, before the next sibling heading', () => {
    expect(appendUnderHeading(doc, 'A', '- new')).toBe('# A\n\nalpha\n\n- new\n\n# B\n\nbeta')
  })

  it('appends at end of file for the last section', () => {
    expect(appendUnderHeading(doc, 'B', '- new')).toBe('# A\n\nalpha\n\n# B\n\nbeta\n\n- new\n')
  })

  it('creates a new section when the heading is missing', () => {
    expect(appendUnderHeading(doc, 'Inbox', '- new')).toBe(
      '# A\n\nalpha\n\n# B\n\nbeta\n\n## Inbox\n\n- new\n',
    )
  })

  it('matches the heading case-insensitively', () => {
    expect(appendUnderHeading(doc, 'a', '- new')).toBe('# A\n\nalpha\n\n- new\n\n# B\n\nbeta')
  })
})

describe('appendBlock', () => {
  it('appends one blank line after the existing content', () => {
    expect(appendBlock('alpha\n', 'new text')).toBe('alpha\n\nnew text\n')
  })

  it('collapses extra trailing whitespace to the single separator', () => {
    expect(appendBlock('alpha\n\n\n', 'new text')).toBe('alpha\n\nnew text\n')
  })

  it('becomes the whole body of an empty note', () => {
    expect(appendBlock('', 'new text')).toBe('new text\n')
    expect(appendBlock('\n', 'new text')).toBe('new text\n')
  })

  it('appends after frontmatter when the note has nothing else', () => {
    expect(appendBlock('---\nprivate: true\n---\n', 'new text')).toBe(
      '---\nprivate: true\n---\n\nnew text\n',
    )
  })

  it('trims the block itself', () => {
    expect(appendBlock('alpha', '  new text \n')).toBe('alpha\n\nnew text\n')
  })
})

describe('toggleTaskMarker', () => {
  it('toggles an unchecked task by changing only the marker', () => {
    const source = '- [ ] buy milk\n'
    expect(toggleTaskMarker(source, source.indexOf('[ ]'), '[ ] buy milk')).toEqual({
      source: '- [x] buy milk\n',
      checked: true,
    })
  })

  it('toggles a checked task back to unchecked', () => {
    const source = '- [x] buy milk\n'
    expect(toggleTaskMarker(source, source.indexOf('[x]'), '[x] buy milk')).toEqual({
      source: '- [ ] buy milk\n',
      checked: false,
    })
  })

  it('accepts uppercase checked markers from externally-authored markdown', () => {
    const source = '- [X] buy milk\n'
    expect(toggleTaskMarker(source, source.indexOf('[X]'), '[X] buy milk')).toEqual({
      source: '- [ ] buy milk\n',
      checked: false,
    })
  })

  it('refuses when the indexed raw task no longer matches the source', () => {
    const source = '- [ ] buy oat milk\n'
    expect(() => toggleTaskMarker(source, source.indexOf('[ ]'), '[ ] buy milk')).toThrow(
      TaskStaleError,
    )
  })

  it('refuses when the offset no longer points at a task marker', () => {
    expect(() => toggleTaskMarker('- [ ] buy milk\n', 0, '[ ] buy milk')).toThrow(TaskStaleError)
  })
})
