import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { launchExtensionContext, extensionWorker } from '../tests/e2e/support/browser.mjs'
import { distDir, reportsDir, resultPath } from '../tests/e2e/support/paths.mjs'

// 只读账号模板；选择和编辑只发生在隔离浏览器内，不保存模板、不查询或下载业务文件。
assert.equal(process.env.PATMAIL_LIVE_READONLY, '1')
assert(process.env.PATMAIL_AUDIT_USER && process.env.PATMAIL_AUDIT_PASSWORD)
const origin = 'http://183.36.43.66:88'
const context = await launchExtensionContext(distDir, { viewport: { width: 1600, height: 1000 } })
try {
  const site = await context.newPage()
  await site.goto(origin, { waitUntil: 'domcontentloaded' })
  await site.locator('#chk_password').uncheck()
  await site.locator('#txtUser').fill(process.env.PATMAIL_AUDIT_USER)
  await site.locator('#txtPwd').fill(process.env.PATMAIL_AUDIT_PASSWORD)
  await site.locator('#btnLogin').click()
  const worker = await extensionWorker(context)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  await app.waitForFunction(
    async () => {
      const loaded = await chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      return Boolean(loaded.payload?.connection?.operatorId)
    },
    undefined,
    { polling: 500, timeout: 45000 },
  )
  const selected = await site.evaluate(async () => {
    const result = await fetch('/AjaxServers/BaseInfo.ashx', {
      method: 'POST',
      credentials: 'include',
      body: new URLSearchParams({ Call: 'GetFileTempNameList', log_pagename: 'FileSearch.aspx' }),
    }).then(response => response.json())
    const templates = result.TempNameList ?? []
    const row =
      templates.find(item => item.temp_name === '华峰官文') ??
      templates.find(item => item.new_filename === 'app_no;-;case_name;-;file_desc')
    return row ? { label: row.temp_name, filename: row.new_filename, types: row.file_name_type } : null
  })
  assert(selected, '账号应存在截图对应的五段模板')
  const row = app.locator('.download-name-row')
  await row.locator('.download-template-select [role="combobox"]').click()
  const option = app.getByRole('option', { name: selected.label, exact: true })
  await option.waitFor({ timeout: 45000 })
  await option.click()
  const parts = row.locator('.download-name-part')
  await app.waitForFunction(
    expected => document.querySelectorAll('.download-name-part').length === expected,
    selected.types.split(';').length,
  )
  const shown = await parts.locator('.theme-select-label').allTextContents()
  const fixed = await row.locator('.download-part-text').evaluateAll(inputs => inputs.map(input => input.value))
  assert.equal(shown.length, selected.types.split(';').length)
  assert.deepEqual(
    fixed,
    selected.filename.split(';').filter((_, index) => selected.types.split(';')[index] === 'txt'),
  )
  await row.locator('.download-part-text').first().fill('_')
  await app.getByRole('button', { name: '添加名称段', exact: true }).click()
  assert.equal(await parts.count(), shown.length + 1)
  await app.getByRole('button', { name: `删除第${shown.length + 1}段`, exact: true }).click()
  assert.equal(await parts.count(), shown.length)
  // 重选模板应恢复原配方。
  await row.locator('.download-template-select [role="combobox"]').click()
  await app.getByRole('option', { name: '不限', exact: true }).click()
  assert.equal(await parts.count(), 1)
  await row.locator('.download-template-select [role="combobox"]').click()
  await app.getByRole('option', { name: selected.label, exact: true }).click()
  await row.scrollIntoViewIfNeeded()
  await mkdir(reportsDir, { recursive: true })
  await row.screenshot({ path: resultPath('download-editor-live.png') })
  const report = {
    passed: true,
    version: await app.evaluate(() => chrome.runtime.getManifest().version),
    parts: shown.length,
    labels: shown,
    fixedText: fixed,
    addRemoveAndReset: true,
    queryOrDownload: false,
    templateWrite: false,
  }
  await writeFile(resultPath('download-editor-live.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await context.close()
}
