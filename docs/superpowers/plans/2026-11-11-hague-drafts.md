# eHague draft automation Implementation Plan

**Goal:** Complete the existing Hague workflow through real eHague draft creation, Summary and printable review.
**Architecture:** Build a validated immutable per-case plan locally. A background handler pins the selected official tab/document; a self-contained injected page driver executes observed PrimeFaces controls in steps and returns verified receipts. A serial frontend runner maintains checkpoints and stops on ambiguous writes.
**Tech Stack:** Vue, TypeScript, Chrome scripting API, Vitest and native CDP for live research.
**Spec:** User request and Desktop/海牙新申请递交说明.docx; implementation ends at saved drafts, with human review before filing/payment.

## Constraints
- Preserve current kawaii components and top progress placement.
- Every applicant must be included; English names/addresses and complete creators required before starting.
- Reuse first applicant address for every creator. Representatives and contact defaults come from supplied instructions, never credentials.
- Natural numeric image order, one image upload at a time with confirmed receipt; document-specific legend labels.
- No payment/filing calls. No automatic retry of uncertain writes or silent creation of a second draft.
- CDP uses native protocol; never alter browser download behavior.

## Tasks
- [x] Observe every real target form and its save/summary/print controls.
- [x] Add local draft plan builder, validation and multi-applicant regression tests.
- [x] Add constrained page driver and trusted background bridge; test origins, sender, actions, navigation and uncertain operations.
- [x] Integrate serial draft steps, progress, stop/resume checkpoints and receipts into HaguePage.
- [x] Verify local tests/build, isolated browser UI and one real authorized small-client draft through Summary.

## Evidence
Real draft WIPO187867 is present in Draft(s), with 1 design / 8 reproductions and PO2631874HAGUE signature reference. Actual site Summary PDF (3 pages, 563142 bytes) saved to original case folder and visually reviewed. No payment or filing. Priority 111 was replaced with a marked generated draft number; invalid DAS 111 omitted with a human-review warning. Isolated browser UI verifies complete command order and unique top progress without external network writes. Independent code review identified two reload recovery cases; both corrected and covered by tests.

## Review focus
Missing English creators; omitted second applicant; 1.10 image sorting; duplicate upload after timeout; session expiry and document changes; source-specific countries and custom view legends; generated priority placeholders visibly marked for human review.
