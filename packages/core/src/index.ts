/**
 * `@reflect/core` — the TypeScript business-logic layer.
 *
 * Per the architecture conventions, all reads, orchestration, AI/provider
 * calls, and privacy guards live here; the Rust shell provides only native
 * primitives. The per-domain `actions/` modules grow over the plans; this entry
 * point exposes the IPC boundary, the shared error contract, and the graph
 * file-storage layer (Plan 02).
 */
export { call } from './ipc/invoke'
export { getAppVersion } from './ipc/commands'
export { appErrorSchema, isAppError, toAppError, type AppError } from './errors'

// Graph & file storage (Plan 02)
export {
  DAILY_DIR,
  NOTES_DIR,
  ASSETS_DIR,
  dailyPath,
  notePath,
  assetPath,
  isDaily,
  dateFromDailyPath,
} from './graph/paths'
export {
  graphInfoSchema,
  recentGraphSchema,
  fileMetaSchema,
  type GraphInfo,
  type RecentGraph,
  type FileMeta,
} from './graph/schemas'
export {
  openGraph,
  createGraph,
  readNote,
  writeNote,
  moveNote,
  deleteNote,
  listFiles,
  recentGraphs,
  forgetRecent,
} from './graph/commands'
