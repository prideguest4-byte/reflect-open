import { type ReactElement } from 'react'
import { FolderInput } from 'lucide-react'
import { SettingsField } from '@/components/settings/field'
import { SettingsSection } from '@/components/settings/section'
import { Button } from '@/components/ui/button'
import { useGraph } from '@/providers/graph-provider'

/**
 * Settings → Import: bring notes across from a Reflect v1 export after
 * first-run (the welcome screen offers the same flow behind its v1 link).
 * A v1 export *is* a graph folder — opening it bootstraps the layout and
 * rebuilds the index from the files, so this is the folder picker with
 * migration-specific copy, not a separate pipeline.
 */
export function ImportSection(): ReactElement {
  const { pickAndOpen } = useGraph()
  return (
    <SettingsSection id="import">
      <SettingsField
        legend="Reflect v1"
        description="In Reflect v1, export a “Reflect Open folder” (Settings → Graph → Export), unzip it, then open it here."
      >
        <div className="mt-2">
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void pickAndOpen()}
          >
            <FolderInput aria-hidden strokeWidth={1.75} />
            Open exported folder…
          </Button>
        </div>
      </SettingsField>
    </SettingsSection>
  )
}
