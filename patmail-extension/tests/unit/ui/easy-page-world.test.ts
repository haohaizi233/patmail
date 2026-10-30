import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEasyPageWorld, type EasyPageWorldHost } from '../../../src/background/easy-page-world'

const channel = 'PATMAIL_EASY_MAIN_WORLD'
const sender = { id: 'extension', tab: { id: 8 }, frameId: 0, documentId: 'document-1', url: location.href } as chrome.runtime.MessageSender
function setup() {
  const executeScript = vi.fn(async (injection: Parameters<EasyPageWorldHost['executeScript']>[0]) => [{ result: injection.func(...injection.args) }])
  const host: EasyPageWorldHost = { extensionId: 'extension', allowsOrigin: origin => origin === location.origin, executeScript }
  return { host, executeScript }
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('EASY main-world bridge', () => {
  it('reads menu values in MAIN in the sender document without adding an inline script', async () => {
    const { host, executeScript } = setup()
    vi.stubGlobal('_UserMenu', [{ is_page: true, menu_url: 'Forms/FileSearch.aspx', menu_name: '文件查询' }, { menu_url: 'hidden' }, null])
    const append = vi.spyOn(document.documentElement, 'appendChild')
    const result = await handleEasyPageWorld({ channel, action: 'read-menu' }, sender, host)
    expect(result).toEqual({ ok: true, entries: [{ name: '文件查询', url: 'Forms/FileSearch.aspx' }] })
    expect(executeScript).toHaveBeenCalledWith(expect.objectContaining({ world: 'MAIN', target: { tabId: 8, documentIds: ['document-1'] } }))
    expect(append).not.toHaveBeenCalled()
    append.mockRestore()
  })
  it.each([
    { id: 'other', tab: { id: 8 }, url: location.href },
    { id: 'extension', url: location.href },
    { id: 'extension', tab: { id: 8 }, url: 'https://untrusted.example/' }
  ])('rejects senders outside the extension content-tab scope', async untrusted => {
    const { host, executeScript } = setup()
    expect((await handleEasyPageWorld({ channel, action: 'read-menu' }, untrusted as chrome.runtime.MessageSender, host)).ok).toBe(false)
    expect(executeScript).not.toHaveBeenCalled()
  })
  it('opens only menu-authorized tabs with arguments passed as data', async () => {
    const { host } = setup()
    const open = vi.fn()
    vi.stubGlobal('AddBusinessTab', open)
    vi.stubGlobal('_UserMenu', [{ is_business: true, menu_url: 'Forms/Allowed.aspx' }])
    const request = { channel, action: 'open-tab', tabId: 'id', title: '标题', path: 'Forms/Allowed.aspx?q=1' }
    expect(await handleEasyPageWorld(request, sender, host)).toMatchObject({ ok: true })
    expect(open).toHaveBeenCalledWith('id', '标题', 'Forms/Allowed.aspx?q=1')
    expect(await handleEasyPageWorld({ ...request, path: 'Forms/Denied.aspx' }, sender, host)).toMatchObject({ ok: false })
    expect(await handleEasyPageWorld({ ...request, path: 'https://untrusted.example/Forms/FAQ.aspx' }, sender, host)).toMatchObject({ ok: false })
    expect(open).toHaveBeenCalledTimes(1)
  })
  it('reports script execution failures and rejects unknown commands', async () => {
    const { host, executeScript } = setup()
    executeScript.mockRejectedValueOnce(new Error('document closed'))
    expect(await handleEasyPageWorld({ channel, action: 'read-menu' }, sender, host)).toEqual({ ok: false, message: 'document closed' })
    expect((await handleEasyPageWorld({ channel, action: 'eval', source: 'anything' }, sender, host)).ok).toBe(false)
    expect(executeScript).toHaveBeenCalledTimes(1)
  })
  it('does not read the page if its origin changed before execution', async () => {
    const { host, executeScript } = setup()
    host.allowsOrigin = origin => origin === new URL(sender.url!).origin
    vi.stubGlobal('location', { origin: 'https://navigated.example' })
    const reply = await handleEasyPageWorld({ channel, action: 'read-menu' }, sender, host)
    expect(reply.ok).toBe(false)
    if (!reply.ok) expect(reply.message).toMatch(/已经变化/)
    expect(executeScript).toHaveBeenCalledTimes(1)
  })
})
