# Non-daily note editing — final report

Date: 2026-06-09

## PR

**https://github.com/team-reflect/reflect-open/pull/25** — "Non-daily notes:
seeded Untitled new-note flow + testable route seam", base `master`.

- Branch: `feat/non-daily-note-editing-20260609-2233`
- Base: `origin/master` @ `4fe1dc859e6cb79c58244a8a0c1d5985d207df1a`
- Feature commit: `3c55adaf099d4216f376fa3a2c8148d23e06d468`

## What the audit found (and changed about the task)

The kickoff hypothesis — "currently only daily notes can be edited" — was
**stale against this base**: `note` routes already rendered a fully editable
`NotePane` wired into the Plan 05 save pipeline, reachable from the ⌘K
palette, wiki links, backlinks, related notes, ⌘N, and the random-note
command (all 187 baseline tests green before any change). The real,
verifiable gaps in the non-daily editing story were:

1. **An untested route → view seam.** `RouteContent` was private to
   `graph-workspace.tsx`; no test pinned "a note route opens an editable
   pane, not the daily stream."
2. **⌘N's unfindable notes.** A missing `notes/<ulid>.md` opened blank;
   saving body-only content produced a note titled by its ULID filename
   (`deriveTitle` fallback) — junk in search and the palette. Old Reflect
   seeds a subject and focuses it on create.

## Files changed, by theme

### New-note seed (session level — lazy contract preserved)
- `apps/desktop/src/editor/note-session.ts` — `missing` snapshot flag;
  `missingSeed` option adopted as the clean disk baseline (no write until a
  real edit); `onContent('load')` reports real disk content so the rename
  tracker baselines untitled (first authored title = birth, not rename);
  `missing` clears on first landed save / adopted external content.
- `apps/desktop/src/editor/use-note-document.ts` — passes `missingSeed`
  through; session recreated when it changes.
- `apps/desktop/src/components/note-pane.tsx` — seeds `# Untitled\n` for
  missing **non-daily** notes only; autofocus selects the title for a
  seeded note (plain focus otherwise); daily notes excluded from rename
  tracking.

### Title selection (the macOS rename pattern)
- `apps/desktop/src/editor/title-selection.ts` (new) — pure helper +
  ProseMirror command selecting the first heading's text; false (→ plain
  focus fallback) when there is no titled heading.
- `apps/desktop/src/editor/note-editor.tsx` — `selectTitle()` on
  `NoteEditorHandle`.

### Route seam extraction
- `apps/desktop/src/components/route-content.tsx` (new) — `RouteContent` +
  `SearchRoute` moved verbatim out of `graph-workspace.tsx`.
- `apps/desktop/src/components/graph-workspace.tsx` — slimmed to the shell.
- `apps/desktop/src/components/daily-stream.tsx` — `data-testid` for tests.

### Tests (+20 → 207 total)
- `apps/desktop/src/editor/note-session.test.ts` (+6) — seed/missing
  contracts (see below); harness extended for notFound reads +
  `createIfMissing`/`missingSeed`.
- `apps/desktop/src/editor/title-selection.test.ts` (new, 6) — against real
  meowdown documents.
- `apps/desktop/src/components/route-content.test.tsx` (new, 8) — real
  router → RouteContent → NotePane → session over a fake IPC bridge; only
  the ProseMirror view is stubbed (jsdom can't host contenteditable).
- `apps/desktop/src/editor/use-note-document.test.tsx` — fake handle gained
  `selectTitle`.

### Docs
- `docs/non-daily-notes/plan.md`, `status.md`, `final-report.md` (this file).

## Key design decisions

- **Literal `# Untitled\n`, not an empty heading**: probed the round-trip
  classifier — `'#\n\nbody\n'` reserializes as `'# \n\nbody\n'` and
  classifies **lossy**, which would open every brand-new note read-only (the
  protection trap). `# Untitled\n` round-trips exactly.
- **Seed at the session, not the editor**: the seed becomes the
  dirty-comparison baseline, so a mount-time editor echo can't create the
  file; opening still litters nothing.
- **No junk aliases**: the rename tracker receives the real (empty) disk
  content at load, so naming the note is a birth — no `aliases: [Untitled]`.

## Verification

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | OK (core, db, desktop) |
| `pnpm lint` (oxlint) | OK, clean |
| `pnpm test` | OK — 33 files, **207 tests** (187 baseline + 20 new) |
| `pnpm build` | OK (pre-existing >500 kB chunk warning only) |
| `pnpm tauri dev` | **Blocked** — no Rust toolchain on this machine (`cargo: not found`; `~/.cargo/bin` has no cargo/rustc) |
| `pnpm dev` (vite) | Boots; `curl http://localhost:1420/` → HTTP 200 |

## Tests covering the gap

- Seed shown but never written; flush of an untouched seeded note writes
  nothing; editor echoing the seed back stays clean.
- First real edit writes the full content, creates the file, clears
  `missing`; missing-without-seed (daily) opens empty; existing files ignore
  the seed; an external create while the seed shows adopts cleanly (no
  conflict).
- Title range/selection on real meowdown docs incl. non-first headings and
  the empty-heading fallback.
- Route seam: today/daily/malformed-date → stream; note → editable
  `Editing notes/…` pane (not the stream) with plain focus; missing note →
  seeded + `selectTitle` + zero writes; typing creates the file; task-list
  note → read-only protection (real classifier); settings screen; search
  arrival opens the palette pre-filled over the stream.

## Caveats

- **No native-shell run**: without a Rust toolchain, the Tauri app couldn't
  be booted here; there is also no browser-automation tooling in this
  environment. The route-content integration suite (real router + save
  pipeline over a fake bridge) is the compensating coverage. A human smoke
  run is recommended: ⌘N → type → the note takes the typed title; reopen →
  content persists; ⌘N then navigate away without typing → no file created.
- Real contenteditable selection behavior is exercised at the ProseMirror
  state level, not in a browser (repo strategy: editor-DOM tests await
  browser-mode vitest, per `vitest.config.ts`).
- Out of scope by design (see `plan.md`): broad UI parity (separate active
  run), backlink rewrite changes, note deletion/archiving, multi-pane.
