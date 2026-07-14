import { useCallback } from 'react'
import type { WikilinkClickHandler } from '@meowdown/core'
import {
  useAssetPersistence,
  type AssetPersistence,
} from '@/editor/use-asset-persistence'
import { useWikiLinkNavigation } from '@/editor/use-wiki-link-navigation'
import { useNoteLinkNavigation } from '@/hooks/use-note-link-navigation'
import type { NewWindowClickEvent } from '@/lib/windows/open-in-new-window'
import { useGraph } from '@/providers/graph-provider'
import { routeForPath } from '@/routing/route'

/** The click plumbing a backlinks surface wires into its rows and snippets. */
export interface BacklinkNavigation {
  /**
   * Open an already-resolved source-note path: a daily note opens the daily
   * view (on mobile that swipes the carousel to the date — the surface stays
   * mounted), anything else opens the note. The arrival never requests focus
   * — on mobile that would raise the keyboard through the stack animation;
   * desktop autofocuses note arrivals anyway. `event` (desktop) lets ⌘-click
   * open a new window; mobile taps omit it.
   */
  openSource: (path: string, event?: NewWindowClickEvent) => void
  /**
   * Navigate a `[[wiki link]]` clicked *inside* a snippet — resolves its
   * target the same way the editor does, distinct from {@link openSource}.
   * Stable, so it never rebuilds the snippet trees.
   */
  onWikilinkClick: WikilinkClickHandler
  /** Resolve `![…](…)` sources inside a snippet to displayable URLs. Stable. */
  resolveImageUrl: (sourcePath: string, src: string) => string | undefined
  /** Claim source-relative Markdown attachment links inside snippets. */
  resolveFileLink: AssetPersistence['resolveFileLinkFromSource']
  /** Classify source-relative wiki embeds inside snippets. */
  resolveWikiEmbed: AssetPersistence['resolveWikiEmbedFromSource']
  /** Resolve source-relative attachment metadata inside snippets. */
  resolveFileInfo: AssetPersistence['resolveFileInfoFromSource']
  /** Resolve and open a source-relative attachment from an interactive snippet. */
  openAttachment: AssetPersistence['openAttachmentFromSource']
  /** Changes when snippets must rebuild their attachment rendering. */
  resolverRevision: number
}

/**
 * Navigation for an incoming-backlinks surface, shared by the desktop panel
 * and the mobile section. Wiki links and images inside snippets resolve
 * through the same pipelines as the editor.
 */
export function useBacklinkNavigation(): BacklinkNavigation {
  const { graph } = useGraph()
  const navigateNoteLink = useNoteLinkNavigation()

  const openSource = useCallback(
    (target: string, event?: NewWindowClickEvent) => {
      navigateNoteLink(routeForPath(target), event)
    },
    [navigateNoteLink],
  )

  const navigateWikiLink = useWikiLinkNavigation(graph?.generation ?? null)
  const {
    resolveImageUrlFromSource,
    resolveFileLinkFromSource,
    resolveWikiEmbedFromSource,
    resolveFileInfoFromSource,
    openAttachmentFromSource,
    attachmentCatalogRevision,
  } = useAssetPersistence(graph?.generation ?? null)
  const onWikilinkClick = useCallback<WikilinkClickHandler>(
    ({ target, event }) => navigateWikiLink(target, event),
    [navigateWikiLink],
  )
  const resolveImageUrlStable = useCallback(
    (sourcePath: string, src: string) => resolveImageUrlFromSource(sourcePath, src) ?? undefined,
    [resolveImageUrlFromSource],
  )

  return {
    openSource,
    onWikilinkClick,
    resolveImageUrl: resolveImageUrlStable,
    resolveFileLink: resolveFileLinkFromSource,
    resolveWikiEmbed: resolveWikiEmbedFromSource,
    resolveFileInfo: resolveFileInfoFromSource,
    openAttachment: openAttachmentFromSource,
    resolverRevision: attachmentCatalogRevision,
  }
}
