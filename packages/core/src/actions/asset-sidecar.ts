import { z } from 'zod'
import { describeAsset, isAssetDescriptionRejected, type AssetKind } from '../ai/describe-asset'
import { defaultAiProvider, type AiProvidersState } from '../ai/provider-config'
import { aiKeySecretName } from '../ai/secrets'
import { base64ToBytes } from '../ai/transcribe'
import { isAppError, toAppError } from '../errors'
import { listDir, readAsset, readNote, writeNote } from '../graph/commands'
import { ASSETS_DIR } from '../graph/paths'
import { assetReferencingNotePaths } from '../indexing/asset-refs'
import { hashContent } from '../indexing/hash'
import { parseNote } from '../markdown/extract'
import { parseFrontmatter, splitFrontmatter, upsertFrontmatter } from '../markdown/frontmatter'
import { getSecret } from '../secrets/keychain'
import type { AiProviderConfig } from '../settings/schema'
import type { ReconcileStop } from './audio-memo'

/**
 * Asset description sidecars (Plan 20). For each eligible image/PDF under
 * `assets/` that is safely associated with public notes, generate a managed
 * markdown sidecar (`<asset>.reflect.md`) holding an AI description + OCR. The
 * note index is untouched; this only writes files next to the asset.
 *
 * The reconcile pass mirrors `reconcileCaptureEnrichment`: generation-pinned,
 * single-flight (the desktop controller serializes calls), abortable between
 * items via `isStale`, and the retry layer for transient provider failures
 * (auth/network stop the pass; the next trigger re-runs it). Privacy is a hard
 * block — an asset referenced by any private note is never sent.
 */

/** Sidecar filename suffix appended to the asset's graph-relative path. */
export const SIDECAR_SUFFIX = '.reflect.md'

/** Largest source we send to a provider; bigger assets are skipped, not sent. */
const MAX_ASSET_BYTES = 20 * 1024 * 1024

/** The eligible asset types and how each enters a provider request. */
interface AssetType {
  kind: AssetKind
  mediaType: string
}

const ASSET_TYPES: Readonly<Record<string, AssetType>> = {
  png: { kind: 'image', mediaType: 'image/png' },
  jpg: { kind: 'image', mediaType: 'image/jpeg' },
  jpeg: { kind: 'image', mediaType: 'image/jpeg' },
  gif: { kind: 'image', mediaType: 'image/gif' },
  webp: { kind: 'image', mediaType: 'image/webp' },
  svg: { kind: 'svg', mediaType: 'image/svg+xml' },
  pdf: { kind: 'pdf', mediaType: 'application/pdf' },
}

/**
 * The asset type for a graph-relative path, or `null` when it is not an
 * eligible asset: outside `assets/`, a sidecar itself, or an unsupported
 * extension. Pure — the watcher's Rust filter mirrors this rule.
 */
export function assetTypeFor(path: string): AssetType | null {
  if (!path.startsWith(`${ASSETS_DIR}/`) || path.endsWith(SIDECAR_SUFFIX)) {
    return null
  }
  const dot = path.lastIndexOf('.')
  if (dot < 0) {
    return null
  }
  return ASSET_TYPES[path.slice(dot + 1).toLowerCase()] ?? null
}

/** Whether a graph-relative path is an asset this feature describes. */
export function isEligibleAssetPath(path: string): boolean {
  return assetTypeFor(path) !== null
}

/** The sidecar path for an asset (`assets/x.png` → `assets/x.png.reflect.md`). */
export function sidecarPathFor(assetPath: string): string {
  return `${assetPath}${SIDECAR_SUFFIX}`
}

/** Provenance recorded in a managed sidecar's frontmatter. */
export interface AssetSidecarMeta {
  /** The graph-relative source asset path. */
  source: string
  /** sha256 of the source bytes (as base64) — the change-detection key. */
  sourceHash: string
  /** Source size in bytes. */
  sourceSize: number
  /** The provider the description was generated with. */
  provider: string
  /** The model id. */
  model: string
  /** ISO-8601 generation timestamp. */
  generatedAt: string
}

/** The managed marker; its presence means Reflect owns the file. */
const managedSidecarSchema = z.object({
  reflectAsset: z.literal(true),
  sourceHash: z.string().optional(),
})

