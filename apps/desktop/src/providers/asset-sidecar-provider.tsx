import { useEffect, useRef, type ReactElement, type ReactNode } from 'react'
import type { AiProvidersState, GraphInfo } from '@reflect/core'
import { createAssetSidecarController } from '@/lib/asset-sidecar-controller'
import { useSettings } from '@/providers/settings-provider'

/**
 * Mounts the asset-description lifecycle for the open graph (Plan 20): runs the
 * {@link createAssetSidecarController} loop that describes new eligible
 * images/PDFs into managed `.reflect.md` sidecars. No UI — the only surface is
 * the Settings backfill button; this provider only handles the automatic path
 * for newly added assets, and only when `describeAssets` is on.
 */

interface AssetSidecarProviderProps {
  graph: GraphInfo
  children: ReactNode
}

export function AssetSidecarProvider({ graph, children }: AssetSidecarProviderProps): ReactElement {
  const { settings } = useSettings()
  const describeAssets = settings.describeAssets

  // Read lazily at the start of every pass — a key added in Settings
  // mid-session must be seen without rebuilding the controller.
  const providersRef = useRef<AiProvidersState>({
    providers: settings.aiProviders,
    defaultProviderId: settings.defaultAiProviderId,
  })
  useEffect(() => {
    providersRef.current = {
      providers: settings.aiProviders,
      defaultProviderId: settings.defaultAiProviderId,
    }
  })

  useEffect(() => {
    if (!describeAssets) {
      return
    }
    const controller = createAssetSidecarController({
      generation: graph.generation,
      getProviders: () => providersRef.current,
    })
    controller.start()
    return () => {
      controller.dispose()
    }
  }, [graph.generation, describeAssets])

  return <>{children}</>
}
