# File recovery, resumable downloads and empty dictionaries Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans, with superpowers:dispatching-parallel-agents for the independent WAL and empty-dictionary work. Track steps with checkboxes.

**Goal:** Preserve file search/selection across remount, fix WAL overwrite/commit gaps, provide durable resumable downloads and truthful empty-option states.
**Architecture:** One background recovery authority; versioned query/download snapshots; disk-backed local bridge plus persistent attachment cache and deterministic ZIP replay. Dictionary source state travels to controls and overrides stale fallback data.
**Tech Stack:** TypeScript/Vue, IndexedDB/sql.js, Python stdlib HTTP/filesystem, zip.js, Vitest and Playwright.
**Spec:** ../specs/2026-10-28-file-query-wal-resume-design.md and ../specs/2026-10-28-empty-query-options-design.md (user approved).

## Global Constraints
- Keep shared six-token pipeline and bounded memory; do not store credentials.
- Validate same origin/operator before restoring or resuming; stale query evidence does not authorize sending mail.
- Range resumes only sealed ZIPs with final length; first response stays streaming200.
- Preserve existing unrelated uncommitted six-token work; no automatic commit/push.

## Review Focus
- Two pages writing the same durable sequence, aborted IDB transactions and stale same-scope writes.
- Repeated chunks after ACK loss, crash between bytes and manifest, partially generated ZIP replay.
- Chrome canResume and nonzero Range on the same downloadId.
- Explicit empty data must suppress every fallback, while failure permits retry.
- Account change, disk exhaustion, missing cache and protocol mismatch must not produce false success.

### 1. Recovery authority and file query work surface
Files: src/recovery/*, background/recovery.ts, background/index.ts (narrow integration), app/pages/FilesPage.vue, floating/FileSearchPanel.vue, app/components/FileSearchQuery.vue, associated tests.
- [ ] Reproduce sequence collision and transaction abort, add durable-commit and revision tests.
- [ ] Make background the single production writer with ordered reads/writes and transaction-complete acknowledgements; migrate existing wrappers.
- [ ] Persist/restore query, page results, selection, form/name settings and task references by full identity scope; show paused/revalidation state and prevent stale progress.
- [ ] Run targeted tests; report integration hooks for download task state.

### 2. Empty dictionary state
Files: api/dictionaries/*, query/option-fallback.ts, TreeOptionSelect.vue and three query surfaces, associated tests.
- [ ] Add explicit empty/error/loading and stale-ID tests, observe failures.
- [ ] Propagate per-source state; tombstone explicit empty fallbacks; static nonexpandable empty presentation, retry for failures, no injected invalid ID options.
- [ ] Block stale conditions until cleared/revalidated; retain filing contract text exception; run targeted tests.

### 3. Durable local bridge and real Chrome protocol spike
Files: scripts/stream-download-bridge.py, background/stream-download.ts, utils/stream-download.ts, shared/message.ts, Python/unit/browser tests.
- [ ] Prove disk spool, idempotent writes and final-length Range with restart tests.
- [ ] Prove real Chrome interrupted initial chunked200 exposes canResume and resumes same ID using nonzero Range after sealing.
- [ ] Persist confirmed bytes and atomic metadata before ACK; stable task URL, controlled authorization and seven-day paused retention; distinguish pause from discard.

### 4. Persistent producers and end-to-end recovery
Files: api/stream-download.ts, api/stream-file.ts, content/index.ts, download cache/task modules and UI, tests.
- [ ] Freeze naming/ZIP metadata and cache attachment chunks; persist batch/file checkpoints before reporting them protected.
- [ ] Restore six-token production, skip cached complete files, validate source Range or restart only incomplete file; deterministic ZIP replay with byte-prefix validation.
- [ ] Reattach task after UI/source/background/bridge restart; expose resume/discard and durable-state errors.
- [ ] Full tests, build, real extension download/Range/CRC/repeated-name regressions and independent review.

## Execution ledger
User approved both concrete designs; proceed without another approval round. WAL/UI domains are independent and delegated using the parallel-agent skill; root owns the bridge/producer protocol. Integrations in shared files are coordinated, not overwritten.