/** A managed sidecar's identity, as read back from disk. */
export interface ManagedSidecar {
  /** The recorded source hash, or `null` if absent (forces a rewrite). */
  sourceHash: string | null
}

/**
 * Read a sidecar's managed marker. `null` means the file is **user-authored**
 * (no `reflectAsset: true`) and must never be overwritten or trusted.
 */
export function readManagedSidecar(source: string): ManagedSidecar | null {
  const parsed = managedSidecarSchema.safeParse(parseFrontmatter(splitFrontmatter(source).raw).data)
  return parsed.success ? { sourceHash: parsed.data.sourceHash ?? null } : null
}

/** Assemble a managed sidecar's full source from its provenance + body. */
export function buildSidecarSource(meta: AssetSidecarMeta, body: string): string {
  return upsertFrontmatter(`${body.trimEnd()}\n`, {
    reflectAsset: true,
    source: meta.source,
    sourceHash: meta.sourceHash,
    sourceSize: meta.sourceSize,
    provider: meta.provider,
    model: meta.model,
    generatedAt: meta.generatedAt,
  })
}

/** Decoded byte length of a base64 payload, without materializing the bytes. */
export function base64ByteLength(base64: string): number {
  const length = base64.length
  if (length === 0) {
    return 0
  }
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((length * 3) / 4) - padding
}

/** Outcome of the privacy gate for one asset. */
export type AssetVerdict = 'send' | 'skip-unreferenced' | 'skip-private'

/**
 * Decide whether an asset may be sent: referenced by ≥1 non-private note and by
 * **0** private notes (unreferenced → skip). Candidate notes come from the
 * index, but the verdict is made from each candidate's **live** markdown — the
 * private flag and a re-confirmation that the body still references the asset.
 * Fails closed: an unreadable candidate blocks the asset.
 */
export async function classifyAsset(assetPath: string, generation: number): Promise<AssetVerdict> {
  const candidates = await assetReferencingNotePaths(assetPath)
  if (candidates.length === 0) {
    return 'skip-unreferenced'
  }
  let publicRefs = 0
  for (const notePath of candidates) {
    let source: string
    try {
      source = await readNote(notePath, generation)
    } catch (cause) {
      if (isAppError(cause) && cause.kind === 'notFound') {
        continue // removed since the index recorded it — not a live referer
      }
      return 'skip-private' // unreadable: cannot clear it, so fail closed
    }
    const parsed = parseNote({ path: notePath, source })
    if (!parsed.assets.some((ref) => ref.path === assetPath)) {
      continue // the index lagged the live body — no longer a referer
    }
    if (parsed.frontmatter.private) {
      return 'skip-private' // the hard block
    }
    publicRefs += 1
  }
  return publicRefs > 0 ? 'send' : 'skip-unreferenced'
}

/** Whether new eligible assets are described automatically vs. only on backfill. */
export type AssetSidecarMode = 'incremental' | 'backfill'

export interface ReconcileAssetSidecarsInput {
  /** The configured-providers state — decides the provider and keychain entry. */
  providers: AiProvidersState
  /** `GraphInfo.generation` — pins every read/write to the issuing graph. */
  generation: number
  /** `incremental` processes `changed`; `backfill` enumerates every asset. */
  mode: AssetSidecarMode
  /** Incremental only: the eligible asset paths the watcher reported changed. */
  changed?: readonly string[]
  /** Host transport for the provider call (the Tauri HTTP plugin's fetch). */
  fetchFn?: typeof fetch
  /** Abort gate, checked between assets and after each slow await. */
  isStale?: () => boolean
  /** Backfill progress: `(processed, total)` after each handled asset. */
  onProgress?: (processed: number, total: number) => void
  /** Injectable clock for the sidecar's `generatedAt`. */
  now?: () => Date
}

export interface ReconcileAssetSidecarsOutcome {
  /** Eligible assets this pass considered. */
  pending: number
  /** Assets described and written this pass. */
  described: number
  /** Skipped — a managed sidecar already matched the source hash. */
  skippedUpToDate: number
  /** Skipped — referenced by no public note (or none at all). */
  skippedUnreferenced: number
  /** Skipped — referenced by a private note (the hard block). */
  skippedPrivate: number
  /** Skipped — an existing sidecar was user-authored, never overwritten. */
  skippedUserAuthored: number
  /** Skipped — larger than the size cap. */
  skippedOversize: number
  /** Permanent provider refusals — logged, no sidecar written. */
  refused: number
  /** Why the pass ended early, or `null` when every asset was handled. */
  stopped: ReconcileStop | null
}

