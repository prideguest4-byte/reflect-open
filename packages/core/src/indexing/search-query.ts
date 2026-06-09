/**
 * FTS5 query construction (Plan 04).
 *
 * FTS5 interprets a raw `MATCH` argument as query syntax, so operators in user
 * input (`AND`, `OR`, `NOT`, `*`, `(`, `"`) would either change the meaning of
 * the search or raise a syntax error. {@link buildFtsMatch} defends that boundary:
 * it splits the query on whitespace and wraps every term in a double-quoted
 * string (doubling any embedded quote, FTS5's own escape), so each term is
 * matched as a literal — the search is robust to whatever the user types.
 */

/**
 * Build an FTS5 `MATCH` expression from a free-text query, or `null` when there
 * is nothing to search. FTS5 errors on an empty `MATCH`, so callers should treat
 * `null` as an empty result set rather than passing it to the database.
 */
export function buildFtsMatch(query: string): string | null {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (terms.length === 0) {
    return null
  }
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' ')
}
