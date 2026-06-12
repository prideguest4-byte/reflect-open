import { describe, expect, it } from 'vitest'
import type { ToolCallOptions } from 'ai'
import type { RetrievalHit, RetrieveOptions } from '../../embeddings/retrieve'
import {
  buildNoteTools,
  MAX_NOTE_CONTENT_CHARS,
  type NoteTools,
  type ReadNoteOutput,
  type SearchNotesOutput,
} from './tools'

const CALL: ToolCallOptions = { toolCallId: 'call-1', messages: [] }

function hit(overrides: Partial<RetrievalHit>): RetrievalHit {
  return {
    path: 'notes/public.md',
    title: 'Public note',
    score: 1,
    snippet: 'a public snippet',
    heading: null,
    isPrivate: false,
    ...overrides,
  }
}

function isAsyncIterable(value: object): value is AsyncIterable<unknown> {
  return Symbol.asyncIterator in value
}

async function runSearch(
  tools: NoteTools,
  input: { query: string; limit?: number },
): Promise<SearchNotesOutput> {
  const execute = tools.search_notes.execute
  if (!execute) {
    throw new Error('search_notes has no execute')
  }
  const output = await execute(input, CALL)
  if (isAsyncIterable(output)) {
    throw new Error('unexpected streaming tool output')
  }
  return output
}

async function runRead(tools: NoteTools, path: string): Promise<ReadNoteOutput> {
  const execute = tools.read_note.execute
  if (!execute) {
    throw new Error('read_note has no execute')
  }
  const output = await execute({ path }, CALL)
  if (isAsyncIterable(output)) {
    throw new Error('unexpected streaming tool output')
  }
  return output
}

describe('search_notes', () => {
  it('always retrieves with excludePrivateContent', async () => {
    const seen: Array<RetrieveOptions | undefined> = []
    const tools = buildNoteTools({
      retrieveFn: async (_query, options) => {
        seen.push(options)
        return []
      },
    })
    await runSearch(tools, { query: 'atlas' })
    expect(seen).toEqual([{ limit: 8, excludePrivateContent: true }])
  })

  it('drops private hits entirely — not even the title goes out', async () => {
    const tools = buildNoteTools({
      retrieveFn: async () => [
        hit({}),
        hit({ path: 'notes/diary.md', title: 'Secret Diary', snippet: '', isPrivate: true }),
      ],
    })
    const output = await runSearch(tools, { query: 'diary' })
    const payload = JSON.stringify(output)
    expect(payload).not.toContain('Secret Diary')
    expect(payload).not.toContain('notes/diary.md')
    expect(output.hits).toEqual([
      { path: 'notes/public.md', title: 'Public note', snippet: 'a public snippet', heading: null },
    ])
  })

  it('passes the requested limit through', async () => {
    const seen: Array<RetrieveOptions | undefined> = []
    const tools = buildNoteTools({
      retrieveFn: async (_query, options) => {
        seen.push(options)
        return []
      },
    })
    await runSearch(tools, { query: 'atlas', limit: 3 })
    expect(seen[0]?.limit).toBe(3)
  })
})

describe('read_note', () => {
  it('returns the body without frontmatter, titled from the note', async () => {
    const tools = buildNoteTools({
      readNoteFn: async () => '---\npinned: true\n---\n# Project Atlas\n\nLaunch plan.\n',
    })
    const output = await runRead(tools, 'notes/atlas.md')
    expect(output.error).toBeNull()
    expect(output.title).toBe('Project Atlas')
    expect(output.content).toBe('# Project Atlas\n\nLaunch plan.\n')
    expect(output.truncated).toBe(false)
  })

  it('refuses a private note from its live frontmatter', async () => {
    const tools = buildNoteTools({
      readNoteFn: async () => '---\nprivate: true\n---\n# Diary\n\nclassified contents\n',
    })
    const output = await runRead(tools, 'notes/diary.md')
    expect(output.error).toContain('private')
    expect(output.content).toBeNull()
    expect(JSON.stringify(output)).not.toContain('classified contents')
  })

  it('reports a missing note instead of throwing', async () => {
    const tools = buildNoteTools({
      readNoteFn: async () => {
        throw { kind: 'notFound', message: 'no such note' }
      },
    })
    const output = await runRead(tools, 'notes/gone.md')
    expect(output.error).toContain('No note exists')
    expect(output.content).toBeNull()
  })

  it('caps oversized notes and flags the cut', async () => {
    const body = 'x'.repeat(MAX_NOTE_CONTENT_CHARS + 10)
    const tools = buildNoteTools({ readNoteFn: async () => body })
    const output = await runRead(tools, 'notes/big.md')
    expect(output.content?.length).toBe(MAX_NOTE_CONTENT_CHARS)
    expect(output.truncated).toBe(true)
  })
})
