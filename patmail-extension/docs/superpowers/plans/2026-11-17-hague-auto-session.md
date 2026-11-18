# Hague automatic session detection

Goal: Automatically discover and verify the selected eHague tab; eliminate the manual-first latch without overlapping JSF work or leaving controls permanently checking.

- Add opt-in autoVerify to the shared composable; enable only Hague. Auto-select only a single tab; multiple tabs require selection. Preserve selection and reject stale results.
- Defer automatic verification until workspace restoration and predecessor work settle; pause during batch work and hidden views. Continue only already-requested waiting material reads on successful verification, never auto-create drafts.
- Bound verification/discovery RPCs; clear busy states after timeout and allow retries. Keep manual recheck as a read-only action.
- Serialize background idle probes with business activity and prevent independent probes overlapping. Busy responses are transient and never create authenticated proof.
- Test startup, multi-tab selection, busy pause/resume, late responses, timeout, pending material continuation and existing recovery behavior; run Hague regression, typecheck, lint and build.

Validation: 76 Hague test files, 520 tests passed; scoped ESLint and pnpm build passed, including Vue typecheck. Independent reviewer found no important regression. Production CDP inspection timed out on the final attempt, so no live tab was reloaded and no running batch was interrupted.
