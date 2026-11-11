import { buildIcSearchParams, icCasesFromBody } from '../api/ic-search'
import type { ApiResult } from '../api/types'
import type { EasyOperation } from '../api/transport'
import { isRecord, readClientInfo } from '../api/response-guards'
import { HagueReadError } from './read-error'
type Post = (operation: EasyOperation, params: URLSearchParams) => Promise<ApiResult<unknown>>

/** Full source stays inside the explicit workflow response, never the CDP observer. */
export async function loadHagueCase(volume: string, post: Post): Promise<string> {
  const query = buildIcSearchParams(volume)
  if (!query.ok) throw new HagueReadError(query.error.message)
  const searched = await post('icSearch', query.data)
  if (!searched.ok) throw new HagueReadError(searched.error.message)
  if (!isRecord(searched.data)) throw new HagueReadError('案件查询返回格式无效')
  const session = readClientInfo(searched.data.ClientInfo)
  if (!session.ok || session.data.IsLogin === false) throw new HagueReadError('EASY 登录失效，请重新检测登录状态。')
  const hits = icCasesFromBody(searched.data).filter(h => h.caseVolume.toUpperCase() === volume.trim().toUpperCase())
  if (!hits.length) throw new HagueReadError(`当前连接的知易通未找到案件 ${volume}。请核对文号及所选的大客户/中小客户系统；本案尚未开始仲裁。`)
  if (hits.length !== 1) throw new HagueReadError(`文号 ${volume} 精确匹配到 ${hits.length} 件案件，请核对文号。`)
  const id = hits[0].caseId
  const sources: Record<string, unknown> = { caseVolume: volume }
  const routes: [EasyOperation, string, Record<string, string>][] = [
    ['caseManageInfo', 'GetCaseInfo', { case_id: id }],
    ['hagueApplicants', 'GetCaseApplicant', { id }],
    ['caseInventor', 'GetCaseInventor', { apply_id: id, _PK: 'inventor_id' }],
    ['haguePriorities', 'GetCasePriority', { id, _PK: 'priority_id' }]
  ]
  await Promise.all(routes.map(async ([operation, call, fields]) => {
    const pages: unknown[] = []
    for (let page = 1; page <= 20; page++) {
      const params = new URLSearchParams({ Call: call, ...fields, pageSize: '50', pageIndex: String(page), searchKey: '', colsel: '', log_pagename: 'CaseManage.aspx' })
      const response = await post(operation, params)
      if (!response.ok) throw new HagueReadError(`${call}：${response.error.message}`)
      const raw = response.data
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new HagueReadError(`${call} 返回格式无效`)
      const client = readClientInfo('ClientInfo' in raw ? raw.ClientInfo : undefined)
      if (!client.ok || client.data.IsLogin === false) throw new HagueReadError(`${call}：EASY 登录失效，请重新检测登录状态。`)
      // Session metadata is not application source and must not be sent to the model.
      const { ClientInfo: _session, ...business } = raw as Record<string, unknown>
      pages.push(business)
      const rows = 'TableRows' in raw ? raw.TableRows : undefined
      if (!Array.isArray(rows) || rows.length < 50) break
      if (page === 20) throw new HagueReadError(`${call} 数据过多，未读取完整`)
    }
    sources[call] = pages
  }))
  const result = JSON.stringify(sources)
  if (result.length > 100_000) throw new HagueReadError('案件信息过大，未交给仲裁，请缩小材料范围')
  return result
}
