# Plan 21 — iCloud Document Sync

> **Status (2026-07-04): Phase 1 implemented** — iOS iCloud container storage
> + iCloud-first onboarding (`apps/desktop/src-tauri/src/icloud.rs`, the
> entitlements/`NSUbiquitousContainers` config, `mobileStorage` IPC +
> `mobileStorage` settings key, the reworked
> `apps/desktop/src/mobile/onboarding-screen.tsx`, the foreground refresh in
> `apps/desktop/src/mobile/use-icloud-refresh.ts`, and the desktop chooser
> nudge). Ships behind nothing; needs the on-device verification checklist
> below before release. Phases 2–3 are direction.

**Goal:** Make iCloud Drive the primary way people set up and sync a graph.
Notes are plain markdown in a folder; iCloud is the sync transport Apple
users already have — no account creation, no repository jargon. Git/GitHub
remains fully supported as the versioned-backup path for people who want it,
but the product leads with iCloud everywhere: iOS onboarding, the desktop
chooser, and the README.

**Depends on:** Plan 02 (graph file IO), Plan 12 (sync engine + plain-language
states), Plan 19 (mobile app, fixed roots, onboarding gate).

**Supersedes in part:** the first-wave decision in
[reflect-v2-sync-strategy.md](../reflect-v2-sync-strategy.md) that file-sync
folder providers are unsupported by design. That held for the git-only wave;
this plan makes iCloud Drive a supported storage home. The full *adapter*
treatment there (normalized conflicts, AI-assisted resolution) remains
long-term direction, not Phase 1.

## The topology decision: app container, not folder picker

Two ways an iOS app can reach iCloud Drive markdown:

1. **The app's own ubiquity container** (`iCloud.app.reflect.ios`) — appears
   as an app folder ("Reflect", with the app icon) in the Files app and in
   Finder's iCloud Drive. No pickers, no security-scoped bookmarks; the
   container path is derivable every launch. This is what Obsidian does, and
   users already understand "your notes live in iCloud Drive → *AppName*".
2. **An arbitrary user-picked folder** via `UIDocumentPickerViewController` +
   persisted security-scoped bookmarks. Maximally flexible (any iCloud Drive
   folder, even Dropbox providers), but needs a Swift picker plugin,
   bookmark persistence across container-UUID changes, scoped-access
   lifetimes around every file operation, and NSFileCoordinator discipline.

**Phase 1 chose the container** — dramatically less native machinery and no
scoped-access failure modes. Consequence: a phone-and-Mac graph lives in
`iCloud Drive/Reflect/` (on disk:
`~/Library/Mobile Documents/iCloud~app~reflect~ios/Documents/`). The Mac app
needs **no entitlement** to use it — the iCloud daemon syncs everything under
`Mobile Documents/` no matter which process wrote it — so desktop's only job
is pointing users at that folder (the chooser tip does; deeper desktop
integration is Phase 2). A Mac-first user whose graph lives elsewhere in
iCloud Drive still gets backup today and moves the folder (or waits for the
Phase 2 picker) to share it with the phone. The folder appears on the Mac
only after the iOS app has run once — `NSUbiquitousContainerIsDocumentScopePublic`
takes effect when the container first receives content.

## What Phase 1 shipped

- **Rust (`icloud.rs`)**: `mobile_storage` resolves both roots off the main
  thread (`URLForUbiquityContainerIdentifier` can block) and reports whether
  the container already holds notes — detected from `daily/`/`notes/`/
  `templates/` entries *including* `.icloud` placeholders, because `.reflect/`
  is sync-excluded and never arrives on a second device.
  `icloud_download_pending` walks the graph and nudges every placeholder
  (iOS does not download container files eagerly), returning the count so the
  frontend can re-reconcile while it drains.
- **Config**: CloudDocuments entitlements + `NSUbiquitousContainers`
  (document-scope public, container name "Reflect") in `ios.project.yml`, the
  generated `gen/apple` mirrors, and the entitlements plist.
- **`.reflect/` exclusion widened to iOS** (`fs/io.rs` cfg now
  `any(macos, ios)`): the per-device index, WAL churn, and the durable
  `chat_*` tables must never ride iCloud between devices — two devices
  sharing one `.reflect/` would clobber each other's projections and chat
  history. Uses the same best-effort resource keys + provider-ignore xattrs
  as macOS.
- **Frontend storage model**: `mobileStorage()` IPC; a persisted
  `mobileStorage: 'icloud' | 'local'` settings key (kind only — container
  paths change across restore/update, so absolute paths are re-derived every
  launch; the default `'local'` keeps pre-Plan-21 installs on the root they
  already use). `GraphProvider` opens the persisted kind, and when the kind
  is `'icloud'` but the container is gone (signed out) it parks on an honest
  error instead of silently opening an empty local graph.
