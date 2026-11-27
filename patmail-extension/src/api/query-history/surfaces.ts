/** SearchQueryHisList 按页面区分。期限监控的破折号是 U+2014，不是普通连字符。 */
export const HISTORY_SURFACES = ['file', 'limit', 'fee', 'patent'] as const
export type HistorySurface = (typeof HISTORY_SURFACES)[number]

export function isHistorySurface(value: unknown): value is HistorySurface {
  return value === 'file' || value === 'limit' || value === 'fee' || value === 'patent'
}

function surfaceMeta(surface: HistorySurface): { queryType: string; pageName: string } {
  if (surface === 'limit') return { queryType: 'LimitMonitor\u2014liall', pageName: 'LimitMonitor.aspx' }
  if (surface === 'fee') return { queryType: 'FeeSearch', pageName: 'FeeSearch.aspx' }
  if (surface === 'patent') return { queryType: 'ICSearch', pageName: 'ICSearch.aspx' }
  return { queryType: 'FileSearch', pageName: 'FileSearch.aspx' }
}

export function historySaveRequest(surface: HistorySurface, title: string, queryId: string, queryXml: string): URLSearchParams {
  const { queryType } = surfaceMeta(surface)
  return new URLSearchParams({
    Call: 'SearchQueryHisSave',
    is_proc: 'false',
    is_out_save: 'false',
    is_query_save: 'true',
    query_save_title: title,
    query_id: queryId,
    query_xml: queryXml,
    out_xml: '',
    query_type: queryType
  })
}

export function historyDeleteRequest(surface: HistorySurface, queryId: string): URLSearchParams {
  const { pageName } = surfaceMeta(surface)
  return new URLSearchParams({
    Call: 'SearchQueryHisDelete',
    query_id: queryId,
    log_pagename: pageName
  })
}

export function historyRequest(surface: HistorySurface, queryId: string): URLSearchParams {
  const { queryType, pageName } = surfaceMeta(surface)
  return new URLSearchParams({
    Call: 'SearchQueryHisList',
    query_type: queryType,
    query_id: queryId,
    log_pagename: pageName
  })
}
