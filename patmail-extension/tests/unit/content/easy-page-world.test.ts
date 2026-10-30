import { afterEach, describe, expect, it, vi } from 'vitest'
import { openEasyPageTab, readEasyPageMenu } from '../../../src/content/easy-page-world'
import { EASY_PAGE_WORLD_CHANNEL, type EasyPageWorldRequest } from '../../../src/shared/easy-page-world'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('EASY 主页面脚本消息桥', () => {
  it('读取菜单时发送固定 action 并清理返回条目', async () => {
    const send = vi.fn(async (_request: EasyPageWorldRequest) => ({
      ok: true as const,
      entries: [
        { name: '  文件查询入口  ', url: '  /Forms/Patent/FileSearch.aspx  ' },
        { name: '无效路径', url: '   ' }
      ]
    }))

    const entries = await readEasyPageMenu(send)

    expect(send).toHaveBeenCalledWith({ channel: EASY_PAGE_WORLD_CHANNEL, action: 'read-menu' })
    expect(entries).toEqual([{ name: '文件查询入口', url: '/Forms/Patent/FileSearch.aspx' }])
  })

  it('打开入口时发送 tab、标题和路径并返回成功状态', async () => {
    const send = vi.fn(async (_request: EasyPageWorldRequest) => ({ ok: true as const }))

    const result = await openEasyPageTab('f_process-7', '流程页', '/Forms/FAQ/Detail.aspx?id=7', send)

    expect(send).toHaveBeenCalledWith({
      channel: EASY_PAGE_WORLD_CHANNEL,
      action: 'open-tab',
      tabId: 'f_process-7',
      title: '流程页',
      path: '/Forms/FAQ/Detail.aspx?id=7'
    })
    expect(result).toEqual({ ok: true, message: '已在 EASY 首页打开。' })
  })

  it('保留后台拒绝原因，并在消息传输失败时给出原有兜底提示', async () => {
    const rejected = await openEasyPageTab('f_1', '流程页', '/Forms/FAQ/Detail.aspx', async () => ({
      ok: false as const,
      message: '当前标签不是 EASY 首页，打不开内部页签。请先回到首页。'
    }))
    const failed = await openEasyPageTab('f_1', '流程页', '/Forms/FAQ/Detail.aspx', async () => {
      throw new Error('background unavailable')
    })

    expect(rejected).toEqual({ ok: false, message: '当前标签不是 EASY 首页，打不开内部页签。请先回到首页。' })
    expect(failed.ok).toBe(false)
    expect(failed.message).toContain('原网站没有接住打开请求')
  })

  it('读取错误响应或传输失败时返回空菜单', async () => {
    const errorReply = await readEasyPageMenu(async () => ({ ok: false, message: '页面上下文不可用' }))
    const failed = await readEasyPageMenu(async () => { throw new Error('background unavailable') })

    expect(errorReply).toEqual([])
    expect(failed).toEqual([])
  })

  it('读取和打开请求都不创建或插入脚本元素', async () => {
    const createElement = vi.spyOn(document, 'createElement')
    const append = vi.spyOn(document.documentElement, 'append')
    const appendChild = vi.spyOn(document.documentElement, 'appendChild')
    const send = async (_request: EasyPageWorldRequest) => ({ ok: true as const, entries: [] })

    await readEasyPageMenu(send)
    await openEasyPageTab('f_1', '流程页', '/Forms/FAQ/Detail.aspx', send)

    expect(createElement).not.toHaveBeenCalled()
    expect(append).not.toHaveBeenCalled()
    expect(appendChild).not.toHaveBeenCalled()
    expect(document.querySelectorAll('script')).toHaveLength(0)
  })
})
