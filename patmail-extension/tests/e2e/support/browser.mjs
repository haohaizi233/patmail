import { chromium } from 'playwright'

/** 带扩展的持久化上下文；viewport 不传时保持 Playwright 默认（1280×720）。 */
export async function launchExtensionContext(dist, { viewport, acceptDownloads } = {}) {
  return await chromium.launchPersistentContext('', {
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

/** 等目标标签上的内容脚本完成 PING/PONG 握手；轮询节奏由调用方按场景指定。 */
export async function waitForContentScript(worker, targetPage, { attempts = 25, intervalMs = 200 } = {}) {
  const targetUrl = targetPage.url()
  for (let attempt = 0; attempt < attempts; attempt++) {
    const tab = (await worker.evaluate(() => chrome.tabs.query({}))).find((item) => item.url === targetUrl)
    if (tab?.id) {
      try {
        const pong = await worker.evaluate((tabId) => chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId: 0 }), tab.id)
        if (pong?.type === 'PONG') return tab
      } catch {
        // 内容脚本仍在启动。
      }
    }
    await targetPage.waitForTimeout(intervalMs)
  }
  throw new Error(`content script did not answer ${targetUrl}`)
}
