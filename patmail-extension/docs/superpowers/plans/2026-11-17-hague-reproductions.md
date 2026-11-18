# Hague reproduction export implementation plan

Goal: Export the official reproduction PDF before Summary, with a default-on kawaii theme toggle and consistent disabled states.
Architecture: Keep existing step indexes and checkpoint identity. Export as a prerequisite to the existing Summary step; pause on failure before dispatching Summary. Fetch the exact preview form submit discovered via native CDP, validate reference, origin, MIME and PDF signature, and await the native named download.
Tech stack: Vue, TypeScript, Chrome extension APIs, Vitest.
Spec: User-approved design in this chat; Reproductions naming distinct from Summary; default checked; reuse theme.

- [x] Add failing tests for official preview form parameters, PDF validation, origin/reference mismatch, named download and toolbar state transitions.
- [x] Implement reproduction export and HTTP/page integration without shifting checkpoint steps; failures must not recover past the prerequisite.
- [x] Add persistent default-on theme toggle and centralized disabled action states, including checking/stopping.
- [x] Run Hague tests, typecheck and build; record live CDP evidence and limitations.

Ruling: No separate worktree: this checkout contains active unrelated edits and the user expects the installed development extension to use this source; only scoped files will be edited. Do not commit unrelated changes.
Evidence: native CDP /devtools/browser; exact Preview reproductions submit in designForm returns HTTP 200 application/pdf, DESIGNS_188277.pdf, 284497 bytes, %PDF-1.4. No payment or submission actions performed.

Verification: Hague unit suite 76 files / 513 tests passed; scoped ESLint passed; pnpm build passed (including vue-tsc). Independent review found page form serialization could lose live control properties; replaced with live FormData entries and added regression coverage. Existing unrelated dirty files preserved.

Final state: live extension UI showed default-on solid reproduction button enabled and current WIPO tab discoverable. Added 15s bound and AbortSignal cancellation to page-form RPC so late replies cannot enter Summary after Stop. No new real application or filing/payment action was triggered.
