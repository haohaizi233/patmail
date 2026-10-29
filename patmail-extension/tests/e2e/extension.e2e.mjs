import assert from 'node:assert/strict'
import { launchHarness } from './support/harness.mjs'
import { runPanelScan } from './scenarios/panel-scan.mjs'
import { runFileSearch } from './scenarios/file-search.mjs'
import { runPanelWindow } from './scenarios/panel-window.mjs'
import { runLargeFormScan } from './scenarios/panel-large-form.mjs'

// 场景模块与脚手架见 support/harness.mjs。
// 全页工作台场景（scenarios/workspace.mjs）从这里拆出，由 workspace.e2e.mjs 独立进程执行（见 run-e2e.mjs 分组）。
const harness = await launchHarness({ profile: 'extension' })
const { ctx, report, errors, notFound, dispose } = harness
try {
  await runPanelScan(ctx)
  await runFileSearch(ctx)
  await runPanelWindow(ctx)
  await runLargeFormScan(ctx)

  assert.deepEqual(errors, [], `browser errors: ${errors.join('\n')}\n404 摘要: ${notFound.join(' | ')}`)
  await report.writeText('patmail-e2e.txt', `${report.checks} checks passed; browser errors: 0\n${report.notes.join('\n')}\n`)
  report.notes.forEach(line => console.log(line))
  console.log(`${report.checks} browser checks passed; screenshot: test-results/patmail-panel.png`)
} finally {
  await dispose()
}
