# Browser-only downloads Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development / dispatching-parallel-agents for independent storage and broker units; root integrates the picker, producer and delivery. No automatic commits.

**Goal:** A copied dist works with Chrome and EASY only, retaining six-way streaming and protected resume.
**Architecture:** IndexedDB chunk store with strict commits; existing typed source producer; account-validated background broker; visible extension-page File System Access writer.
**Tech Stack:** TypeScript, Vue, IndexedDB, File System Access, zip.js, Vitest, real Chromium fixtures.
**Spec:** ../specs/2026-10-29-browser-download-design.md (user selected direct save).

## Constraints
- Browser disk cache, bounded blocks; no HTTP loopback/Python requirement for new tasks.
- Picker during user activation before WAL/network awaits; cancel starts no task.
- ZIP prefix and source validators must be verified; no partial ZIP reported complete.
- Same account and selected host only; legacy cache never silently treated as migrated.
- Existing unrelated edits preserved; no service/process restart.

## Review focus
- Hard page/browser close during target-file staged write; confirmed cache must remain replayable.
- Multiple six-way source writes, stale task leases, account switch and extension-page sender identity.
- IndexedDB transaction abort after request success; quota errors and corrupt cache records.
- File-picker cancel/permission denial/target close failure and sealed-cache save.
- Replay of a prefix spanning different ZIP chunk boundaries; cleanup only after successful file close.

### 1. Durable browser cache
- [x] Define and implement src/browser-download/store.ts against types.ts, with focused red/green tests.
- [x] Verify strict commit, partial overlaps, read checksums, names, completion/discard and TTL isolation.

### 2. Background broker
- [x] Implement src/background/browser-download.ts against the store and host RPC contract.
- [x] Validate owner/tab leases, sequence, file-host write/finish ACK and pause/discard; add focused tests.
- [x] Root adds validated BrowserStreamDownload and backend flags to shared messages and routes.

### 3. Visible target and producer integration
- [x] Picker/target host in src/browser-download/target.ts; FileSearchQuery selects before awaits and freezes backend.
- [x] Reuse nativeStreamArchive through browser command/status mode; source producer and cache remain unchanged.
- [x] Start/discard/pause and unload lifecycle integrated; explicitly handle legacy tasks.

### 4. Delivery and verification
- [x] Remove Python copying/autostart from new delivery; update user docs/version.
- [x] Full unit suite, build, real browser IndexedDB/target writes, interruption+reload+CRC and six slots.
- [x] Independent review and final shipping artifact checks.

## Execution ledger

Implemented under the user's direct-save selection without another approval round. Browser cache uses strict IndexedDB transactions with bounded binary chunks; there is no new runtime dependency. Legacy HTTP code remains only for explicit compatibility messages, with no automatic connection/bridge startup for new work.

Verification: 152 Vitest files / 953 cases passed; real Chromium store checks passed (strict abort/no-ACK, checksums, concurrent revision/epoch and target identity). Pure browser download fixture reached six real body connections, interrupted source1 at256KiB, closed/relaunched browser, then requested only source1 Range262144; names ran once, final6-entry3146894-byte ZIP matched all content/CRC, nativeDownloads0 and loopbackRequests0. Repeated-name editor and cold-recovery fixture passed. Real1597-selection reload passed with six request peak and no auto query.

Review closed old-writer overwrite by closing same-page old targets, persisting activeTargetId for background restart, ACKing old close before new open and using exclusive writer where supported. Restarted pause/discard close persisted hosts and preserve data on real close failure; only explicit HOST_GONE is safe to ignore. File host/broker20 targeted tests and real OPFS stale-writer repro passed. Hot commands cache frozen task descriptors and status omits large manifests/naming pages.

Test-harness correction: async waitForFunction predicates are Promise-truthy in the installed Playwright. RPC polling now awaits page.evaluate in Node and requires the durable done checkpoint, preventing a prior success notice from satisfying a second download's wait. No production behavior was changed to make tests pass.

System save dialogs are represented by test-selected real OPFS handles in automation; user-gesture timing is asserted, write/close and disk bytes are Chrome's real APIs. Physical power loss is not simulated; transaction abort and full browser cold restart are covered.
