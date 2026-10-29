import assert from 'node:assert/strict'
import { launchHarness } from './support/harness.mjs'
import { runWorkspaceFlow } from './scenarios/workspace.mjs'

/**
 * 全页工作台场景（从 extension.e2e.mjs 拆出的独立进程，脚手架与 EASY 拦截同 extension）。
 *
 * 已知红（历史 UI 契约漂移，非本次 CI 建设引入）：scenarios/workspace.mjs 断言的是
 * 2026-09-26/09-28 时代的界面契约（导航 aria-label「工作台导航」与链接式导航、客户称呼/我方文号表单、
 * 保存这套配置/修改、查看已选/绑定已选文件/生成发文计划、Production Write 等）；产品界面在
 * 09-28（客户与模板改页面条件排版）、09-29（写开关）、10-27（全选翻页与下载工具条）演进后未同步，
 * 绑定与生成计划的入口已移到 EASY 面板（src/floating/FileSearchPanel.vue、AutomationPanel.vue）。
 * 场景模块保持原样不删不改，业务断言（任务来源、幂等保护、账号隔离、SW 重启恢复）继续执行并如实报红。
 * 根因证据与整改计划见 docs/ci/e2e-matrix.md、docs/ci/acceptance-report.md。
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
