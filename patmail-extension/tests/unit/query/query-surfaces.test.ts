import { describe, expect, it } from 'vitest'
import { fetchQuerySurfaces, menuSurfaceOptions, surfaceIdFromMenuUrl } from '../../../src/customer/query-surfaces'
import { MessageType, isContentRequest, isMessage, type ContentRequest, type ContentResponse, type MessageBridge } from '../../../src/shared/message'

function bridgeOf(handler: (message: ContentRequest) => ContentResponse): MessageBridge {
  return {
    request: async message => handler(message)
  }
}

describe('查询入口热加载', () => {
  it('菜单地址对上页面才认成查询入口', () => {
    expect(surfaceIdFromMenuUrl('/Forms/Patent/FileSearch.aspx')).toBe('file')
    expect(surfaceIdFromMenuUrl('forms/patent/LimitMonitor.aspx?from=menu')).toBe('limit')
    expect(surfaceIdFromMenuUrl('/Forms/Patent/CaseManage.aspx')).toBe('')
    expect(surfaceIdFromMenuUrl('')).toBe('')
  })

  it('菜单条目换成本插件的选项：名字按菜单说法，认不出的不进下拉', () => {
    const options = menuSurfaceOptions([
      { id: '', label: '期限监控', url: '/Forms/Patent/LimitMonitor.aspx' },
      { id: '', label: '文件检索', url: '/Forms/Patent/FileSearch.aspx' },
      { id: '', label: '又一个文件', url: '/Forms/Patent/FileSearch.aspx?menu=1' },
      { id: '', label: '案件管理', url: '/Forms/Patent/CaseManage.aspx' }
    ])
    expect(options).toEqual([
      { value: 'file', label: '文件检索' },
      { value: 'limit', label: '期限监控' }
    ])
  })

  it('菜单上没写名字时退回内置叫法', () => {
    expect(menuSurfaceOptions([{ id: 'file', label: '', url: '/x/FileSearch.aspx' }]))
      .toEqual([{ value: 'file', label: '文件查询' }])
  })

  it('从原网站读菜单，选项和名字跟着菜单走', async () => {
    const seen: string[] = []
    const bridge = bridgeOf(message => {
      seen.push(message.type)
      return {
        type: MessageType.QuerySurfacesResult,
        payload: { surfaces: [{ id: 'limit', label: '期限预警', url: '/Forms/Patent/LimitMonitor.aspx' }] }
      }
    })
    const loaded = await fetchQuerySurfaces(bridge, true)
    expect(loaded.ok).toBe(true)
    expect(loaded.options).toEqual([{ value: 'limit', label: '期限预警' }])
    expect(seen).toEqual([MessageType.ReadQuerySurfaces])
    // 读成功后不再反复问原网站，除非点重新读取
    const again = await fetchQuerySurfaces(bridge, false)
    expect(again.options).toEqual([{ value: 'limit', label: '期限预警' }])
    expect(seen).toEqual([MessageType.ReadQuerySurfaces])
  })

  it('菜单读不到时退回内置两项，并带上原因', async () => {
    const bridge = bridgeOf(() => ({ type: MessageType.Error, payload: { message: 'EASY 页面没连上。' } }))
    const loaded = await fetchQuerySurfaces(bridge, true)
    expect(loaded.ok).toBe(false)
    expect(loaded.message).toBe('EASY 页面没连上。')
    expect(loaded.options.map(item => item.value)).toEqual(['file', 'limit'])
  })

  it('没有桥时也是内置两项', async () => {
    const loaded = await fetchQuerySurfaces(undefined, true)
    expect(loaded.ok).toBe(false)
    expect(loaded.options.map(item => item.value)).toEqual(['file', 'limit'])
  })

  it('消息校验认这条新消息', () => {
    expect(isContentRequest({ type: 'READ_QUERY_SURFACES' })).toBe(true)
    expect(isContentRequest({ type: 'READ_QUERY_SURFACES', payload: {} })).toBe(false)
    expect(isMessage({
      type: 'QUERY_SURFACES_RESULT',
      payload: { surfaces: [{ id: 'file', label: '文件查询', url: '/Forms/Patent/FileSearch.aspx' }] }
    })).toBe(true)
    expect(isMessage({ type: 'QUERY_SURFACES_RESULT', payload: { surfaces: [{ id: 'file', label: '文件查询' }] } })).toBe(false)
  })
})
