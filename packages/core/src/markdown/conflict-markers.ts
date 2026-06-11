/**
 * Git conflict-marker detection (Plan 12).
 *
 * A sync merge that conflicts writes standard markers into the note (labeled
 * `<<<<<<< this device` / `>>>>>>> other device` by the Rust merge) and
 * commits them — the note itself carries the conflict. The indexer calls this
 * on the raw source to project a `has_conflict` flag; when the user edits the
 * markers away, the next reindex clears it. Detection requires the full
 * `<<<<<<<` → `=======` → `>>>>>>>` sequence in order, so prose that merely
 * mentions a marker line doesn't false-positive.
 */

/** Which side of a conflict block to keep when resolving. */
export type ConflictResolution = 'ours' | 'theirs' | 'both'

/**
 * Resolve every conflict block in `source` by keeping one side (or both,
 * ours-then-theirs — the daily-note append case). Pure text splice on raw
 * lines, deliberately **never** routed through the editor: markers don't
 * survive its round-trip (verified by the Plan 12 spike), which is why
 * conflicted notes open protected and the UI resolves them through this.
 * Unterminated blocks (a truncated file) keep whatever was selected and never
 * throw. Text outside marker blocks is untouched, byte for byte.
 */
export function resolveConflictMarkers(source: string, keep: ConflictResolution): string {
  const out: string[] = []
  let section: 'text' | 'ours' | 'theirs' = 'text'
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    switch (section) {
      case 'text':
        if (line.startsWith('<<<<<<< ')) {
          section = 'ours'
        } else {
          out.push(rawLine)
        }
        break
      case 'ours':
        if (line === '=======') {
          section = 'theirs'
        } else if (keep !== 'theirs') {
          out.push(rawLine)
        }
        break
      case 'theirs':
        if (line.startsWith('>>>>>>> ')) {
          section = 'text'
        } else if (keep !== 'ours') {
          out.push(rawLine)
        }
        break
    }
  }
  return out.join('\n')
}

/** True when `source` contains a complete Git conflict-marker block. */
export function detectConflictMarkers(source: string): boolean {
  let stage: 'start' | 'separator' | 'end' = 'start'
  for (const rawLine of source.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    switch (stage) {
      case 'start':
        if (line.startsWith('<<<<<<< ')) {
          stage = 'separator'
        }
        break
      case 'separator':
        if (line === '=======') {
          stage = 'end'
        }
        break
      case 'end':
        if (line.startsWith('>>>>>>> ')) {
          return true
        }
        break
    }
  }
  return false
}
