# iOS TestFlight Crash Investigation

Notes from the TestFlight feedback archives downloaded from App Store Connect
on 2026-07-09 (`/Users/alex/Downloads/testflight_feedback*`). These reports may
represent more than one issue; only one archive included an actual crash log.

## Reports

| Feedback archive | Build | Device / OS | Crash log | Tester comment |
| --- | --- | --- | --- | --- |
| `testflight_feedback (1).zip` | `0.4.0 (202607081054)` | `iPhone18,4`, iOS `26.5.1` | Yes | "Crashed dunno why. Maybe link" |
| `testflight_feedback.zip` | `0.4.0 (202607072248)` | `iPhone18,4`, iOS `26.5.1` | No | "Audio memo widget" |
| `testflight_feedback (2).zip` | `0.4.0 (202607061546)` | `iPhone16,2`, iOS `26.5` | No | "Just crashed on vault mount" |
| `testflight_feedback (3).zip` | `0.4.0 (202607061546)` | `iPhone17,2`, iOS `26.5` | No | "First time start - crash - guess during creating index?" |

Treat the metadata-only reports as supporting context, not proof. They establish
that short-session crashes were reported around graph mount, first start, and
the audio memo widget, but they do not include stacks or termination reasons.

## Confirmed Crash Signature

Crash log: `testflight_feedback (1).zip` / `crashlog.crash`

- Incident identifier: `8DD142F5-1007-4814-BE40-51CF16DEAEAC`
- Process: `Reflect`
- Bundle identifier: `app.reflect.ios`
- Build: `0.4.0 (202607081054)`
- Crash time: `2026-07-08 23:12:16 +0100`
- Exception: `EXC_CRASH (SIGKILL)`
- Termination reason: `RUNNINGBOARD 0xdead10cc`

Apple documents this class of kill as the operating system terminating the app
because it held a file lock or SQLite database lock while being suspended:
<https://developer.apple.com/documentation/xcode/sigkill>.

The crashing thread was not throwing a Rust panic or JavaScript exception. It
was inside SQLite while applying an index batch:

```text
pread
unixRead
readDbPage
sqlite3BtreeNext
sqlite3VdbeExec
sqlite3_step
fts5NextMethod
sqlite3_step
rusqlite::statement::Statement::execute_with_bound_parameters
reflect_open_lib::db::write::remove_note
reflect_open_lib::db::apply_in_txn
reflect_open_lib::db::index_apply_batch
```

The relevant write path is:

- `packages/core/src/indexing/indexer.ts` batches up to
  `INDEX_APPLY_BATCH_SIZE = 256` notes per `index_apply_batch`.
- `apps/desktop/src-tauri/src/db/mod.rs` opens one SQLite transaction for the
  batch and loops through `write::apply_note`.
- `apps/desktop/src-tauri/src/db/write.rs` removes old rows before applying a
  note, including `DELETE FROM search_fts WHERE path = ?1`.

The same process snapshot also had a Tokio blocking thread inside iCloud
conflict scanning:

```text
NSFileVersion::unresolvedConflictVersionsOfItemAtURL
reflect_open_lib::icloud::versions::platform::unresolved_versions
reflect_open_lib::icloud::sweep::run_sweep
```

That maps to `apps/desktop/src-tauri/src/icloud/sweep.rs` and
`apps/desktop/src-tauri/src/icloud/versions.rs`.

## Working Theory

The confirmed crash is most likely an iOS suspend-time resource-lock kill:
Reflect was backgrounded or otherwise suspended while an index transaction held
the SQLite index, with iCloud/FileProvider work also active in the process.

This points away from note-content parsing, link handling, and ordinary app
logic exceptions. It points toward lifecycle management around long-running
native work on iOS:

- Index apply batches can hold SQLite locks across many note writes and FTS
  deletes.
- Mobile background flush intentionally starts write IPCs when the app is going
  hidden, so dirty buffers land before iOS suspends the process.
- iCloud conflict scanning runs `NSFileVersion`/FileProvider calls on a blocking
  thread and can overlap index work.
- The SQLite DB lives at `<graph>/.reflect/index.sqlite`. For iCloud graphs,
  `.reflect/` is meant to be local-only. If sync exclusion fails or is applied
  late, SQLite can sit under FileProvider-managed storage, increasing the chance
  of `0xdead10cc`.

The metadata-only reports are plausibly related to this path when they mention
first start, vault mount, or index creation, because those flows can trigger
bulk reconcile/rebuild. The audio memo widget report may be a separate issue
unless future crash logs show the same termination reason.

## Mitigation Candidates

1. Add native iOS background-task protection around unavoidable background
   flushes and index writes, requesting time before starting file/SQLite work
   and ending it once locks are released.
2. Stop scheduling new index applies and iCloud conflict sweeps once
   `visibilityState` becomes hidden; resume/reconcile on foreground instead.
3. Reduce mobile `index_apply_batch` transaction size or make it platform-aware,
   so each SQLite lock is held for less time on iOS.
4. Ensure in-flight iCloud conflict scans are not started during app suspend and
   cannot immediately chain into index writes while the app is leaving the
   foreground.
5. Verify on-device that `.reflect/` has the expected Apple sync-exclusion
   resource keys before opening `<graph>/.reflect/index.sqlite`; log loudly when
   marking fails.
6. Add crash-log triage guidance to TestFlight collection: always preserve the
   `.crash`/`.ips` payload and group by termination reason before assuming
   tester comments describe the same failure.

## Reproduction Ideas

- On an iCloud graph with many notes, force a projection-version bump or wipe
  the rebuildable index, launch on iOS, then quickly background the app during
  the first index pass.
- On an iCloud graph with pending downloads/conflict versions, launch and
  background during the initial iCloud conflict sweep.
- Instrument index transaction start/end, iCloud sweep start/end, app
  visibility transitions, and sync-exclusion marking so future TestFlight logs
  can confirm whether a `0xdead10cc` kill occurred while a SQLite transaction
  or FileProvider call was active.
