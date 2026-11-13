# Hague Protocol Diagnostics Implementation Plan

> **For agentic workers:** Use test-first implementation and independent module ownership. No live WIPO writes or deep script reads without separate explicit user consent.

**Goal:** Explain each Hague operation through safe application trace, layered HTTP/JSF/business status, bounded AST analysis, optional native CDP evidence, diagnostics UI, and offline reports.
**Architecture:** Keep the current HTTP/JSF engine and safety gates. Trace IDs travel as application metadata only, never authentication headers. Sanitize before collection, never after persistence. AST is shared browser/Node MJS, diagnostic faults cannot retry business requests.
**Baseline:** fetched haohaizi233/main = ceabd813a67d6f91a74410e1561ba313e4bba0c3, HEAD equal; existing working changes and untracked files backed up under ignored test-results/hague-upgrade-baseline. Branch codex/hague-protocol-diagnostics; existing changes preserved.

## Tasks
- [x] Read user specification, fetch correct remote, preserve dirty workspace, establish baseline.
- [x] Audit all 21 operations, status propagation, CDP capabilities, blind spots (audit document).
- [x] Versioned safe trace schema, bounded collector, structured errors; red/green privacy and status tests.
- [x] Carry action trace through Runner / HTTP context / RPC / injected fetch; structural JSF and DOM evidence without input values.
- [x] Extend existing observer only: redirect/failure metadata, explicit opt-in non-pausing Debugger source analysis, confidence-based correlation, safe lifecycle.
- [x] Bounded real AST parser, constant propagation, wrapper graph, static decoding, safe jsfAction integration and compatibility tests.
- [x] Collapsible diagnostics timeline/tree/detail/AST panel, fingerprints, offline replay and JSONL/JSON/Markdown exports.
- [x] Adversarial privacy, no-CDP, diagnostic failure, unsupported protocol and six-lane isolation tests; measure real overhead.
- [x] Build, typecheck, lint baseline, relevant suites, isolated browser verification, review and acceptance report. Mark unavailable live diagnostics unverified.

## Integration contracts
Main owns diagnostics/trace.ts, schema.mjs + schema.d.mts, store.ts, errors.ts, protocol.ts; HTTP context/client, runner, RPC. AST worker owns diagnostics/ast/, jsfAction in http-driver.ts only, AST docs/tests. Observer worker owns observer scripts and docs/tests. UI worker owns HagueDiagnostics.vue and diagnostics reports/fingerprints/replay and their tests/docs; root wires HaguePage.

TraceContext: {traceId,caseRunId,stepIndex,operation,transportMode,tabId?,documentId?}. IDs are opaque UUIDs, never caseVolume/WIPO reference. TraceEvent version=1, source application|cdp|fixture, phases per specification; httpStatus nullable. Core exports sanitizeTraceEvent, emitTrace(ctx,phase,fields), makeTraceContext, setDiagnosticMode, isDiagnosticModeEnabled, getDiagnosticEvents, subscribeDiagnostics, clearDiagnosticEvents. Diagnostic mode defaults off; deep CDP is independently opt-in. Reports import only safe records. CDP-only unmatched events can lack application IDs; never invent case ownership.

Root schema.mjs exports sanitizeTraceEvent(raw), safePath, safeComponentId, stableHash. Safe components preserve known form namespaces/static identifiers and redact unknown identifiers; unknown strings and all values/body/headers are dropped. Root errors.ts exports HagueDiagnosticError + normalizeDiagnosticError and safeDiagnosticError. Public fault data: errorCode,errorStage,httpStatus,transportStatus,protocolStatus,businessStatus,certainty,sideEffectMayHaveOccurred,autoRecoverable,traceId?,timestamp. No raw error messages/body/stack.

AST shared Node/browser entry: diagnostics/ast/analyzer.mjs (with d.mts), analyzeJavaScript(source,options) synchronous, bounded; result calls, unresolved, fingerprint, stats. Calls include kind/source/form/process/update/event/parameterNames/componentId/location/functionName/confidence/unresolvedReasons; no parameter values in diagnostic reports. Execution extraction may internally keep validated static values, never log them. JsfAction may add analysis metadata (scriptHash,callType,line,column,confidence) without breaking existing fields.

UI imports store APIs above; props none. Reports/fingerprint/replay pure, no network or business execution. Observer may receive sanitized app Trace via fixed audited hook, must resanitize; if UI CDP bridge unavailable label missing rather than invent. Deep mode must not become enabled just by viewing the panel. No new service daemon. Source is memory-only by default.


## Final evidence

Full suite:257files/1702tests passed. Typecheck/production build and targeted lint passed; repository ESLint ratchet passed with existing debt. Isolated Chrome diagnostics, draft UI and import/preview fixtures passed with external HTTP denied. Native observer restarted; earlier5 targets connected, finalrestartwaiting0targets, deep scripts off, logWriteFailures0. Realtime UI bridge requires receiver v1; old app pages are not falsely marked ready. No real WIPO writes or deep source reads performed. Full results and remaining limits:docs/hague-diagnostics-acceptance.md.
