# Hague Research Mode Implementation Plan

> Implement incrementally with independent module ownership, test-first checks, and an independent final review. User supplied a complete spec and requested direct implementation without another design approval loop.

**Goal:** Read-only, opt-in CDP→AST→JSF→application/DOM/business evidence research, with explicit missing evidence and bounded resources.
**Base:** HEAD and fetched haohaizi233/main both `7dbca12412485ac6fdea2cdffa6fd2358f49c0e7`. Existing three dirty files preserved in ignored `test-results/hague-research-baseline`. Branch `codex/hague-research-mode`.
**Spec:** user attachment `2c902a78-ed52-4506-a88b-13f11088337a/已粘贴的文本.txt`.
**Architecture:** Extend the existing observer, deep controller, sanitizer, bridge and UI. A worker thread is an analysis isolation mechanism, not a second CDP daemon. No new business action, retry, authentication bypass, external transmission or Manifest permission. Existing execution/parser/checkpoint semantics stay intact.

## Audit capability matrix (before changes)

|Capability|State|Evidence / gap|
|---|---|---|
|CDP Network lifecycle|Implemented|observer core handleNetwork*; session/request namespace, redirects|
|Runtime errors/contexts|Implemented|observer core handleException/handleHagueContext; safe categories|
|Script reading|Implemented|HagueDeepDiagnostics; explicit deep enable, bounded source, ephemeral|
|AST parser|Implemented|existing Babel analyzer, fixtures and fail-closed execution extractor|
|PrimeFaces calls|Partial|analyzer recognizes cw; sanitizer currently lacks PrimeFaces.cw enum|
|Safe request metadata|Missing|ordinary Hague logger intentionally drops all postData; research needs bounded standard fields only|
|JSF response analysis|Partial|application Context DOMParser; no independent Node-safe namespace/security-complete parser|
|AST→Network index|Missing|source locations logged, no session-scoped call index lookup|
|DOM evidence|Partial|detached application model snapshots must not claim actual browser DOM changes|
|Business attribution|Partial|legacy report sees flags; no independent six-layer evidence reducer|
|Structured report/UI|Partial|existing timeline/export/replay, no research status/filters/explanation|

## Tasks

- [x] Fetch main, preserve work, record audit and baseline.
- [x] Schema v1 additive research/status/body/DOM/AST evidence contract; no incompatible parallel status system.
- [x] SAX XML parser with namespaces/CDATA and bounded size/depth/nodes; reject DTD/entities, never execute eval; session-scoped ViewState comparison only.
- [x] Evidence reducer and source index: independent edge confidence, no temporal exact, no XML/expected DOM/business inference.
- [x] Research controller + authenticated CLI: basic/deep/research lifecycle, safe body eligibility and commands, bounded reads/queue, hard worker timeout, teardown.
- [x] Wire existing observer events and deep AST production without duplicating daemon or execution logic.
- [x] Extend existing UI/status/filters/explanations/exports; provenance-aware app model vs browser receipt evidence.
- [x] Privacy/concurrency/lifecycle/XXE/limits/state tests, isolated browser E2E, actual resource measurements.
- [x] Full unit/integration/regression, typecheck/lint/build, independent review and final A–G report with real limits.

## Ownership and contracts

Root owns schema.mjs, trace.ts, observer-adapter, app trace metadata and UI integration, package/lock, main documentation and acceptance.

XML worker owns `diagnostics/protocol/jsf-partial-response.mjs` + declaration and parser tests. Uses existing transitive `saxes@6` as direct runtime dependency (ISC, Node>=12.22.7). Exports `parseJsfPartialResponse(body, options)` (structural metadata only) and `createJsfProtocolAnalyzer()` with `analyze(body,{contextKey,mime,httpStatus})` and `clear()`. Stateful comparison retains only short-lived scoped tags internally, never returns/persists raw ViewState or its tag. Also exports `parseJsfRequest(request)` returning standard flag/source/form/process/update metadata and eligibility, never raw field values. Bounds:256KiB UTF8,30000 nodes,100 depth; DTD/entities forbidden.

Correlation worker owns `diagnostics/correlation/correlator.mjs`, `diagnostics/evidence/evidence-model.mjs`, declarations and related tests. Script index namespace session/target/scriptId+hash, source location lookup with exact/probable/ambiguous/unmatched independently from application matching. Evidence reducer accepts safe events and returns six-layer states, missing evidence and deterministic human explanation. XML updates imply expected_only; application model is not real browser observation; completed requires explicit authoritative application evidence. No executor imports.

Research worker owns `scripts/hague-research*.mjs`, changes to existing observer/deep/CLI, worker analysis broker, scripts tests and research-related declarations. Composes existing deep controller; read-only response bodies only on authorized research session/request/known path/AJAX/text MIME/non-upload/non-download/loadingFinished, max age and generation guards. Body concurrency2, pending64(metadata),256KiB/resource, total buffer1MiB; source32/128KiB each/2MiB cumulative. Workers reuse AST/parser and have hard timeouts; cancellation clears pending/private indexes and never retries business. All CDP body commands validated against active admission, not just method name. `research-enable/status/disable` use existing loopback auth. No actual research enabling on daily Chrome in this task.

Shared additive event fields will include mode/state/bodyStatus/domStatus/domEvidenceSource/eventId/research counters, structural XML counts, sanitized expectedUpdates and edge confidence metadata. Producers sanitize before log/bridge; payload values/headers/raw body/source never survive. Coordination messages will pin the final API shapes before integration.

Final verification: 1776/1776 tests, zero failed/skipped; typecheck, lint baseline gate, build and isolated Chrome/Edge research + UI + draft/import E2E passed. Production research remains off; real-site full coverage not verified. See docs/hague-full-chain-diagnostics.md.
