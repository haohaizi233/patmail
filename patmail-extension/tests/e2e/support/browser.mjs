import { chromium } from 'playwright'

/** 带扩展的持久化上下文；viewport 不传时保持 Playwright 默认（1280×720）。 */
export async function launchExtensionContext(dist, { viewport, acceptDownloads, userDataDir = '' } = {}) {
  return await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ...(viewport ? { viewport } : {}),
    ...(acceptDownloads === undefined ? {} : { acceptDownloads }),
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  })
}

/** 扩展后台 Service Worker（必要时等它启动），扩展 ID 从 worker URL 取。 */
export async function extensionWorker(context) {
  return context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
}

/** Playwright waitForFunction treats an async predicate's Promise as truthy. Await RPCs in Node. */
export async function waitForPageCondition(page, predicate, arg, { timeout = 30000 } = {}) {
  const deadline = Date.now() + timeout
  do {
    if (await page.evaluate(predicate, arg)) return
    await page.waitForTimeout(100)
  } while (Date.now() < deadline)
  throw new Error('等待页面异步状态超时。')
}

/** 等目标标签上的内容脚本完成 PING/PONG 握手；轮询节奏由调用方按场景指定。 */
export async function waitForContentScript(worker, targetPage, { attempts = 25, intervalMs = 200 } = {}) {
  const targetUrl = targetPage.url()
  for (let attempt = 0; attempt < attempts; attempt++) {
    const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find((item) => item.url === targetUrl)
    if (tab?.id) {
      try {
        const pong = await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId: 0 }), tab.id)
        if (pong?.type === 'PONG') {
          await openPanelShadow(worker, tab.id)
          return tab
        }
      } catch {
        // 内容脚本仍在启动。
      }
    }
    await targetPage.waitForTimeout(intervalMs)
  }
  throw new Error(`content script did not answer ${targetUrl}`)
}

/**
 * 生产注入器用 closed shadow 封装面板（src/content/injector.ts），页面和 Playwright
 * 都看不到里面。自动化必须能操作面板 DOM，所以在扩展的隔离世界里把 attachShadow
 * 换成 open：只影响被测标签的 shadow 可见性，不动产品代码，也不影响主世界里的站点。
 * 生产仍是 closed shadow，由 tests/unit/content/injector.test.ts 的契约断言守住。
 */
export async function openPanelShadow(worker, tabId) {
  await worker.evaluate(async (id) => {
    await chrome.scripting.executeScript({
      target: { tabId: id },
      world: 'ISOLATED',
      func: () => {
        const globalKey = '__patmailShadowOpened'
        const scope = globalThis
        if (scope[globalKey]) return
        scope[globalKey] = true
        const original = Element.prototype.attachShadow
        Element.prototype.attachShadow = function (init) {
          return original.call(this, { ...init, mode: 'open' })
        }
      }
    })
  }, tabId)
}
