/**
 * Line-level context extraction for the backlinks panel (Plan 07): given a
 * note's source and a link's whole-file offset (the index stores `pos_from`
 * with the frontmatter offset already applied), return the surrounding line,
 * trimmed around the position when the line runs long.
 */

const DEFAULT_MAX_LENGTH = 160
const PREVIEW_MAX_LENGTH = 120

/** The single line of `content` containing `pos`, windowed to `maxLength`. */
export function lineSnippet(content: string, pos: number, maxLength = DEFAULT_MAX_LENGTH): string {
  const at = Math.max(0, Math.min(pos, content.length))
  const lineStart = content.lastIndexOf('\n', Math.max(0, at - 1)) + 1
  const lineEndRaw = content.indexOf('\n', at)
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw
  const rawLine = content.slice(lineStart, lineEnd)
  const line = rawLine.trim()
  if (line.length <= maxLength) {
    return line
  }
  // Window around the link's position within the *trimmed* line — the trim
  // shifted offsets by the leading whitespace, and on a long indented line an
  // unadjusted position could window the link right out of the snippet.
  const startTrim = rawLine.length - rawLine.trimStart().length
  const posInLine = Math.max(0, Math.min(at - lineStart - startTrim, line.length))
  const half = Math.floor(maxLength / 2)
  const from = Math.max(0, Math.min(posInLine - half, line.length - maxLength))
  const to = from + maxLength
  const prefix = from > 0 ? '…' : ''
  const suffix = to < line.length ? '…' : ''
  return `${prefix}${line.slice(from, to).trim()}${suffix}`
}

/**
 * A list-row preview of a note: the first body line of its plain text,
 * skipping the title when it leads the text (the indexer's plain-text
 * rendering keeps heading *text*, so a note's first line usually repeats its
 * title — pure noise next to a Subject column). A later line that happens to
 * equal the title is kept: only the leading occurrence is the title.
 */
export function previewSnippet(
  text: string,
  title: string,
  maxLength = PREVIEW_MAX_LENGTH,
): string {
  let pastTitle = false
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '') {
      continue
    }
    if (!pastTitle) {
      pastTitle = true
      if (line === title.trim()) {
        continue
      }
    }
    return line.length <= maxLength ? line : `${line.slice(0, maxLength).trimEnd()}…`
  }
  return ''
}
