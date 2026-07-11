import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from 'react'
import {
  dateFromDailyPath,
  resolveExistingWikiTarget,
  splitFrontmatter,
  type DateFormat,
  type FileChange,
} from '@reflect/core'
import { MarkdownPreview } from '@/editor/markdown-preview'
import { formatDayLabel } from '@/lib/dates'
import { readExistingNoteSource } from '@/lib/read-existing-note-source'
import { useFileChanges } from '@/lib/use-file-changes'

interface WikiLinkHoverPreviewProps {
  target: string
  dismiss: () => void
  generation: number | null
  graphKey: string | null
  dateFormat: DateFormat
  resolveImageUrl: (src: string) => string | null
  resolveAssetOpenPath: (src: string) => string | null
}

interface PreviewScope {
  target: string
  generation: number
  graphKey: string
}

interface PreviewLoad {
  scope: PreviewScope
  watcherCycle: object
  path: string
  body: string | null
}

function sameScope(load: PreviewLoad, scope: PreviewScope | null): boolean {
  return (
    scope !== null &&
    load.scope.target === scope.target &&
    load.scope.generation === scope.generation &&
    load.scope.graphKey === scope.graphKey
  )
}

function isSvgAsset(path: string): boolean {
  return path.toLowerCase().endsWith('.svg')
}

function previewRasterUrl(url: string): string {
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}reflect-preview=raster`
}

/**
 * Reflect's passive body for Meowdown's wiki-link hover card.
 *
 * The component remains visually empty until target resolution and the local
 * read both succeed. Every request is scoped to the target and graph session,
 * so late work from a previous hover can never replace the current preview.
 */
export function WikiLinkHoverPreview({
  target,
  dismiss,
  generation,
  graphKey,
  dateFormat,
  resolveImageUrl,
  resolveAssetOpenPath,
}: WikiLinkHoverPreviewProps): ReactElement | null {
  const [load, setLoad] = useState<PreviewLoad | null>(null)
  const requestEpoch = useRef(0)
  const previousSession = useRef({ generation, graphKey })
  const changeSequence = useRef(0)
  const pathChangeSequence = useRef(new Map<string, number>())
  const resolvedPath = useRef<string | null>(null)
  const currentScope =
    generation === null || graphKey === null ? null : { target, generation, graphKey }

  const handleFileChanges = useCallback(
    (changes: FileChange[]) => {
      let resolvedTargetChanged = false
      for (const change of changes) {
        const sequence = ++changeSequence.current
        pathChangeSequence.current.set(change.path, sequence)
        if (change.path === resolvedPath.current) {
          resolvedTargetChanged = true
        }
      }
      if (!resolvedTargetChanged) {
        return
      }
      requestEpoch.current += 1
      resolvedPath.current = null
      setLoad(null)
      dismiss()
    },
    [dismiss],
  )
  const { cycle: watcherCycle, settled: watcherSettled } = useFileChanges(handleFileChanges)
  const visibleLoad =
    watcherSettled &&
    load !== null &&
    load.watcherCycle === watcherCycle &&
    sameScope(load, currentScope)
      ? load
      : null

  useEffect(() => {
    const epoch = ++requestEpoch.current
    let active = true
    resolvedPath.current = null

    if (!watcherSettled) {
      return () => {
        active = false
        requestEpoch.current += 1
        resolvedPath.current = null
      }
    }

    const requestStartSequence = changeSequence.current
    const sessionChanged =
      previousSession.current.generation !== generation ||
      previousSession.current.graphKey !== graphKey
    previousSession.current = { generation, graphKey }

    if (sessionChanged || generation === null || graphKey === null) {
      dismiss()
      return () => {
        active = false
        requestEpoch.current += 1
      }
    }
    const requestScope: PreviewScope = { target, generation, graphKey }

    void (async () => {
      try {
        const resolution = await resolveExistingWikiTarget(
          requestScope.target,
          requestScope.generation,
        )
        if (!active || requestEpoch.current !== epoch) {
          return
        }
        if (resolution.kind !== 'resolved') {
          dismiss()
          return
        }
        const changedDuringRequest = (): boolean =>
          (pathChangeSequence.current.get(resolution.path) ?? 0) > requestStartSequence
        if (changedDuringRequest()) {
          dismiss()
          return
        }

        resolvedPath.current = resolution.path
        setLoad({
          scope: requestScope,
          watcherCycle,
          path: resolution.path,
          body: null,
        })
        const source = await readExistingNoteSource(
          resolution.path,
          requestScope.generation,
        )
        if (!active || requestEpoch.current !== epoch) {
          return
        }
        if (changedDuringRequest()) {
          resolvedPath.current = null
          setLoad(null)
          dismiss()
          return
        }
        setLoad({
          scope: requestScope,
          watcherCycle,
          path: resolution.path,
          body: splitFrontmatter(source).body,
        })
      } catch {
        if (active && requestEpoch.current === epoch) {
          dismiss()
        }
      }
    })()

    return () => {
      active = false
      requestEpoch.current += 1
      resolvedPath.current = null
    }
  }, [dismiss, generation, graphKey, target, watcherCycle, watcherSettled])

  const resolveLocalImageUrl = useCallback(
    (source: string): string | null => {
      const assetPath = resolveAssetOpenPath(source)
      // SVG can contain external subresource references. The filename check
      // avoids an unnecessary request; the query also makes the asset protocol
      // enforce a sniffed raster MIME allowlist, so renamed SVG bytes cannot
      // bypass the passive card's no-network boundary.
      if (assetPath === null || isSvgAsset(assetPath)) {
        return null
      }
      const url = resolveImageUrl(assetPath)
      return url === null ? null : previewRasterUrl(url)
    },
    [resolveAssetOpenPath, resolveImageUrl],
  )

  if (visibleLoad?.body === null || visibleLoad?.body === undefined) {
    return null
  }

  const dailyDate = dateFromDailyPath(visibleLoad.path)
  const empty = visibleLoad.body.trim().length === 0

  return (
    <aside
      aria-hidden="true"
      className="pointer-events-none max-h-[200px] w-full select-none overflow-hidden rounded-lg bg-popover p-3 text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10"
      data-testid="wiki-link-hover-preview"
    >
      {dailyDate !== null ? (
        <div className="reflect-daily-subject mb-2 text-base">
          {formatDayLabel(dailyDate, dateFormat)}
        </div>
      ) : null}
      {empty ? (
        <p className="text-text-muted">Empty note</p>
      ) : (
        <MarkdownPreview
          content={visibleLoad.body}
          resolveImageUrl={resolveLocalImageUrl}
          interactive={false}
          renderEmbeds={false}
          className="text-xs leading-relaxed"
        />
      )}
    </aside>
  )
}
