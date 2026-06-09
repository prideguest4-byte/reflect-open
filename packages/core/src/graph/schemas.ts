import { z } from 'zod'

/** Identity of an open graph (mirrors the Rust `GraphInfo`). */
export const graphInfoSchema = z.object({
  /** Absolute path of the graph root. */
  root: z.string(),
  /** Display name (the root folder name). */
  name: z.string(),
  /**
   * File-sync provider this graph appears to live inside (e.g. `"icloud"`,
   * `"dropbox"`), or `null`. A non-null value means the UI should warn — Reflect
   * syncs via GitHub only and a cloud-synced graph risks index corruption.
   */
  cloudSync: z.string().nullable(),
})
export type GraphInfo = z.infer<typeof graphInfoSchema>

/** A previously-opened graph (mirrors the Rust `RecentGraph`). */
export const recentGraphSchema = z.object({
  root: z.string(),
  name: z.string(),
  /** When it was last opened, epoch milliseconds. */
  openedMs: z.number(),
})
export type RecentGraph = z.infer<typeof recentGraphSchema>

/** Metadata for a file inside the graph (mirrors the Rust `FileMeta`). */
export const fileMetaSchema = z.object({
  /** Graph-relative path, forward-slashed. */
  path: z.string(),
  size: z.number(),
  /** Last-modified time in epoch milliseconds. */
  modifiedMs: z.number(),
})
export type FileMeta = z.infer<typeof fileMetaSchema>
