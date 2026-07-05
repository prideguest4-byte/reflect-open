import type { ReactElement, ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface MobileScreenHeaderProps {
  title: string
  /** Pop the screen (the router's back, with a today fallback on cold entry). */
  onBack: () => void
  /** Optional trailing control (an add button, …). */
  trailing?: ReactNode
}

/**
 * The pushed-screen header bar: back chevron, title, optional trailing
 * control — the same chrome as the note screen, shared by the settings
 * screens so every card in the stack navigates the same way.
 */
export function MobileScreenHeader({ title, onBack, trailing }: MobileScreenHeaderProps): ReactElement {
  return (
    <header className="flex shrink-0 items-center gap-1 border-b border-border px-1 pb-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-10"
        aria-label="Back"
        onClick={onBack}
      >
        <ChevronLeft />
      </Button>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold">{title}</h1>
      {trailing}
    </header>
  )
}
