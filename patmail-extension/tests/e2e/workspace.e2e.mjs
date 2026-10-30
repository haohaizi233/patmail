import assert from 'node:assert/strict'
import { launchHarness } from './support/harness.mjs'
import { runWorkspaceFlow } from './scenarios/workspace.mjs'

/**
 * 全页工作台场景（从 extension.e2e.mjs 拆出的独立进程，脚手架与 EASY 拦截同 extension）。
 *
 * Exercises the current full-page shell, customer, file-query, task, acceptance, and account-switch flows.
 * Business assertions cover persisted search provenance, expiry/revocation, task protections, zero external
 * writes, account isolation, and service-worker recovery. See docs/ci/e2e-matrix.md for the scenario scope.
 */
const harness = await launchHarness({ profile: 'extension' })
const { ctx, report, errors, notFound, dispose } = harness
try {
  await runWorkspaceFlow(ctx)

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}\n404 摘要: ${notFound.join(' | ')}`)
  await report.writeText('patmail-e2e-workspace.txt', `${report.checks} checks passed; browser errors: 0\n${report.notes.join('\n')}\n`)
  report.notes.forEach(line => console.log(line))
  console.log(`${report.checks} workspace checks passed`)
} finally {
  await dispose()
}
