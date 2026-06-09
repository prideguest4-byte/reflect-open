import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import { useRouter } from './router'

interface ScrollRestoredProps {
  className?: string
  children: ReactNode
}

/**
 * A scroll container wired to the router's per-entry scroll memory (Plan 06b):
 * it reports its offset as the user scrolls and restores the saved offset when
 * a history entry is revisited via back/forward. The daily stream does the same
 * through its virtualizer; this is for plain views (note, search).
 */
export function ScrollRestored({ className, children }: ScrollRestoredProps): ReactElement {
  const { saveScrollState, savedScroll } = useRouter()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const restored = savedScroll()
    if (restored !== null && ref.current) {
      ref.current.scrollTop = restored
    }
  }, [savedScroll])

  return (
    <div
      ref={ref}
      className={className}
      onScroll={(event) => saveScrollState(event.currentTarget.scrollTop)}
    >
      {children}
    </div>
  )
}
