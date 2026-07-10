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

import { sql, type RawBuilder } from 'kysely'
import { foldKey } from '../markdown'

/** Split a free-text query into the terms shared by FTS and title recall. */
export function splitSearchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean)
}

/**
 * Build an FTS5 `MATCH` expression from a free-text query, or `null` when there
 * is nothing to search. FTS5 errors on an empty `MATCH`, so callers should treat
 * `null` as an empty result set rather than passing it to the database.
 */
export function buildFtsMatch(query: string): string | null {
  const terms = splitSearchTerms(query)
  if (terms.length === 0) {
    return null
  }
  return terms.map((term) => `"${term.replace(/"/g, '""')}"`).join(' ')
}

export interface TitleMatchSql {
  /** True when every whitespace-delimited query term occurs in the folded title. */
  readonly containsAllTerms: RawBuilder<boolean>
  /** Exact (0), whole-query prefix (1), term-substring (2), or non-title (3). */
  readonly rank: RawBuilder<number>
}

/**
 * Build title-substring SQL against a stored, already-folded title-key column.
 * Every query term must occur, so `東京 旅行` matches `東京旅行計画` even though
 * `unicode61` sees the uninterrupted title as one token.
 */
export function buildTitleMatchSql(
  titleKeyColumn: RawBuilder<string>,
  query: string,
): TitleMatchSql {
  const terms = splitSearchTerms(query).map(foldKey)
  const containsAllTerms =
    terms.length === 0
      ? sql<boolean>`0`
      : sql<boolean>`(${sql.join(
          terms.map((term) => sql`instr(${titleKeyColumn}, ${term}) > 0`),
          sql` and `,
        )})`
  const titleKey = foldKey(query)
  return {
    containsAllTerms,
    rank: sql<number>`case
      when ${titleKeyColumn} = ${titleKey} then 0
      when instr(${titleKeyColumn}, ${titleKey}) = 1 then 1
      when ${containsAllTerms} then 2
      else 3
    end`,
  }
}
