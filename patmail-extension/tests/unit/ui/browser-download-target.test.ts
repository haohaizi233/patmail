import { afterEach, describe, expect, it, vi } from 'vitest'
import { chooseBrowserDownloadTarget, handleBrowserFileMessage, releaseBrowserDownloadTarget } from '../../../src/browser-download/target'
import { BROWSER_FILE_CHANNEL, type BrowserFileReply } from '../../../src/browser-download/types'

const taskId = '11111111-1111-4111-8111-111111111111'
const owner = '["https://easy.test","account"]'
afterEach(async () => { await releaseBrowserDownloadTarget(taskId); vi.unstubAllGlobals() })
describe('浏览器直接保存目标', () => {
  it('选择器同步唤起，只有后台发给对应目标的字节才能按序写入并提交', async () => {
    const written: number[] = []
    let closed = false
    const picker = vi.fn(async () => ({ createWritable: async () => ({
      async write(bytes: Uint8Array) { written.push(...bytes) }, async close() { closed = true }
    }) }))
    vi.stubGlobal('showSaveFilePicker', picker)
    vi.stubGlobal('chrome', { runtime: { id: 'self', getURL: (p: string) => `chrome-extension://self/${p}`, onMessage: { addListener() {} } } })
    const choosing = chooseBrowserDownloadTarget(taskId, owner, 'test.zip')
    expect(picker).toHaveBeenCalledOnce()
    const targetId = await choosing
    const sender = { id: 'self', url: 'chrome-extension://self/background.js' }
    const call = async (action: string, rest = {}) => await new Promise<BrowserFileReply>(resolve => {
      expect(handleBrowserFileMessage({ channel: BROWSER_FILE_CHANNEL, targetId, taskId, owner, action, ...rest }, sender, resolve)).toBe(true)
    })
    expect(handleBrowserFileMessage({ channel: BROWSER_FILE_CHANNEL, targetId, taskId, owner, action: 'open' },
      { id: 'self', tab: { id: 1 }, url: 'https://easy.test/' } as chrome.runtime.MessageSender, () => { throw new Error('来源页不能打开文件') })).toBe(false)
    expect(await call('open')).toEqual({ ok: true })
    expect(await call('write', { offset: 0, data: btoa('ZIP') })).toEqual({ ok: true })
    expect((await call('write', { offset: 99, data: btoa('bad') })).ok).toBe(false)
    expect(written).toEqual([90, 73, 80])
    expect(closed).toBe(false)
    expect(await call('finish')).toEqual({ ok: true })
    expect(closed).toBe(true)
  })
  it('用户取消选择器时不注册可写目标', async () => {
    vi.stubGlobal('showSaveFilePicker', async () => { throw new DOMException('cancelled', 'AbortError') })
    await expect(chooseBrowserDownloadTarget(taskId, owner, 'test.zip')).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('后台重启后同页重选目标，旧writer必须先关闭，卸载不能覆盖新文件', async () => {
    let disk = ''
    vi.stubGlobal('chrome', { runtime: { id: 'self', getURL: (p: string) => `chrome-extension://self/${p}`, onMessage: { addListener() {} } } })
    vi.stubGlobal('showSaveFilePicker', async () => ({ createWritable: async () => {
      let staged = ''
      return { async write(bytes: Uint8Array) { staged += new TextDecoder().decode(bytes) }, async close() { disk = staged } }
    } }))
    const call = async (targetId: string, action: string, rest = {}) => await new Promise<BrowserFileReply>(resolve => {
      handleBrowserFileMessage({ channel: BROWSER_FILE_CHANNEL, targetId, taskId, owner, action, ...rest },
        { id: 'self', url: 'chrome-extension://self/background.js' }, resolve)
    })
    const first = await chooseBrowserDownloadTarget(taskId, owner, 'test.zip')
    await call(first, 'open'); await call(first, 'write', { offset: 0, data: btoa('partial') })
    const second = await chooseBrowserDownloadTarget(taskId, owner, 'test.zip')
    await call(second, 'open'); await call(second, 'write', { offset: 0, data: btoa('complete ZIP') }); await call(second, 'finish')
    expect(disk).toBe('complete ZIP')
    await releaseBrowserDownloadTarget(taskId)
    expect(disk).toBe('complete ZIP')
  })
})
