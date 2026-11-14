import { chromium } from 'playwright'

/** 带扩展的持久化上下文；viewport 不传时保持 Playwright 默认（1280×720）。 */
export async function launchExtensionContext(dist, { viewport, acceptDownloads, userDataDir = '' } = {}) {
  // eslint-disable-next-line no-return-await -- 存量豁免：保留 await 以维持 try/finally 语义
  return await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: true,
    ...(viewport ? { viewport } : {}),
    ...(acceptDownloads === undefined ? {} : { acceptDownloads }),
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`]
  })
}

/** 扩展后台 Service Worker（必要时等它启动），扩展 ID 从 worker URL 取。
 *
 * MV3 Service Worker 空闲会被 Chrome 回收，重启后 Playwright 的 Worker 句柄失效并抛
 * "Service worker restarted"。这里返回可恢复句柄：遇到重启自动换新 Worker 重试一次，
 * 让长流程不被 Service Worker 生命周期抖动打断（调用方只用 url()/evaluate()）。 */
export async function extensionWorker(context) {
  let current = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker')
  return {
    url: () => current.url(),
    async evaluate(pageFunction, arg) {
      try {
        return await current.evaluate(pageFunction, arg)
      } catch (error) {
        if (!isServiceWorkerRestart(error)) throw error
        current = await refreshedServiceWorker(context, current)
        return current.evaluate(pageFunction, arg)
      }
    }
  }
}

export function isServiceWorkerRestart(error) {
  return /service worker restarted/i.test(String(error?.message ?? error))
}

/** 重启后旧句柄不可复用，只能从 context 轮询出新 Worker。 */
async function refreshedServiceWorker(context, stale, { timeoutMs = 15000 } = {}) {
  const deadline = Date.now() + timeoutMs
  do {
    const fresh = context.serviceWorkers().find((worker) => worker !== stale)
    if (fresh) return fresh
    await new Promise((resolve) => setTimeout(resolve, 100))
  } while (Date.now() < deadline)
  // eslint-disable-next-line no-return-await -- 存量豁免：保留 await 以维持 try/finally 语义
  return context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: timeoutMs })
}

/**
 * 带瞬态故障容灾的页面导航：启动期/恢复期高负载下 Chromium 偶发
 * net::ERR_PROXY_CONNECTION_FAILED 或 page.goto 加载超时（TimeoutError），
 * 均属瞬时抖动，重试即可恢复。恢复阶段二次拉起浏览器时同样走这里。
 */
export async function gotoWithRetry(page, url, { attempts = 3, timeout = 30000 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await page.goto(url, { timeout })
    } catch (error) {
      const message = String(error?.message ?? error)
      const transient = /ERR_PROXY_CONNECTION_FAILED|ERR_TIMED_OUT|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|Timeout \d+ms exceeded|TimeoutError/.test(message)
      if (attempt >= attempts || !transient) throw error
      await page.waitForTimeout(500 * attempt)
    }
  }
}

/** 经本地 HTTP 代理打开 EASY 夹具页（http://183.36.43.66:88/fixture 由测试服务器代答）。 */
export function gotoFixturePage(page, url, options = {}) {
  return gotoWithRetry(page, url, options)
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
    try {
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
    } catch (error) {
      // Service Worker 刚重启、新实例还没就绪，下一轮重试；其它错误照旧抛出。
      if (!isServiceWorkerRestart(error)) throw error
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
