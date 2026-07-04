# Running the iOS simulator

Reflect mobile is the iOS target of `apps/desktop`, so the simulator dev loop
uses Tauri's iOS command rather than a separate app package.

From the repo root:

```bash
pnpm tauri ios dev "iPhone 17 Pro"
```

The root `tauri` script delegates to `apps/desktop`, so the command runs the
usual sidecar step and starts Vite through Tauri's `beforeDevCommand`.

To see simulator names:

```bash
xcrun simctl list devices available
```

The first run can be quiet for a while because Xcode is compiling the Rust
crate, the Swift keyboard plugin, and native dependencies for
`aarch64-apple-ios-sim`. A healthy launch eventually prints the Plan 19 probe
lines from `spike_mobile.rs`:

```text
[plan19-spike] PASS: keychain round-trip
[plan19-spike] PASS: sqlite fts5
[plan19-spike] PASS: documents file io
[plan19-spike] PASS: libgit2 init+commit
```

`tauri ios dev` may normalize generated files under
`apps/desktop/src-tauri/gen/apple/`, including `project.pbxproj` quoting and
merged `Info.plist` usage descriptions. Inspect those diffs before committing;
when the generated output is intentionally refreshed, update the source
template in `apps/desktop/src-tauri/ios.project.yml` or
`apps/desktop/src-tauri/Info.plist` first.
