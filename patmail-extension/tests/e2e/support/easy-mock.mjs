/** EASY 业务源（http://183.36.43.66:88）只允许被 Playwright 路由拦截；测试绝不触达真实业务服务器。 */
export const easyOrigin = 'http://183.36.43.66:88'
const easyRoute = `${easyOrigin}/**`
export const easyFixtureUrl = `${easyOrigin}/fixture`
const operatorId = '11111111-1111-1111-1111-111111111111'

function json(response) {
  return JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: true }, ...response })
}

function isAuthenticated(headers) {
  return headers.cookie?.includes('pm_fixture_session=active') === true
}

function limitRow(customerName) {
  return {
    proc_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    case_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    case_volume: 'GAC-TY-001',
    case_name: '广汽丰田案件',
    ctrl_proc: '官方期限事项',
    customer_name: customerName,
    app_no: 'CN20260001',
    legal_due_date: '2026-12-31',
    cus_due_date: '2026-11-30',
    int_due_date: '2026-10-31'
  }
}

/**
 * 只读字典与查询模板扇出（extension / limit-query 两个 profile 共用）：
 * 合法空响应即可让页面进入可查询状态，避免 404 污染 console。
 */
async function readOnlyFanout(route, pathName, params) {
  if (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'SearchQueryHisList') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({ Options: null, QueryXml: null })
    })
    return true
  }
  if (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'GetApplyTags') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({ ApplyTags: null })
    })
    return true
  }
  // 文件查询页的两支基础字典：字段全部显式给 null，适配器才会走 'empty' 而不是
  // 'invalid'（undefined 会打「字典缺失」告警并让字典缓存判无效反复重取）。
  if (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'IPGetBasicData') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({
        CaseType: null, Country: null, CaseStatus: null, ApplyType: null, BussType: null,
        customer_status: null, CtrlProc: null, ProcStatus: null, Case_direction: null, CaseBranchDept: null
      })
    })
    return true
  }
  if (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'GetFlowdirection') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({
        FileStatus: null, CaseBranchDept: null, ProcStatus: null, Case_direction: null, DownLoadFileName: null
      })
    })
    return true
  }
  // 期限监控选择器的初始化字典（与 limitQueryRoute 的同名分支同一口径）。
  if (pathName === '/AjaxServers/Report.ashx' && params.get('Call') === 'LimitMonitorInit') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({
        CountryInfo: [], CaseType: [], ProcStatus: [], CustomerStatus: [], procType: [],
        Case_direction: [], apply_type: [], case_status: [], BussType: []
      })
    })
    return true
  }
  if (pathName === '/AjaxServers/Report.ashx' && params.get('Call') === 'LimitMonitorGetCtrlproc') {
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: json({ CtrlProc: [] }) })
    return true
  }
  // The picker load fans out across these read-only endpoints. Empty valid bodies
  // are enough for the page to become queryable while keeping the fixture small.
  if (
    pathName === '/AjaxServers/BaseInfo.ashx' ||
    pathName === '/AjaxServers/Common.ashx' ||
    (pathName === '/AjaxServers/PatentAction.ashx' && params.get('Call') === 'GetFieldColumn') ||
    (pathName === '/AjaxServers/FilingAction.ashx' && params.get('Call') === 'GetFilingFlowNode') ||
    (pathName === '/AjaxServers/Customer.ashx' && params.get('Call') === 'InitContractStatus') ||
    (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'GetCaseBusFlow')
  ) {
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: json({}) })
    return true
  }
  return false
}

