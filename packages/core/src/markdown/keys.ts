/**
 * Match-key folding (Plan 03/04).
 *
 * Note identity matching — wiki-link targets, note titles, and aliases — is
 * insensitive to case and surrounding whitespace. {@link foldKey} is the single
 * definition of that normalization, shared by the index write path
 * (`buildIndexedNote`) and the resolver (`normalizeWikiTarget`) so the keys
 * written to the index can never drift from the keys looked up against it.
 */

/** Trim surrounding whitespace and case-fold `value` to its match key. */
export function foldKey(value: string): string {
  return value.trim().toLowerCase()
}
