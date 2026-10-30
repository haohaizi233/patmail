import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { launchExtensionContext, extensionWorker, waitForContentScript, waitForPageCondition } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, resultPath } from './support/paths.mjs'

const context = await launchExtensionContext(distDir)
try {
  await installEasyMock(context, { fixtureHtml: '<!doctype html><title>重复过滤验收</title><table id="table_element"><tr><td class="tdtitle">我方文号</td><td><input id="case_volume"></td></tr><tr><td class="tdtitle">案件类型</td><td><select id="case_type"><option value="">不限</option></select></td></tr></table>', profile: 'extension' })
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === 'http://183.36.43.66:88'
    ? route.fallback() : route.fulfill({ status: 404, body: '' }))
  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' }])
  await context.route('http://183.36.43.66:88/**', route => {
    if (new URLSearchParams(route.request().postData() ?? '').get('Call') !== 'GetSearchFiles') return route.fallback()
    const rows = [
      ['1', '申请文件 (2).doc', 'CASE-A', '2025-01-01'],
      ['2', '申请文件 (2).docx', 'CASE-A', '2026-10-30'],
      ['3', '申请文件.docx', 'CASE-B', '2026-10-29']
    ].map(([id, name, volume, uploaded]) => ({ file_id: `00000000-0000-4000-8000-${id.padStart(12, '0')}`, file_no: `A${id}`, file_name: name, case_volume: volume, upload_time: uploaded }))
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: true }, TableRowsCount: '3', TableRows: rows }) })
  })
  const worker = await extensionWorker(context), easy = await context.newPage()
  await easy.goto(easyFixtureUrl); await waitForContentScript(worker, easy)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  await app.getByRole('button', { name: '查询文件', exact: true }).waitFor()
  const caseInput = app.getByLabel('我方文号', { exact: true }).first()
  await caseInput.fill('AUDIT-CASE')
  await caseInput.press('Tab')
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  const filter = app.getByRole('checkbox', { name: '同名文件仅保留最新', exact: true })
  await filter.waitFor(); assert(await filter.isChecked())
  await app.getByRole('button', { name: '全选本页', exact: true }).click()
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 2 个文件'))
  assert.equal(await app.getByRole('checkbox', { name: '申请文件 (2).doc', exact: true }).isChecked(), false)
  assert.equal(await app.getByRole('checkbox', { name: '申请文件 (2).docx', exact: true }).isChecked(), true)
  assert.equal(await app.getByRole('checkbox', { name: '申请文件.docx', exact: true }).isChecked(), true)
  await filter.uncheck()
  await app.getByRole('button', { name: '全选本页', exact: true }).click()
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 3 个文件'))
  await filter.check()
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 2 个文件'))
  await app.getByRole('region', { name: '查询结果', exact: true }).screenshot({ path: resultPath('dedupe-selection.png') })
  await writeFile(resultPath('dedupe-selection.json'), JSON.stringify({ passed: true, latestSelected: true, differentCasePreserved: true, toggleOffRestoresAll: true }))
  console.log('Duplicate filtering UI passed: newest selected; different case preserved; opt-out selects all')
} finally { await context.close() }
