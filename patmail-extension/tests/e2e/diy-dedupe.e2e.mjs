import assert from 'node:assert/strict'
import { writeFile, readFile, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { launchExtensionContext, extensionWorker, waitForContentScript, waitForPageCondition } from './support/browser.mjs'
import { installEasyMock, easyFixtureUrl } from './support/easy-mock.mjs'
import { distDir, resultPath, testResultsDir } from './support/paths.mjs'

const context = await launchExtensionContext(distDir)
let queries = 0, naming = 0
const prepares = []
const templateId = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
try {
  await installEasyMock(context, { fixtureHtml: '<!doctype html><title>重复过滤验收</title><table id="table_element"><tr><td class="tdtitle">我方文号</td><td><input id="case_volume"></td></tr><tr><td class="tdtitle">案件类型</td><td><select id="case_type"><option value="">不限</option></select></td></tr></table>', profile: 'extension' })
  await context.route(/^https?:\/\//, route => new URL(route.request().url()).origin === 'http://183.36.43.66:88'
    ? route.fallback() : route.fulfill({ status: 404, body: '' }))
  await context.addCookies([{ name: 'pm_fixture_session', value: 'active', url: easyFixtureUrl, httpOnly: true, sameSite: 'Lax' }])
  await context.route('http://183.36.43.66:88/**', route => {
    const params = new URLSearchParams(route.request().postData() ?? ''), call = params.get('Call')
    const json = data => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: true }, ...data }) })
    if (call === 'DownLoad') {
      const no = params.get('file_no'); prepares.push(no)
      return json({ file_guid: `00000000-0000-4000-8000-${no.slice(1).padStart(12, '0')}`, file_size: Buffer.byteLength('fixture body') })
    }
    if (new URL(route.request().url()).pathname.endsWith('FileHandler.ashx')) return route.fulfill({ contentType: 'application/octet-stream', body: 'fixture body' })
    if (call === 'GetFileTempNameList') return json({ TempNameList: [{ id: templateId, temp_name: 'DIY去重验收', new_filename: 'file_name;合并', file_name_type: 'colname;txt' }] })
    if (call === 'GetFlowdirection') return json({ DownLoadFileName: [{ value: 'file_name', text_zh_cn: '附件名称' }, { value: 'fixtxt', text_zh_cn: '固定字符' }] })
    if (call === 'GetApplyTags') return json({ ApplyTags: null })
    if (call === 'GetFileName') {
      naming++
      return json({ file_names: params.get('file_ids').split(';').map(id => params.get('new_filename').includes('区分') ? `不同-${id.slice(-1)}.docx` : '统一.docx').join(';') })
    }
    if (call !== 'GetSearchFiles') return route.fallback()
    queries++
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
  const row = app.locator('.download-name-row')
  await row.locator('.download-template-select [role="combobox"]').click()
  await app.getByRole('option', { name: 'DIY去重验收', exact: true }).click()
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 2 个文件'))
  await row.locator('.download-part-text').first().fill('区分')
  await row.locator('.download-part-text').first().press('Tab')
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 3 个文件'))
  for (let i = 0; i < 100 && naming < 2; i++) await app.waitForTimeout(50)
  assert(naming >= 2, '应实际获取区分配方名称，不能只看到未知名称时的临时全选')
  await waitForPageCondition(app, () => !document.body.innerText.includes('正在按最终名称更新选择'))
  await row.locator('.download-part-text').first().fill('合并')
  await row.locator('.download-part-text').first().press('Tab')
  await waitForPageCondition(app, () => document.body.innerText.includes('已选 2 个文件'))
  assert.equal(await app.getByRole('checkbox', { name: '申请文件 (2).doc', exact: true }).isChecked(), false)
  assert.equal(queries, 1, '改DIY名称不能重新查询')
  assert(naming >= 1)
  const beforeDownloadNaming = naming
  const downloadPath = await mkdtemp(join(testResultsDir, 'diy-output-'))
  const cdp = await context.newCDPSession(app)
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath, eventsEnabled: true })
  await app.getByRole('button', { name: '下载已选', exact: true }).click()
  await waitForPageCondition(app, async () => (await chrome.downloads.search({ state: 'complete' })).length > 0, null, { timeout: 60000 })
  const [saved] = await worker.evaluate(() => chrome.downloads.search({ state: 'complete' }))
  const reader = new ZipReader(new Uint8ArrayReader(await readFile(saved.filename)), { useWebWorkers: false })
  const entries = await reader.getEntries()
  assert.deepEqual(entries.map(entry => entry.filename), ['统一.docx', '统一 (2).docx'])
  for (const entry of entries) assert.equal(Buffer.from(await entry.getData(new Uint8ArrayWriter(), { checkSignature: true, useWebWorkers: false })).toString(), 'fixture body')
  await reader.close()
  assert.deepEqual(prepares.sort(), ['A2', 'A3'])
  assert.equal(naming, beforeDownloadNaming, '下载复用已预览名称，不重复取名')
  await app.getByRole('region', { name: '查询结果', exact: true }).screenshot({ path: resultPath('diy-dedupe.png') })
  await writeFile(resultPath('diy-dedupe.json'), JSON.stringify({ passed: true, queries, naming, prepares, zipCRC: true, cachedNamesReused: true, candidatePoolRestored: true, diyNamesDriveSelection: true }))
  console.log('DIY final-name filtering passed: candidate pool restored, one search, recipe changes update selection')
} finally { await context.close() }
