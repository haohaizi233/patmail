import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { EXTENSION_ROOT } from '../../shared/paths.mjs'
import { launchExtensionContext, extensionWorker } from '../../../tests/e2e/support/browser.mjs'
import { distDir, reportsDir, resultPath } from '../../../tests/e2e/support/paths.mjs'

// 仅显式运行。凭据只从当前进程环境读取，报告不保留凭据、Cookie、筛选值或文件正文。
assert.equal(process.env.PATMAIL_LIVE_READONLY, '1', 'Set PATMAIL_LIVE_READONLY=1 for an explicit live read-only audit')
assert(process.env.PATMAIL_AUDIT_USER && process.env.PATMAIL_AUDIT_PASSWORD && process.env.PATMAIL_AUDIT_HAR)
const origin = 'http://183.36.43.66:88'
const expectedVersion = JSON.parse(await readFile(join(EXTENSION_ROOT, 'package.json'), 'utf8')).version
const queryOnly = process.env.PATMAIL_AUDIT_QUERY_ONLY === '1'
const har = JSON.parse(await readFile(process.env.PATMAIL_AUDIT_HAR, 'utf8'))
const entry = har.log.entries.find(
  item => new URLSearchParams(item.request.postData?.text ?? '').get('Call') === 'GetSearchFiles',
)
assert(entry)
const original = new URLSearchParams(entry.request.postData.text)
const fields = Object.fromEntries(
  [...original].filter(
    ([key]) =>
      !['Call', 'pageIndex', 'pageSize', 'IsFirst', 'is_pat', 'colsel', '_t', 'log_pagename', '_doneCallback'].includes(
        key,
      ),
  ),
)
const context = await launchExtensionContext(distDir)
const report = {
  version: '',
  queryOnly,
  formBefore: {},
  formAfter: {},
  starts: [],
  ends: [],
  initialMs: 0,
  allMs: 0,
  total: 0,
  selected: [],
  notices: [],
  peak: 0,
  error: '',
}
let ticker
try {
  const site = await context.newPage()
  await site.goto(`${origin}/`, { waitUntil: 'domcontentloaded' })
  await site.locator('#chk_password').uncheck()
  await site.locator('#txtUser').fill(process.env.PATMAIL_AUDIT_USER)
  await site.locator('#txtPwd').fill(process.env.PATMAIL_AUDIT_PASSWORD)
  await site.locator('#btnLogin').click()
  const worker = await extensionWorker(context)
  const app = await context.newPage()
  await app.goto(`chrome-extension://${new URL(worker.url()).host}/app.html#/files`)
  await app.waitForFunction(
    async () => {
      const loaded = await globalThis.chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
      const connection = loaded.payload?.connection
      return Boolean(connection?.operatorId && connection.easyTabId != null)
    },
    undefined,
    { timeout: 45000, polling: 500 },
  )
  const saved = await app.evaluate(async fields => {
    const loaded = await globalThis.chrome.runtime.sendMessage({ type: 'WORKSPACE', payload: { action: 'load' } })
    const c = loaded.payload.connection
    const now = new Date().toISOString()
    const result = await globalThis.chrome.runtime.sendMessage({
      type: 'WORKSPACE',
      payload: {
        action: 'saveQueryTemplate',
        expectedVersion: null,
        expectedScope: {
          easyOrigin: c.easyOrigin,
          operatorId: c.operatorId,
          easyTabId: c.easyTabId,
          connectionVersion: c.connectionVersion,
        },
        template: {
          id: 'local-performance-audit',
          name: '本次性能验收',
          source: 'local',
          queryType: 'FileSearch',
          fields,
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
      },
    })
    return { version: globalThis.chrome.runtime.getManifest().version, saved: result.payload?.ok }
  }, fields)
  report.version = saved.version
  assert.equal(saved.saved, true)
  assert.equal(saved.version, expectedVersion)
  await app.reload({ waitUntil: 'domcontentloaded' })
  await app.getByRole('button', { name: /本次性能验收/ }).click()
  const formState = async () => {
    const state = {}
    for (const label of ['文件描述', '文件来源', '附件名称', '设置下载文件名称']) {
      const node = app.getByText(label, { exact: true })
      state[label] = (await node.count()) > 0 && (await node.first().isVisible())
    }
    return state
  }
  report.formBefore = await formState()
  const cdp = await context.newCDPSession(site)
  await cdp.send('Network.enable')
  const ids = new Set()
  cdp.on('Network.requestWillBeSent', event => {
    const params = new URLSearchParams(event.request.postData ?? '')
    if (params.get('Call') === 'GetSearchFiles' && params.get('case_volume') === original.get('case_volume')) {
      ids.add(event.requestId)
      report.starts.push({
        id: event.requestId,
        page: Number(params.get('pageIndex')),
        size: Number(params.get('pageSize')),
        at: event.timestamp,
      })
    }
  })
  cdp.on('Network.loadingFinished', event => {
    if (ids.has(event.requestId)) report.ends.push({ id: event.requestId, at: event.timestamp })
  })
  const initialStart = Date.now()
  await app.getByRole('button', { name: '查询文件', exact: true }).click()
  const totalLabel = app.getByText(/^共 \d+ 个文件$/, { exact: true })
  await totalLabel.waitFor({ timeout: 120000 })
  report.initialMs = Date.now() - initialStart
  report.total = Number(/\d+/.exec(await totalLabel.innerText())[0])
  if (queryOnly) {
    await app.getByRole('button', { name: '校对最新字段', exact: true }).click()
    await app.getByText(/^已打开原网站的文件查询页/).waitFor({ timeout: 45000 })
    report.explicitFormCheck = true
  }
  report.formAfter = await formState()
  if (queryOnly) {
    assert(Object.values(report.formAfter).every(Boolean), '查询后必须仍展示文件条件')
    console.log(
      JSON.stringify({
        completed: true,
        queryOnly,
        total: report.total,
        initialMs: report.initialMs,
        formBefore: report.formBefore,
        formAfter: report.formAfter,
      }),
    )
  } else {
    const allStart = Date.now()
    await app.getByRole('button', { name: '全选所有', exact: true }).click()
    ticker = setInterval(
      () =>
        console.log(
          JSON.stringify({
            phase: 'selecting',
            sent: report.starts.length,
            received: report.ends.length,
            elapsedMs: Date.now() - allStart,
          }),
        ),
      15000,
    )
    await app.getByText(`已全选 ${report.total} 个文件。`, { exact: true }).waitFor({ timeout: 240000 })
    report.allMs = Date.now() - allStart
    report.selected = await app.getByText(/^已选 \d+ 个文件/).allTextContents()
    report.notices = await app.getByText(/^已全选 /).allTextContents()
    assert(report.selected.some(text => text.startsWith(`已选 ${report.total} 个文件`)))
    assert.equal(report.starts.length, Math.ceil(report.total / 100))
    assert(report.starts.every(request => request.size === 100))
    console.log(
      JSON.stringify({
        completed: true,
        total: report.total,
        initialMs: report.initialMs,
        allMs: report.allMs,
        requests: report.starts.length,
        notices: report.notices,
      }),
    )
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  throw error
} finally {
  clearInterval(ticker)
  report.peak = report.starts.length
    ? Math.max(
        ...report.starts.map(
          start =>
            report.starts.filter(
              item => item.at <= start.at && !report.ends.some(end => end.id === item.id && end.at <= start.at),
            ).length,
        ),
      )
    : 0
  await mkdir(reportsDir, { recursive: true })
  await writeFile(
    resultPath(queryOnly ? 'file-form-live.json' : 'file-pagination-live-optimized.json'),
    JSON.stringify(report, null, 2),
  )
  await context.close()
}
