# Hague chain recovery implementation plan

> Execute inline using systematic debugging, TDD and verification-before-completion. User approved direct implementation on 2026-11-13.

**Goal:** Recover the eight designation failures and five skipped cases, retaining independent six-chain operation and notifying the user about estimated draft data.

**Architecture:** Inspect existing WIPO drafts through native CDP. Fix detached JSF protocol handling rather than bypassing designation equality checks. Reuse references and verify checkpoints before any resumed write. Keep inferred postal codes explicitly distinguishable from source values and carry review warnings through completion.

**Tech Stack:** TypeScript, Vue, Vitest, native CDP WebSocket.

## Tasks

- [x] Inspect actual designation callbacks, JSF updates and selected checkbox metadata; create failing protocol regression; implement and verify a minimal fix.
- [x] Inspect original nationality/domicile/establishment/residence/ACP controls for foreign legal applicants; replace the blanket CN restriction with supported CN/SG source mapping and explicit review notes.
- [x] Verify postal requirements: original postal field is optional. Permit an absent value, validate nonempty values and notify the user. The requested conditional estimate is unnecessary for this optional field.
- [x] Inspect the original legacy Word: six product rows incorrectly all numbered 1, while six image groups match each row count and identical products/subclasses. User explicitly approved correction to 1–6 with disclosure.
- [x] Add a completion dialog listing outcomes and review notes. Preserve correction disclosures separately from arbitration decisions and in saved checkpoints.
- [x] Run relevant tests, typecheck, lint gate and both builds; recover original references and verify saved receipts and PDF downloads.

## Evidence

08:35:13 local: 13 settled, 0 successful, 8 failed, 5 skipped. All eight failures report designation equality mismatch at next=4. Skips: one postal code, one image count mismatch, three CN-only eligibility guards. Existing saved case is excluded from retries.

## Constraints

Never change the user's download directory or browser download behavior. Never log credentials, raw request/response bodies or complete business lists. Estimates must be labeled for human review. Genuine missing materials cannot be invented.

## Verified outcome

2026-11-13 local: all 13 affected cases saved under 13 distinct references; 13 PDF downloads complete and present. Both original priority entries retained, with original number/date verified in the site. Completion dialog observed open with 13/13 success and review notes. 134 Hague unit tests, typecheck, ESLint baseline gate and root/extension builds pass. Independent review passed.

Additional live fixes: sanitize embedded/inline CSS for offline printing; permit only the exact Summary Back POST; normalize zero-padded Locarno class at execution; paginate Draft(s) for resume and saved-receipt inspection, updating PrimeFaces row fragments into tbody. An early hypothesis that the calendar's displayed range caused priority rejection was disproved by successful original-date saves; no dates were replaced or priorities omitted.
