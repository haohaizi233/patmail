/**
 * E2E 共享脚手架：夹具页 + EASY 路由拦截 + MV3 扩展持久化上下文 + worker/面板上下文。
 * 每个 *.e2e.mjs 各起一份（paths.mjs 用 mkdtemp 隔离 dist 副本，端口走 listen(0) 动态分配），
 * 进程间互不干扰；EASY 全部由测试路由拦截，绝不触达真实服务器。
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { distDir, fixturePagePath } from './paths.mjs'
import { startFixtureServer } from './fixture-server.mjs'
import { easyFixtureUrl, installEasyMock } from './easy-mock.mjs'
import { extensionWorker, launchExtensionContext, waitForContentScript } from './browser.mjs'
import { createReporter } from './report.mjs'

export async function launchHarness({ profile = 'extension' } = {}) {
  const dist = distDir
  const fixture = await readFile(fixturePagePath)
  const report = createReporter()
  const fixtureServer = await startFixtureServer(fixture)
  const url = fixtureServer.url
  const easyUrl = easyFixtureUrl

  let context
  try {
    context = await launchExtensionContext(dist)
  } catch (error) {
    await fixtureServer.close()
    throw error
  }

  const mock = await installEasyMock(context, { fixtureHtml: fixture, profile })
  const apiCalls = mock.apiCalls
  const errors = []
  const requestFailures = []
  // 网络错误摘要（失败证据）：404 资源逐条记 URL，便于定位缺路由/缺资源。
  const notFound = []
  const watch = (page) => {
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('console', (message) => {
      if (message.text().includes('502')) return
      if (message.type() === 'error' || message.text().includes('PatMail transport diagnostic:')) errors.push(message.text())
    })
    page.on('response', (response) => { if (response.status() === 404) notFound.push(response.url()) })
    page.on('requestfailed', request => { if (request.url().includes('/AjaxServers/')) requestFailures.push({ url: request.url(), failure: request.failure()?.errorText }) })
  }
  context.on('page', watch)
  for (const page of context.pages()) watch(page)

  const visible = async (panel, width, height) => {
    // resize 和 Vue 响应式位置更新跨帧发生；等待最终稳定位置。
    await panel.page().waitForFunction(() => {
      const element = document.querySelector('patmail-root')?.shadowRoot?.querySelector('.panel')
      if (!element) return false
      const box = element.getBoundingClientRect()
      return box.x >= 0 && box.y >= 0 && box.x + box.width <= innerWidth + 1 && box.y + box.height <= innerHeight + 1
    }, null, { timeout: 3000 })
    const box = await panel.boundingBox()
    assert(box, 'panel bounding box missing')
    const viewport = panel.page().viewportSize()
    assert(viewport, 'viewport missing')
    assert(box.x >= 0 && box.y >= 0, `negative panel coordinates: ${JSON.stringify(box)}`)
    assert(box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1,
      `panel beyond viewport: ${JSON.stringify(box)} / ${JSON.stringify(viewport)}`)
    if (width) assert.equal(Math.round(box.width), width)
    if (height) assert.equal(Math.round(box.height), height)
    return box
  }

  async function dispose() {
    context.off('page', watch)
    await mock.dispose()
    await context.close()
    await fixtureServer.close()
  }

  try {
    const worker = await extensionWorker(context)
    const extensionId = new URL(worker.url()).host
    assert.match(extensionId, /^[a-p]{32}$/)
    const tabFor = (targetPage) => waitForContentScript(worker, targetPage, { attempts: 50, intervalMs: 250 })
    async function showPanel(targetPage) {
      const tab = await tabFor(targetPage)
      const response = await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'SHOW_PANEL' }), tab.id)
      assert.deepEqual(response, { type: 'PANEL_SHOWN', payload: { ok: true } })
    }
    const page = await context.newPage()
    await page.setViewportSize({ width: 1200, height: 800 })
    await page.goto(url)
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin })
    const host = page.locator('patmail-root')
    const panel = host.locator('.panel')
    await tabFor(page)
    assert.equal(await host.count(), 0)
    await showPanel(page)
    await panel.waitFor()

    const ctx = { report, context, worker, extensionId, page, panel, host, url, easyUrl, apiCalls, visible, tabFor, showPanel }
    return { ctx, report, errors, requestFailures, notFound, dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}
