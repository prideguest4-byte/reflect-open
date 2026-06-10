import { describe, expect, it } from 'vitest'
import { lineSnippet, previewSnippet } from './snippet'

describe('lineSnippet', () => {
  it('returns the whole line containing the position', () => {
    const content = 'first line\nsee [[Target]] here\nlast line\n'
    expect(lineSnippet(content, content.indexOf('[[Target]]'))).toBe('see [[Target]] here')
  })

  it('handles a position on the first and last lines', () => {
    const content = 'alpha [[X]]\nomega [[Y]]'
    expect(lineSnippet(content, content.indexOf('[[X]]'))).toBe('alpha [[X]]')
    expect(lineSnippet(content, content.indexOf('[[Y]]'))).toBe('omega [[Y]]')
  })

  it('windows a long line around the position, keeping the link visible', () => {
    const left = 'a'.repeat(300)
    const right = 'b'.repeat(300)
    const content = `${left} [[Target]] ${right}`
    const snippet = lineSnippet(content, content.indexOf('[[Target]]'), 80)
    expect(snippet).toContain('[[Target]]')
    expect(snippet.length).toBeLessThanOrEqual(82) // window + ellipses
    expect(snippet.startsWith('…')).toBe(true)
    expect(snippet.endsWith('…')).toBe(true)
  })

  it('keeps the link visible on long indented lines', () => {
    const content = `${' '.repeat(120)}[[Target]] ${'x'.repeat(240)}`
    const snippet = lineSnippet(content, content.indexOf('[[Target]]'), 80)
    expect(snippet).toContain('[[Target]]')
  })

  it('clamps an out-of-range position instead of throwing', () => {
    expect(lineSnippet('only line', 999)).toBe('only line')
    expect(lineSnippet('', 5)).toBe('')
  })
})

describe('previewSnippet', () => {
  it('skips a leading title line and returns the first body line', () => {
    expect(previewSnippet('Roadmap\n\nShip the alpha in June.\nMore.', 'Roadmap')).toBe(
      'Ship the alpha in June.',
    )
  })

  it('returns the first line when it is not the title (untitled notes)', () => {
    expect(previewSnippet('Just a thought.\nSecond line.', 'ulid-derived')).toBe(
      'Just a thought.',
    )
  })

  it('keeps a later body line that happens to equal the title', () => {
    expect(previewSnippet('Echo\nEcho', 'Echo')).toBe('Echo')
  })

  it('skips blank and whitespace-only lines', () => {
    expect(previewSnippet('Title\n\n   \n\tbody at last', 'Title')).toBe('body at last')
  })

  it('truncates a long first line with an ellipsis', () => {
    const long = 'x'.repeat(200)
    const snippet = previewSnippet(long, 'Title', 50)
    expect(snippet).toBe(`${'x'.repeat(50)}…`)
  })

  it('returns empty for empty or title-only text', () => {
    expect(previewSnippet('', 'Title')).toBe('')
    expect(previewSnippet('Title\n', 'Title')).toBe('')
  })
})