// extension profile：文件查询、邮件、流程与 GetSearchFiles 的空/错/重复/撤销分支。
async function extensionRoute(route, request, pathName, params, authenticated, apiCalls, state) {
  if (pathName === '/AjaxServers/Login.ashx' && params.get('Call') === 'GetUserModel') {
    if (!authenticated) {
      await route.fulfill({
        status: 200, contentType: 'text/plain; charset=utf-8',
        body: '<div style="width:100%;text-align: center;font-size:40px;">出错了!</div>'
      })
      return
    }
    const userB = (await request.allHeaders()).cookie?.includes('pm_fixture_user=b') === true
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8',
      body: JSON.stringify({
        UserModel: userB
          ? { user_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', user_name: 'user-b', Name: '用户乙', SessionId: 'hidden' }
          : { user_id: operatorId, user_name: 'tester', Name: '测试员', SessionId: 'hidden' },
        ClientInfo: { IsLogin: true, Status: true, Result: false, Message: null }
      }) })
    return
  }
  if (pathName === '/AjaxServers/Mail.ashx' && params.get('Call') === 'GetMailInfo') {
    if (params.get('mail_id') === '50250250-5025-4025-8025-502502502502') {
      await route.fulfill({ status: 502, contentType: 'text/plain; charset=utf-8', body: 'bad gateway' })
      return
    }
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: JSON.stringify({ ClientInfo: { IsLogin: true, Status: true, Result: true }, mail_id: params.get('mail_id') }) })
    return
  }
  if (pathName === '/AjaxServers/Common.ashx' && params.get('Call') === 'GetFlowInfo') {
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: JSON.stringify({ ClientInfo: { IsLogin: true, Status: false, Result: false, Message: '流程类型不匹配' } }) })
    return
  }
  if (pathName === '/AjaxServers/CaseInfo.ashx' && params.get('Call') === 'GetSearchFiles') {
    const empty = params.get('file_name') === 'empty'
    const failed = params.get('file_name') === 'error'
    const pageIndex = Number(params.get('pageIndex'))
    const revoke = params.get('case_volume') === 'E2E-REVOKE'
    const revokeFirst = revoke && state.revokeReads === 0
    if (revoke) state.revokeReads += 1
    const body = !authenticated
      ? { ClientInfo: { IsLogin: false, Status: false, Result: false }, TableRows: null, TableRowsCount: '0' }
      : failed
        ? { ClientInfo: { IsLogin: true, Status: false, Result: false, Message: '模拟业务失败' }, TableRows: null, TableRowsCount: '0' }
        : {
            ClientInfo: { IsLogin: true, Status: true, Result: true },
            TableRowsCount: empty ? '0' : '21',
            TableRows: empty ? null : params.get('file_name') === 'dup-id' ? [
              { file_id: 'file-dup', file_name: '重复.pdf', file_desc: '专利证书', case_volume: params.get('case_volume'), app_no: 'CN123', customer_name: '测试客户', post_date: '2026-09-24', file_status: '已发文' },
              { file_id: 'file-dup', file_name: '重复.pdf', file_desc: '审查意见通知书', case_volume: params.get('case_volume'), app_no: 'CN123', customer_name: '测试客户', post_date: '2026-09-24', file_status: '已发文' }
            ] : [revoke ? {
              file_id: revokeFirst ? 'file-revoke-a' : 'file-revoke-b',
              file_name: revokeFirst ? '文件A.pdf' : '文件B.pdf',
              file_desc: '专利证书', case_volume: 'E2E-REVOKE',
              app_no: 'CN123', customer_name: '测试客户', post_date: '2026-09-24', file_status: '已发文'
            } : {
              file_id: `file-${pageIndex}`, file_name: `通知书-${pageIndex}.pdf`,
              file_desc: '审查意见通知书', case_volume: params.get('case_volume'),
              app_no: 'CN123', customer_name: '测试客户', post_date: '2026-09-24', file_status: '已发文'
            }]
          }
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: JSON.stringify(body) })
    return
  }
  if (await readOnlyFanout(route, pathName, params)) return
  // Unmatched routes fall through here. Log them so fixture gaps surface loudly in
  // the test output instead of silently becoming 404 console errors later.
  console.warn(`[easy-mock] fixture route not found: ${pathName} Call=${params.get('Call') ?? '(none)'}`)
  await route.fulfill({ status: 404 })
}