/** Per-asset result; `stop` ends the whole pass, everything else is a tally. */
type AssetStep =
  | { kind: 'described' }
  | {
      kind: 'skipped'
      reason: 'up-to-date' | 'unreferenced' | 'private' | 'user-authored' | 'oversize' | 'gone'
    }
  | { kind: 'refused' }
  | { kind: 'stop'; stopped: ReconcileStop }

interface AssetContext {
  config: AiProviderConfig
  apiKey: string
  generation: number
  fetchFn?: typeof fetch | undefined
  now: () => Date
  isStale: () => boolean
}

const STALE: ReconcileStop = { reason: 'stale', message: 'the graph session ended mid-pass' }

function errorMessage(value: unknown): string {
  return value instanceof Error ? value.message : String(value)
}

function basename(path: string): string {
  return path.split('/').pop() ?? path
}

function utf8FromBase64(base64: string): string {
  return new TextDecoder().decode(base64ToBytes(base64))
}

async function readSidecarSource(path: string, generation: number): Promise<string | null> {
  try {
    return await readNote(path, generation)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      return null
    }
    throw cause
  }
}

/** Process one asset. Throws on transient (auth/network) failure to stop the pass. */
async function processAsset(assetPath: string, ctx: AssetContext): Promise<AssetStep> {
  const assetType = assetTypeFor(assetPath)
  if (assetType === null) {
    return { kind: 'skipped', reason: 'gone' } // defensive: an ineligible path slipped in
  }

  // Gate first, on the notes index: never read or send an asset's bytes until a
  // non-private note is associated with it (and no private note is). Waiting for
  // the association before attempting keeps private and unreferenced assets
  // entirely untouched — they are never read, hashed, or sent to a provider.
  const verdict = await classifyAsset(assetPath, ctx.generation)
  if (ctx.isStale()) {
    return { kind: 'stop', stopped: STALE }
  }
  if (verdict === 'skip-private') {
    return { kind: 'skipped', reason: 'private' }
  }
  if (verdict === 'skip-unreferenced') {
    return { kind: 'skipped', reason: 'unreferenced' }
  }

  let base64: string
  try {
    base64 = await readAsset(assetPath, ctx.generation)
  } catch (cause) {
    if (isAppError(cause) && cause.kind === 'notFound') {
      return { kind: 'skipped', reason: 'gone' } // removed since it was observed
    }
    throw cause
  }

  const sourceHash = await hashContent(base64)
  const sidecarPath = sidecarPathFor(assetPath)
  const existing = await readSidecarSource(sidecarPath, ctx.generation)
  if (existing !== null) {
    const managed = readManagedSidecar(existing)
    if (managed === null) {
      return { kind: 'skipped', reason: 'user-authored' }
    }
    if (managed.sourceHash === sourceHash) {
      return { kind: 'skipped', reason: 'up-to-date' }
    }
  }

  const sourceSize = base64ByteLength(base64)
  if (sourceSize > MAX_ASSET_BYTES) {
    return { kind: 'skipped', reason: 'oversize' }
  }

  if (ctx.isStale()) {
    return { kind: 'stop', stopped: STALE }
  }

  let body: string
  try {
    body = await describeAsset({
      config: ctx.config,
      apiKey: ctx.apiKey,
      fetchFn: ctx.fetchFn,
      kind: assetType.kind,
      mediaType: assetType.mediaType,
      data: assetType.kind === 'svg' ? utf8FromBase64(base64) : base64,
      filename: basename(assetPath),
    })
  } catch (cause) {
    if (isAssetDescriptionRejected(cause)) {
      return { kind: 'refused' } // permanent — log only, no failure sidecar
    }
    throw cause // auth/network — stop the pass, retry on the next trigger
  }
  if (ctx.isStale()) {
    return { kind: 'stop', stopped: STALE }
  }
  if (body === '') {
    return { kind: 'refused' } // an empty description is as useless as a refusal
  }

  await writeNote(
    sidecarPath,
    buildSidecarSource(
      {
        source: assetPath,
        sourceHash,
        sourceSize,
        provider: ctx.config.provider,
        model: ctx.config.model,
        generatedAt: ctx.now().toISOString(),
      },
      body,
    ),
    ctx.generation,
  )
  return { kind: 'described' }
}