- **Onboarding, iCloud-first**: primary action **Store in iCloud Drive**
  (relabelled **Open your iCloud notes** when the container already has
  content), secondary **Keep notes on this device**, and **Sync with GitHub
  instead** as a link into the unchanged device-flow → clone steps (clones
  land in the local root). When iCloud is unavailable the local button leads
  and a hint explains signing in to iCloud.
- **Foreground refresh** (`use-icloud-refresh.ts`): mobile has no file
  watcher, and iCloud writes land behind the app's back — on open and on
  every app resume (deduped like the backup controller's triggers) it nudges
  downloads, re-runs the index reconcile, and reconciles once more shortly
  after when placeholders were still pending.
- **Surfaces**: mobile settings sheet shows Storage (iCloud Drive / This
  device); the desktop chooser tip now routes iPhone users to
  `iCloud Drive → Reflect`, and a macOS first run starts the folder picker in
  iCloud Drive.

## Decisions

- **D1 — container over picker** (above). Revisit only if Mac-first arbitrary
  folders prove to be the dominant demand.
- **D2 — the container root *is* the graph root.** No nested per-graph
  folders; "Open your iCloud notes" and "Store in iCloud Drive" converge on
  the same directory, which makes the has-notes detection cosmetic (a late
  first sync merely relabels the button; opening early is still correct — the
  content merges in as it arrives and the refresh pass indexes it).
- **D3 — iCloud graphs don't run git.** Storage kinds are exclusive in v1:
  the sync engine only engages for graphs with a git remote (local/cloned
  roots), so the status pill stays quiet for iCloud graphs rather than
  claiming "Not backed up" over Apple-managed sync. A `.git` directory inside
  iCloud Drive would sync object files between devices — a known corruption
  path we deliberately avoid.
- **D4 — conflicts stay contained, not merged.** iCloud's file-level conflict
  behavior (duplicate `note 2.md` files, provider versions) is left to the
  OS in Phase 1; the editor's normal external-change reconciliation applies.
  The sync-strategy doc's adapter model (normalize → AI-assist → resolve) is
  the Phase 3 shape if duplicates hurt in practice.

## On-device verification checklist (before the next TestFlight)

The pieces below can't be exercised in CI or the simulator-without-account;
they are the release gate for this plan:

1. First entitled build: Xcode automatic signing registers
   `iCloud.app.reflect.ios` against the App ID (needs the team account; then
   `pnpm release:ios preflight` should pass with the updated profile).
2. Fresh install, signed-in device: **Store in iCloud Drive** → notes appear
   in Files → iCloud Drive → Reflect; `daily/`, `notes/`, `assets/` visible;
   `.reflect/` present locally.
3. **`.reflect/` does not sync**: after editing on the device, confirm on
   iCloud.com (or a second device) that the container shows notes but no
   `.reflect/` — if it *does* sync, the fallback is relocating the mobile
   index outside the synced root (Application Support keyed by graph), which
   is a contained change behind `fs::resolve`.
4. Mac + iPhone round trip: Mac opens `iCloud Drive/Reflect`, edits today's
   note; iPhone resume shows the edit (download nudge + reconcile). Reverse
   direction likewise.
5. Signed-out relaunch: the app parks on the "sign in to iCloud" error, and
   signing back in + relaunching reopens the graph.
6. Restore/update path: container UUID changes; the persisted *kind* still
   resolves (no dead absolute paths anywhere).

## Phase 2 — desktop meets the container

- Detect `~/Library/Mobile Documents/iCloud~app~reflect~ios/Documents` on
  macOS; when it holds a graph, surface "Open your iCloud notes" on the
  chooser (recents-style shortcut) instead of relying on copy.
- "Move this graph to iCloud" (desktop and mobile): copy notes into the
  container, re-open, forget the old root. Unblocks pre-Plan-21 mobile
  installs stranded on `'local'`.
- README/marketing copy: lead with the container folder story.

## Phase 3 — sync quality (the adapter work)

- `NSMetadataQuery`/file-provider change signal instead of resume-polling, so
  Mac edits appear live while the phone is open.
- Placeholder-aware indexing (surface "downloading…" rows instead of hiding
  undownloaded notes).
- iCloud conflict normalization into the Plan 12 conflict UI (duplicate
  files, `NSFileVersion` provider versions), per the sync-strategy adapter
  model.
- Battery/network hygiene: batch download nudges, skip `assets/` blobs on
  cellular if complaints arrive.

## Failure cases

- **iCloud quota full**: writes keep succeeding locally (the container is a
  normal directory); iCloud pauses upload. Invisible to us in Phase 1; the
  Files app surfaces it. Phase 3 could read upload status per file.
- **Sign-out with the graph open**: iOS preserves the local container copy
  until sign-out completes; next launch hits the parked error path. Notes are
  never deleted by Reflect.
- **Container never resolves despite sign-in** (entitlement/profile drift):
  `mobile_storage` reports `icloudRoot: null`, onboarding falls back to
  local-first with the sign-in hint — the app is never bricked, but watch for
  this in TestFlight feedback; it means signing config regressed.
