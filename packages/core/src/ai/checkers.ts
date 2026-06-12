/**
 * The AI domain's privacy guards (Plan 10). `private: true` is a hard block:
 * a private note's content must never be sent to an external service. Every
 * read-only AI tool re-checks the flag against the **live** note at call time
 * (not just the index, which can be stale right after the user flips the
 * flag) and refuses before any content reaches an outbound payload.
 */

/** What the cloud guard needs to know about a note. */
export interface CloudSendable {
  /** Graph-relative path (for the error message). */
  path: string
  /** The note's live `private: true` frontmatter flag. */
  isPrivate: boolean
}

/** Thrown when a private note would otherwise reach an external service. */
export class PrivateNoteError extends Error {
  constructor(path: string) {
    super(`"${path}" is marked private and cannot be sent to an AI service`)
    this.name = 'PrivateNoteError'
  }
}

/** Type guard for {@link PrivateNoteError} across module boundaries. */
export function isPrivateNoteError(value: unknown): value is PrivateNoteError {
  return value instanceof Error && value.name === 'PrivateNoteError'
}

/**
 * Assert that `note`'s content may leave the device. Throws
 * {@link PrivateNoteError} when the note is private — callers either let the
 * refusal propagate or turn it into a structured "this note is private"
 * answer, but they can never accidentally ship the body.
 */
export function assertCloudAllowed(note: CloudSendable): void {
  if (note.isPrivate) {
    throw new PrivateNoteError(note.path)
  }
}
