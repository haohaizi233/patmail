# Hague automatic recovery

User requested direct continuation of the previously identified recovery gaps. Execute inline with TDD and independent final review.

## Design

An HTTP-only recovery hook reopens an isolated chain pinned to the existing WIPO reference. It returns completed, retry or unknown, with a receipt. Runner verifies identity and permits at most one durable recovery attempt per step across restarts. Creation, upload, record creation other than verified absent priority, printing without delivery proof and ambiguous results remain paused.

Priority recovery requires an intact canonical section: the exact indexed record count and one record containing matching source number, date and country prove completion; the exact preceding count proves absence and permits one retry. Conflicting or unrecognizable records pause. Final-save recovery requires a persisted successful save response already returned to portfolio plus an exact paginated Draft(s) receipt, so an initial empty saved draft cannot be mistaken for final completion.

## Tasks

- [x] Add typed recovery results, durable attempt counts and acknowledged receipt metadata; test pure priority classification.
- [x] Add fresh-chain readback for supported operations; preserve strict reference matching and original source fields.
- [x] Integrate bounded recovery into runner entry and step failures, batch eligibility and UI. Test lost acknowledgements, absent versus already-created records, cancellation, wrong references, budget exhaustion and unsupported steps.
- [x] Run Hague tests, typecheck, lint gate and builds; independent review. Do not replay the already completed thirteen cases.

## Verification and limits

149 Hague tests, typecheck, ESLint baseline gate and both builds passed. Independent review found and verified fixes for atomic advancement on recovery completion and complete country-label matching. Crash tests cover completed and authorized-retry persistence windows. Duplicate WIPO targets and legacy uncertain checkpoints without material fingerprints are blocked.

Native-CDP live readback did not obtain a Draft(s) entry from the current original-site response; the new recoverer returned unknown and performed no business write. Therefore successful new automatic recovery is proven by fault-injection tests, not a fresh replay of all thirteen production cases. The earlier thirteen completed drafts and PDFs remain intact.
