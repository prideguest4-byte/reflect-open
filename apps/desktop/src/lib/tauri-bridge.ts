import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { setBridge, type IpcBridge } from '@reflect/core'

/**
 * Adapts Tauri's IPC primitives to the `@reflect/core` bridge contract. This is
 * the only place the desktop app touches `@tauri-apps/api` for command/event
 * transport — everything else goes through the typed `@reflect/core` bindings.
 */
export const tauriBridge: IpcBridge = {
  invoke: (command, args) => invoke(command, args),
  listen: (event, handler) => listen(event, (incoming) => handler(incoming.payload)),
}

/**
 * Install the Tauri bridge when running inside a Tauri webview. Plain-browser
 * dev (`pnpm dev` without the shell) installs nothing; `hasBridge()` then gates
 * native-only features like the file watcher and the recents store.
 */
export function installTauriBridge(): void {
  if (isTauri()) {
    setBridge(tauriBridge)
  }
}
