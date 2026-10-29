# Dynamic download tokens Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Share six business request tokens dynamically between naming and bounded parallel file transfer.
**Architecture:** A cancellable priority token pool controls naming, preparation and body lifetime. Six prefetched file streams feed one ordered ZIP writer with byte-based backpressure.
**Tech Stack:** TypeScript, Web Streams, Vue, zip.js, Vitest, Playwright.
**Spec:** ../specs/2026-10-28-dynamic-download-tokens-design.md (approved by user).

## Global Constraints

- Six simultaneous business operations at most; body tokens remain held until EOF/cancel.
- Preserve input order, filename recipe, ZIP64/STORE, failure interruption, and parsing-only progress.
- Six-file prefetch window; bounded byte buffers; no full file/archive aggregation.
- Existing unrelated snapshot edits remain untouched.

## Review Focus

- Cancellation while waiting for a token must reject and not leak a slot.
- A later file failing while the first is blocked must abort the whole pipeline promptly.
- Slow first file or output must bound buffers and preserve ZIP order.
- EOF releases its token even if ZIP has not consumed the buffered bytes.
- Parsing workers keep their existing default outside this streaming workflow.

### Task 1: Shared token pool

Files: src/api/download-tokens.ts; tests/unit/api/download-tokens.test.ts.
Interface: acquire(kind: 'naming' | 'download', signal: AbortSignal): Promise<() => void>; dynamic preferred-kind callback.
- [x] Test six slots, seventh waits, idempotent release, FIFO within class, changing priority and cancelled waiters; observe failure.
- [x] Implement the pool and run its tests.

### Task 2: Bounded parallel streams

Files: src/api/stream-download.ts; src/api/stream-file.ts; src/mail/download-name.ts; tests/unit/api/stream-download.test.ts.
Interface: naming options add optional concurrency (default remains five). Prefetch file returns a validated ReadableStream and completion promise; shared signal cancels every read/write.
- [x] Add controlled-body tests reaching exactly six live requests, reading multiple bodies after naming ends, bounded slow-output buffering, out-of-order CRC/order and cancellation/failure; observe failure.
- [x] Use a six-job ordered window and six shared tokens; prioritize naming below six ready names, otherwise downloads.
- [x] Run pool, stream, naming and lifecycle tests; typecheck and build.

### Task 3: Verification and documentation

Files: docs/streaming-download-2026-10-28.md; tests/e2e/stream-download.e2e.mjs.
- [x] Record fixture transfer timing, six-request peak and buffered byte bounds; validate original ZIP order/CRC and cancellation.
- [x] Run browser streaming/repeated-recipe regressions and full suite with limited workers.
- [x] Review final diff, report evidence and practical limits.

## Execution ledger

Ruling: User approved direct implementation of the concrete design; execute inline without another approval round. Work in the existing checkout so its loaded extension receives the build; avoid moving unrelated snapshot edits or committing them. No automatic commits/pushes.


Verification: 140 test files / 890 tests passed; the two additional slow-first large-body cases passed in the 15-case stream suite. Production build and repeated-recipe browser regression passed. Browser native stream validation: 81 entries / 21,250,590 bytes / CRC passed; deterministic six-body barrier reached six simultaneous business requests and six bodies, completed; cancellation and top navigation interrupted correctly. Fixture comparison: baseline 5459ms / peak1 versus optimized 3946ms / peak6, identical 6,293,574-byte ZIP.

Review: fresh reviewer found no confirmed Important/Critical issues. Its large-body/slow-first coverage gap was filled with success/CRC and cancellation cleanup cases. Ruling: server metrics end a Content-Length body when its final bytes are sent; a delay after the final chunk must not be counted as a live transfer. Use a six-body barrier to prove concurrent connections independently of short-response sampling.