async function candidateAssets(input: ReconcileAssetSidecarsInput): Promise<string[]> {
  if (input.mode === 'backfill') {
    const files = await listDir(ASSETS_DIR, input.generation)
    return files.map((file) => file.path).filter(isEligibleAssetPath)
  }
  const unique = new Set<string>()
  for (const path of input.changed ?? []) {
    if (isEligibleAssetPath(path)) {
      unique.add(path)
    }
  }
  return [...unique]
}

/**
 * Describe every candidate asset that needs it. `incremental` mode handles the
 * eligible paths in `changed`; `backfill` mode enumerates every eligible asset
 * under `assets/`. Idempotent in both modes: a managed sidecar whose source
 * hash still matches is skipped, so re-runs are cheap. Never throws.
 */
export async function reconcileAssetSidecars(
  input: ReconcileAssetSidecarsInput,
): Promise<ReconcileAssetSidecarsOutcome> {
  let candidates: string[]
  try {
    candidates = await candidateAssets(input)
  } catch (cause) {
    return {
      pending: 0,
      described: 0,
      skippedUpToDate: 0,
      skippedUnreferenced: 0,
      skippedPrivate: 0,
      skippedUserAuthored: 0,
      skippedOversize: 0,
      refused: 0,
      stopped: { reason: toAppError(cause).kind, message: errorMessage(cause) },
    }
  }

  const total = candidates.length
  let described = 0
  let skippedUpToDate = 0
  let skippedUnreferenced = 0
  let skippedPrivate = 0
  let skippedUserAuthored = 0
  let skippedOversize = 0
  let refused = 0
  const outcome = (stopped: ReconcileStop | null): ReconcileAssetSidecarsOutcome => ({
    pending: total,
    described,
    skippedUpToDate,
    skippedUnreferenced,
    skippedPrivate,
    skippedUserAuthored,
    skippedOversize,
    refused,
    stopped,
  })

  if (total === 0) {
    return outcome(null)
  }

  // Re-resolved every pass: a provider added in Settings mid-session must be
  // seen by the very next pass. Unlike capture there is no non-AI fallback —
  // no provider means nothing can be described, so the pass stops.
  const config = defaultAiProvider(input.providers)
  if (config === null) {
    return outcome({ reason: 'config', message: 'No AI provider is configured.' })
  }
  const apiKey = await getSecret(aiKeySecretName(config.id)).catch(() => null)
  if (apiKey === null) {
    return outcome({
      reason: 'config',
      message: `The API key for the configured ${config.provider} model is missing from the keychain.`,
    })
  }

  const ctx: AssetContext = {
    config,
    apiKey,
    generation: input.generation,
    fetchFn: input.fetchFn,
    now: input.now ?? (() => new Date()),
    isStale: () => input.isStale?.() === true,
  }

  let processed = 0
  for (const assetPath of candidates) {
    if (ctx.isStale()) {
      return outcome(STALE)
    }
    let step: AssetStep
    try {
      step = await processAsset(assetPath, ctx)
    } catch (cause) {
      return outcome({ reason: toAppError(cause).kind, message: errorMessage(cause) })
    }
    if (step.kind === 'stop') {
      return outcome(step.stopped)
    }
    if (step.kind === 'described') {
      described += 1
    } else if (step.kind === 'refused') {
      refused += 1
    } else {
      switch (step.reason) {
        case 'up-to-date':
          skippedUpToDate += 1
          break
        case 'unreferenced':
        case 'gone':
          skippedUnreferenced += 1
          break
        case 'private':
          skippedPrivate += 1
          break
        case 'user-authored':
          skippedUserAuthored += 1
          break
        case 'oversize':
          skippedOversize += 1
          break
      }
    }
    processed += 1
    input.onProgress?.(processed, total)
  }
  return outcome(null)
}
