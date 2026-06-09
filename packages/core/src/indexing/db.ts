import { createDb, type Database } from '@reflect/db'
import type { Kysely } from 'kysely'
import { toAppError } from '../errors'
import { getBridge } from '../ipc/bridge'

/**
 * The shared Kysely instance over the active graph's SQLite index. Queries
 * compile in TypeScript and execute in Rust via the `db_query` command.
 *
 * The runner resolves the bridge per query (not at module load), so this
 * instance is safe to create before {@link setBridge} runs — only executing a
 * query without a bridge throws. Rejections are coerced to the shared
 * {@link AppError} contract like every other command.
 */
export const db: Kysely<Database> = createDb(async (sql, params) => {
  try {
    return await getBridge().invoke('db_query', { sql, params: [...params] })
  } catch (error) {
    throw toAppError(error)
  }
})
