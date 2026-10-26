import { MessageType, type MessageBridge, type QuerySurfaceEntry } from '../shared/message'
import { QUERY_SURFACES, querySurfaceOf } from './mail-flow'
import type { QuerySurfaceId } from './types'

export interface QuerySurfaceOption {
  value: QuerySurfaceId
  label: string
}

export interface QuerySurfaceLoad {
  ok: boolean
  options: QuerySurfaceOption[]
  message: string
}

/** 原网站菜单地址对上页面，就归到对应的查询入口。认不出的页面不进下拉。 */
const MENU_PAGES: Array<{ id: QuerySurfaceId; page: string }> = [
  { id: 'file', page: 'filesearch.aspx' },
  { id: 'limit', page: 'limitmonitor.aspx' }
]

function surfaceId(value: string): QuerySurfaceId | '' {
  return value === 'file' || value === 'limit' ? value : ''
}

export function surfaceIdFromMenuUrl(url: string): QuerySurfaceId | '' {
  const bare = url.split('?')[0].split('#')[0].trim().toLowerCase()
  if (!bare) return ''
  return MENU_PAGES.find(item => bare.endsWith(item.page))?.id ?? ''
}

/** 菜单条目换成本插件的查询入口选项。名字按菜单上的说法，菜单里没有的入口不出现在下拉里。 */
export function menuSurfaceOptions(entries: readonly QuerySurfaceEntry[]): QuerySurfaceOption[] {
  const order = new Map(QUERY_SURFACES.map((item, index) => [item.id, index]))
  const options: QuerySurfaceOption[] = []
  for (const entry of entries) {
    const id = surfaceId(entry.id) || surfaceIdFromMenuUrl(entry.url)
    if (!id || options.some(item => item.value === id)) continue
    options.push({ value: id, label: entry.label.trim() || querySurfaceOf(id).label })
  }
  return options.sort((left, right) => (order.get(left.value) ?? 99) - (order.get(right.value) ?? 99))
}

function fallback(message: string): QuerySurfaceLoad {
  return { ok: false, options: QUERY_SURFACES.map(item => ({ value: item.id, label: item.label })), message }
}

/** 一次读成功就够用；失败不缓存，下次进来接着试。 */
let cached: QuerySurfaceLoad | null = null

export function cachedQuerySurfaces(): QuerySurfaceLoad | null {
  return cached
}

export async function fetchQuerySurfaces(bridge: MessageBridge | undefined, force: boolean): Promise<QuerySurfaceLoad> {
  if (!force && cached) return cached
  if (!bridge) return fallback('还没连上原网站，查询入口先用内置的两项。')
  try {
    const response = await bridge.request({ type: MessageType.ReadQuerySurfaces })
    if (response.type !== MessageType.QuerySurfacesResult) {
      const message = response.type === MessageType.Error ? response.payload.message : '原网站菜单没有读到。'
      return fallback(message)
    }
    const options = menuSurfaceOptions(response.payload.surfaces)
    if (!options.length) return fallback('原网站菜单里没认出查询入口，先用内置的两项。')
    cached = { ok: true, options, message: '' }
    return cached
  } catch {
    return fallback('查询入口没有从原网站读到。')
  }
}
