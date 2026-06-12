import type { ReactElement } from 'react'
import { MarkdownPreview } from '@/editor/markdown-preview'
import { useWikiLinkNavigation } from '@/editor/use-wiki-link-navigation'
import type { ChatTranscriptMessage } from '@/lib/chat-transcript'
import { cn } from '@/lib/utils'
import { ChatToolChip } from './chat-tool-chip'

interface ChatMessageProps {
  message: ChatTranscriptMessage
}

/**
 * One conversation turn. User messages are compact right-aligned bubbles;
 * assistant messages render their parts in order — markdown text (through the
 * same read-only preview the palette uses, so `[[citations]]` appear as the
 * editor's wiki-link chips and click through to the note) interleaved with
 * the tool activity that grounded them.
 *
 * Wiki navigation passes a null generation deliberately: a clicked citation
 * that doesn't resolve must never *create* a note the model hallucinated.
 */
export function ChatMessage({ message }: ChatMessageProps): ReactElement {
  const navigateWikiLink = useWikiLinkNavigation(null)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-surface-hover px-4 py-2 text-sm whitespace-pre-wrap text-text">
          {message.text}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {message.parts.length === 0 ? (
        <span className="animate-pulse text-sm text-text-muted">Thinking…</span>
      ) : null}
      {message.parts.map((part, index) => {
        switch (part.kind) {
          case 'text':
            return (
              <MarkdownPreview
                key={index}
                content={part.text}
                onWikiLinkClick={navigateWikiLink}
                className="text-sm"
              />
            )
          case 'search':
          case 'read':
            return <ChatToolChip key={index} part={part} />
          case 'notice':
            return (
              <p
                key={index}
                className={cn(
                  'text-sm',
                  part.tone === 'error' ? 'text-destructive' : 'text-text-muted italic',
                )}
              >
                {part.text}
              </p>
            )
        }
      })}
    </div>
  )
}
