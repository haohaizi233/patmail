import { afterEach, expect, it, vi } from 'vitest'
import { chooseBrowserDownloadTarget, releaseBrowserDownloadTarget } from '../../../src/browser-download/target'

const taskId = '11111111-1111-4111-8111-111111111111'
afterEach(async () => { await releaseBrowserDownloadTarget(taskId); vi.unstubAllGlobals(); document.body.innerHTML = '' })

it('下载注册原生目标，无需文件选择器；只接受后台发给该任务的同源流导航', async () => {
  let listener: Function | undefined
  vi.stubGlobal('chrome', { runtime: { id: 'self', getURL: (path: string) => `chrome-extension://self/${path}`, onMessage: { addListener(fn: Function) { listener = fn } } } })
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {}, ready: Promise.resolve({}) } })
  const picker = vi.fn(() => { throw new Error('原生下载不应调用文件选择器') })
  vi.stubGlobal('showSaveFilePicker', picker)
  const owner = '["https://easy.test","account"]'
  const targetId = await chooseBrowserDownloadTarget(taskId, owner, '中文.zip')
  expect(picker).not.toHaveBeenCalled()
  const message = { channel: 'PATMAIL_NATIVE_NAVIGATE', taskId, targetId, owner, url: 'chrome-extension://self/_patmail_native_download/secret/archive.zip' }
  expect(listener!(message, { id: 'self', tab: { id: 7 } }, vi.fn())).toBe(false)
  expect(listener!({ ...message, url: 'https://evil.test/archive.zip' }, { id: 'self', url: 'chrome-extension://self/background.js' }, vi.fn())).toBe(false)
  const result = await new Promise(resolve => { expect(listener!(message, { id: 'self', url: 'chrome-extension://self/background.js' }, resolve)).toBe(true) })
  expect(result).toEqual({ ok: true })
  expect(document.querySelector('iframe')?.src).toBe(message.url)
  await releaseBrowserDownloadTarget(taskId)
  expect(document.querySelector('iframe')).toBeNull()
})