// limit-query profile：期限监控查询链路（含会话失效、HTTP 错误与只读重试）。
async function limitQueryRoute(route, request, pathName, params, authenticated, apiCalls, state) {
  if (pathName === '/AjaxServers/Login.ashx' && params.get('Call') === 'GetUserModel') {
    if (!authenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: '<div style="width:100%;text-align: center;font-size:40px;">出错了!</div>'
      })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: JSON.stringify({
        UserModel: { user_id: operatorId, user_name: 'tester', Name: '测试员', SessionId: 'fixture-only' },
        ClientInfo: { IsLogin: true, Status: true, Result: false, Message: null }
      })
    })
    return
  }

  if (pathName === '/AjaxServers/Report.ashx' && params.get('Call') === 'LimitMonitorInit') {
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({
        CountryInfo: [], CaseType: [], ProcStatus: [], CustomerStatus: [], procType: [],
        Case_direction: [], apply_type: [], case_status: [], BussType: []
      })
    })
    return
  }

  if (pathName === '/AjaxServers/Report.ashx' && params.get('Call') === 'LimitMonitorGetCtrlproc') {
    await route.fulfill({ status: 200, contentType: 'text/plain; charset=utf-8', body: json({ CtrlProc: [] }) })
    return
  }

  if (pathName === '/AjaxServers/Report.ashx' && params.get('Call') === 'GetLimitMonitorCaseList') {
    if (!authenticated) {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: JSON.stringify({ ClientInfo: { IsLogin: false, Status: false, Result: false }, TableRows: null, TableRowsCount: '0' })
      })
      return
    }
    if (state.limitMode === 'expired') {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: JSON.stringify({ ClientInfo: { IsLogin: false, Status: false, Result: false }, TableRows: null, TableRowsCount: '0' })
      })
      return
    }
    if (state.limitMode === 'http-error') {
      await route.fulfill({ status: 503, contentType: 'text/plain; charset=utf-8', body: 'fixture unavailable' })
      return
    }
    const customerName = params.get('customer_name') || ''
    await route.fulfill({
      status: 200,
      contentType: 'text/plain; charset=utf-8',
      body: json({ TableRows: [limitRow(customerName)], TableRowsCount: '1' })
    })
    return
  }

  // 期限页加载时的其余只读字典与查询模板扇出（SearchQueryHisList、GetApplyTags、
  // BaseInfo/Common、字段列、流程节点、合同状态、案件流程）：合法空响应即可让页面
  // 进入可查询状态，避免 404 污染 console。
  if (await readOnlyFanout(route, pathName, params)) return
  // Unmatched routes fall through here. Log them so fixture gaps surface loudly in
  // the test output instead of silently becoming 404 console errors later.
  console.warn(`[easy-mock] fixture route not found: ${pathName} Call=${params.get('Call') ?? '(none)'}`)
  await route.fulfill({ status: 404, contentType: 'text/plain; charset=utf-8', body: 'fixture route not found' })
}

/**
 * 按 profile 安装 EASY 路由拦截。返回的实例自带 apiCalls 与模式开关，
 * 每个脚本各自创建，避免场景间共享状态互相污染。
 */
export async function installEasyMock(context, { fixtureHtml, profile }) {
  const apiCalls = []
  const state = { limitMode: 'success', revokeReads: 0 }
  const handler = async route => {
    const request = route.request()
    const pathName = new URL(request.url()).pathname
    if (pathName === '/favicon.ico') {
      await route.fulfill({ status: 204 })
      return
    }
    if (pathName === '/fixture') {
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fixtureHtml })
      return
    }

    const params = new URLSearchParams(request.postData() ?? '')
    const headers = await request.allHeaders()
    const authenticated = isAuthenticated(headers)
    apiCalls.push({ path: pathName, method: request.method(), params, authenticated })

    if (profile === 'limit-query') {
      await limitQueryRoute(route, request, pathName, params, authenticated, apiCalls, state)
      return
    }
    await extensionRoute(route, request, pathName, params, authenticated, apiCalls, state)
  }
  await context.route(easyRoute, handler)
  return {
    apiCalls,
    setLimitMode(mode) { state.limitMode = mode },
    async dispose() {
      try { await context.unroute(easyRoute, handler) } catch { /* context 已关闭 */ }
    }
  }
}
