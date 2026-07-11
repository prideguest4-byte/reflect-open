import { useCallback, type ReactNode } from 'react'
import type { WikilinkHoverCardRenderContext } from '@meowdown/react'
import type { DateFormat } from '@reflect/core'
import { WikiLinkHoverPreview } from '@/components/wiki-link-hover-preview'

interface WikiLinkHoverPreviewOptions {
  generation: number | null
  graphKey: string | null
  dateFormat: DateFormat
  resolveImageUrl: (src: string) => string | null
  resolveAssetOpenPath: (src: string) => string | null
}

/** Build the target renderer supplied to Meowdown's editor-scoped hover card. */
export function useWikiLinkHoverPreview({
  generation,
  graphKey,
  dateFormat,
  resolveImageUrl,
  resolveAssetOpenPath,
}: WikiLinkHoverPreviewOptions): (context: WikilinkHoverCardRenderContext) => ReactNode {
  return useCallback(
    ({ target, dismiss }: WikilinkHoverCardRenderContext) => (
      <WikiLinkHoverPreview
        target={target}
        dismiss={dismiss}
        generation={generation}
        graphKey={graphKey}
        dateFormat={dateFormat}
        resolveImageUrl={resolveImageUrl}
        resolveAssetOpenPath={resolveAssetOpenPath}
      />
    ),
    [dateFormat, generation, graphKey, resolveAssetOpenPath, resolveImageUrl],
  )
}
