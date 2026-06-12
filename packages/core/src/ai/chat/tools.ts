import { tool } from 'ai'
import { z } from 'zod'
import { isAppError } from '../../errors'
import { readNote } from '../../graph/commands'
import { retrieve, type RetrievalHit, type RetrieveOptions } from '../../embeddings/retrieve'
import { splitFrontmatter } from '../../markdown/frontmatter'
import { parseNote } from '../../markdown/extract'
import { assertCloudAllowed, isPrivateNoteError } from '../checkers'

/**
 * The read-only note tools the chat model can call (Plan 10, first wave).
 * Both enforce the `private: true` hard block themselves — the model never
 * sees a private note's content, title, or snippet:
 *
 * - `search_notes` retrieves with `excludePrivateContent: true` and then
 *   drops private hits entirely (even a bare title is an outbound leak).
 * - `read_note` re-reads the live file and checks its frontmatter at call
 *   time (the index can be stale right after the user marks a note private),
 *   answering with a refusal instead of the body.
 */

/** Default and ceiling for search hits per call (token budget, not recall). */
const DEFAULT_SEARCH_LIMIT = 8
const MAX_SEARCH_LIMIT = 20

/** Cap on returned note content so one huge note can't flood the context. */
export const MAX_NOTE_CONTENT_CHARS = 24_000

/** Injectable effects so tests can drive the tools without a live bridge. */
export interface NoteToolDeps {
  retrieveFn?: (query: string, options?: RetrieveOptions) => Promise<RetrievalHit[]>
  readNoteFn?: (path: string) => Promise<string>
}

/** One search hit as the model sees it (private hits never appear). */
export interface SearchNotesHit {
  path: string
  title: string
  snippet: string
  heading: string | null
}

export interface SearchNotesOutput {
  hits: SearchNotesHit[]
}

/** A successful read, or a structured refusal/miss the model can relay. */
export interface ReadNoteOutput {
  path: string
  title: string | null
  content: string | null
  truncated: boolean
  /** Set when the note is private or missing; `content` is null. */
  error: string | null
}

const searchNotesInput = z.object({
  query: z.string().min(1).describe('Full-text search query over the note graph'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_SEARCH_LIMIT)
    .optional()
    .describe(`How many notes to return (default ${DEFAULT_SEARCH_LIMIT})`),
})

const readNoteInput = z.object({
  path: z.string().min(1).describe('Graph-relative note path, e.g. notes/abc.md'),
})

/**
 * Build the chat tool set. `deps` is a test seam; production callers omit it
 * and the tools run over the shared retrieval layer and the live filesystem.
 */
export function buildNoteTools(deps: NoteToolDeps = {}) {
  const retrieveFn = deps.retrieveFn ?? retrieve
  const readNoteFn = deps.readNoteFn ?? readNote

  return {
    search_notes: tool({
      description:
        'Search the user’s notes by meaning and keywords. Returns the best-matching ' +
        'notes with short snippets. Private notes are excluded.',
      inputSchema: searchNotesInput,
      execute: async ({ query, limit }): Promise<SearchNotesOutput> => {
        const hits = await retrieveFn(query, {
          limit: limit ?? DEFAULT_SEARCH_LIMIT,
          excludePrivateContent: true,
        })
        return {
          hits: hits
            .filter((hit) => !hit.isPrivate)
            .map((hit) => ({
              path: hit.path,
              title: hit.title,
              snippet: hit.snippet,
              heading: hit.heading,
            })),
        }
      },
    }),

    read_note: tool({
      description:
        'Read the full markdown content of one note by its graph-relative path ' +
        '(from search_notes results). Private notes cannot be read.',
      inputSchema: readNoteInput,
      execute: async ({ path }): Promise<ReadNoteOutput> => {
        let source: string
        try {
          source = await readNoteFn(path)
        } catch (cause) {
          if (isAppError(cause) && cause.kind === 'notFound') {
            return refusal(path, 'No note exists at this path.')
          }
          throw cause
        }
        const parsed = parseNote({ path, source })
        try {
          assertCloudAllowed({ path, isPrivate: parsed.frontmatter.private })
        } catch (cause) {
          if (isPrivateNoteError(cause)) {
            return refusal(path, 'This note is marked private and cannot be read by AI.')
          }
          throw cause
        }
        const { body } = splitFrontmatter(source)
        const truncated = body.length > MAX_NOTE_CONTENT_CHARS
        return {
          path,
          title: parsed.title,
          content: truncated ? body.slice(0, MAX_NOTE_CONTENT_CHARS) : body,
          truncated,
          error: null,
        }
      },
    }),
  }
}

function refusal(path: string, error: string): ReadNoteOutput {
  return { path, title: null, content: null, truncated: false, error }
}

/** The tool set type, for typed stream parts in the chat engine. */
export type NoteTools = ReturnType<typeof buildNoteTools>
