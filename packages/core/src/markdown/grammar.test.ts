import { describe, expect, it } from 'vitest'
import { parseBody } from './grammar'

/** Collect `[from, to)` spans of every WikiLink node in `body`. */
function wikiLinkSpans(body: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  parseBody(body).iterate({
    enter(node) {
      if (node.name === 'WikiLink') {
        spans.push([node.from, node.to])
      }
    },
  })
  return spans
}

describe('wikiLinkExtension (Lezer grammar)', () => {
  it('parses a wiki link with exact source positions', () => {
    const body = 'See [[Target Note]] here'
    expect(wikiLinkSpans(body)).toEqual([[4, 19]])
  })

  it('parses aliased links and multiple links per line', () => {
    const spans = wikiLinkSpans('[[A|Alias]] and [[B]]')
    expect(spans).toHaveLength(2)
  })

  it('wins over the standard markdown Link rule', () => {
    const body = '[[Not A Link]](http://example.com)'
    const spans = wikiLinkSpans(body)
    expect(spans).toEqual([[0, 14]])
  })

  it('ignores empty, unclosed, and multi-line candidates', () => {
    expect(wikiLinkSpans('[[]]')).toEqual([])
    expect(wikiLinkSpans('[[never closed')).toEqual([])
    expect(wikiLinkSpans('[[spans\nlines]]')).toEqual([])
  })

  it('never matches inside code spans or fences', () => {
    expect(wikiLinkSpans('`[[in code]]`')).toEqual([])
    expect(wikiLinkSpans('```\n[[in fence]]\n```')).toEqual([])
  })
})
