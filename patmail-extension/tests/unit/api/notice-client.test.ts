import { describe, expect, it } from 'vitest'
import { NoticeClient } from '../../../src/api/notice-client'
import { createDefaultNoticeCertQuery, createDefaultNoticeReplayQuery } from '../../../src/api/notice-params'
import type { EasyOperation, EasyTransport } from '../../../src/api/transport'

describe('NoticeClient concurrency and slow count separation', () => {
  it('loads init dictionaries in staggered waves without calling slow count endpoints or racing same-handler locks', async () => {
    const calls: EasyOperation[] = []
    let activeNotice = 0
    let maxNotice = 0
    let activeFiling = 0
    let maxFiling = 0

    const fakeTransport = {
      async post(op: EasyOperation) {
        calls.push(op)
        if (op === 'noticeApplyType' || op === 'noticeAgency' || op === 'noticeDirectionType') {
          activeNotice += 1
          maxNotice = Math.max(maxNotice, activeNotice)
        }
        if (op === 'noticeCpcAccount' || op === 'noticeCpcTzsDate') {
          activeFiling += 1
          maxFiling = Math.max(maxFiling, activeFiling)
        }
        await Promise.resolve()
        if (op === 'noticeApplyType' || op === 'noticeAgency' || op === 'noticeDirectionType') {
          activeNotice -= 1
        }
        if (op === 'noticeCpcAccount' || op === 'noticeCpcTzsDate') {
          activeFiling -= 1
        }
        switch (op) {
          case 'noticeApplyType':
            return { ok: true as const, data: { ApplyType: [{ value: 'a1', text_zh_cn: '发明' }] } }
          case 'noticeAgency':
            return { ok: true as const, data: { Agency: [{ agency_id: 'g1', agency_name_cn: '测试所' }] } }
          case 'noticeDirectionType':
            return { ok: true as const, data: { DirectionType: [{ value: 'OO', text_zh_cn: '内到外' }] } }
          case 'applyTags':
            return { ok: true as const, data: { ApplyTags: [] } }
          case 'deptBranch':
            return { ok: true as const, data: { BranchList: [] } }
          case 'noticeCountry':
            return { ok: true as const, data: { country: [] } }
          case 'fileTypeTree':
            return { ok: true as const, data: { FileType: [] } }
          case 'noticeDetailFileTypes':
            return {
              ok: true as const,
              data: {
                Types: [
                  { id: '81802CDE-D39D-4658-B45E-74631B0715C1', pid: '0', name: '官方来文' },
                  { id: '8c44762d-44d5-4473-b4fc-b818373d6763', pid: '81802cde-d39d-4658-b45e-74631b0715c1', name: '国际检索单位书面意见(PCT/ISA/237)' }
                ]
              }
            }
          case 'treeUser':
            return {
              ok: true as const,
              data: {
                TreeUser: [
                  { id: 'd1', name: '专利部', pid: '0', TreeType: 'Dept' },
                  { id: 'u1', name: '陈秋晓', pid: 'd1', TreeType: 'User' }
                ]
              }
            }
          case 'noticeCpcAccount':
            return { ok: true as const, data: { accounts: [{ id: 'c1', name: '主账号' }] } }
          case 'noticeCpcTzsDate':
            return { ok: true as const, data: { time: '2026-10-01&2026-11-23' } }
          default:
            return { ok: true as const, data: {} }
        }
      }
    } as unknown as EasyTransport

    const client = new NoticeClient({
      transport: fakeTransport,
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true
    })

    const res = await client.loadNoticeInit()
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.data.applyTypes).toHaveLength(1)
    expect(res.data.agencies).toHaveLength(1)
    expect(res.data.directions).toHaveLength(1)
    expect(res.data.detailFileTypes).toEqual([
      { id: '81802CDE-D39D-4658-B45E-74631B0715C1', name: '官方来文', parentId: '', selectable: false },
      { id: '8c44762d-44d5-4473-b4fc-b818373d6763', name: '国际检索单位书面意见(PCT/ISA/237)', parentId: '81802CDE-D39D-4658-B45E-74631B0715C1' }
    ])
    expect(res.data.users).toEqual([
      { id: 'd1', name: '专利部', parentId: '0', selectable: false, treeType: 'Dept' },
      { id: 'u1', name: '陈秋晓', parentId: 'd1', treeType: 'User' }
    ])
    expect(res.data.defaultTzsStartDate).toBe('2026-10-01')
    expect(calls).not.toContain('noticeHandList')
    expect(calls).not.toContain('noticeNolaiutoCount')
    expect(maxNotice).toBe(1)
    expect(maxFiling).toBe(1)
  })

  it('fetches nolaiutoCount sequentially before slow GetHandNoticeList in refreshCounts', async () => {
    const order: string[] = []
    let inflight = 0
    let maxInflight = 0

    const fakeTransport = {
      async post(op: EasyOperation) {
        inflight += 1
        maxInflight = Math.max(maxInflight, inflight)
        order.push(op)
        await Promise.resolve()
        inflight -= 1
        if (op === 'noticeNolaiutoCount') return { ok: true as const, data: { count: 161191 } }
        if (op === 'noticeHandList') return { ok: true as const, data: { TableRowsCount: '6710', TableRows: [] } }
        return { ok: true as const, data: {} }
      }
    } as unknown as EasyTransport

    const client = new NoticeClient({
      transport: fakeTransport,
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true
    })

    const res = await client.executeNoticeAction({ action: 'refreshCounts' })
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(order).toEqual(['noticeNolaiutoCount', 'noticeHandList'])
    expect(maxInflight).toBe(1)
    expect(res.data.counts).toEqual({ nolaiutoCount: 161191, handCount: 6710 })
  })

  it('loads detail sub-tables, case search, case metadata, and appNo file history', async () => {
    const ops: Array<{ op: EasyOperation; body: string }> = []
    const fakeTransport = {
      async post(op: EasyOperation, params: URLSearchParams) {
        ops.push({ op, body: params.toString() })
        await Promise.resolve()
        switch (op) {
          case 'noticeDetail':
            return { ok: true as const, data: { NoticeInfo: { oa_id: 'oa-1', process_status: '0' } } }
          case 'noticeDetailFee':
            return { ok: true as const, data: { TableRows: [{ fee_name: '实审费', fee_amount: 2500 }] } }
          case 'noticeDetailHebo':
            return { ok: true as const, data: { TableRows: [{ law: 'A22.3' }] } }
          case 'noticeDetailDuibi':
            return { ok: true as const, data: { TableRows: [{ country: 'CN', file_no: 'CN111111A' }] } }
          case 'noticeDetailFileTypes':
            return {
              ok: true as const,
              data: {
                Types: [
                  { id: '81802CDE-D39D-4658-B45E-74631B0715C1', pid: '0', name: '官方来文' },
                  { id: '8c44762d-44d5-4473-b4fc-b818373d6763', pid: '81802cde-d39d-4658-b45e-74631b0715c1', name: '国际检索单位书面意见(PCT/ISA/237)' }
                ]
              }
            }
          case 'noticeSearchCase':
            return { ok: true as const, data: { CaseList: [{ id: 'c1', name: 'PO2601' }] } }
          case 'noticeCaseChargeDept':
            return { ok: true as const, data: { DeptInfo: { dept_name: '电学一部' } } }
          case 'noticeCaseType':
            return { ok: true as const, data: { CaseTypeInfo: { case_type_id: 'ct-1' } } }
          case 'noticeAppNoFiles':
            return { ok: true as const, data: { TableRows: [{ file_id: 'f-1', file_name: '一通.pdf' }] } }
          default:
            return { ok: true as const, data: {} }
        }
      }
    } as unknown as EasyTransport

    const client = new NoticeClient({
      transport: fakeTransport,
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true
    })

    const detailRes = await client.executeNoticeAction({ action: 'getNoticeDetail', oaId: 'oa-1', ctrlProcId: 'cp-1' })
    expect(detailRes.ok).toBe(true)
    if (detailRes.ok) {
      expect(detailRes.data.detail).toEqual({ oa_id: 'oa-1', process_status: '0' })
      expect(detailRes.data.detailFileTypes).toEqual([
        { id: '81802CDE-D39D-4658-B45E-74631B0715C1', name: '官方来文', parentId: '', selectable: false },
        { id: '8c44762d-44d5-4473-b4fc-b818373d6763', name: '国际检索单位书面意见(PCT/ISA/237)', parentId: '81802CDE-D39D-4658-B45E-74631B0715C1' }
      ])
      expect(detailRes.data.detailFees).toEqual([{ fee_name: '实审费', fee_amount: 2500 }])
      expect(detailRes.data.detailHebo).toEqual([{ law: 'A22.3' }])
      expect(detailRes.data.detailDuibi).toEqual([{ country: 'CN', file_no: 'CN111111A' }])
    }

    const detailRes2 = await client.executeNoticeAction({ action: 'getNoticeDetail', oaId: 'oa-2' })
    expect(detailRes2.ok).toBe(true)
    if (detailRes2.ok) {
      expect(detailRes2.data.detailFileTypes).toHaveLength(2)
    }

    const searchRes = await client.executeNoticeAction({ action: 'searchNoticeCases', keyword: 'PO26' })
    expect(searchRes.ok).toBe(true)
    if (searchRes.ok) {
      expect(searchRes.data.caseOptions).toEqual([{ value: 'c1', label: 'PO2601' }])
    }

    const metaRes = await client.executeNoticeAction({ action: 'getCaseMeta', caseId: 'c1' })
    expect(metaRes.ok).toBe(true)
    if (metaRes.ok) {
      expect(metaRes.data.chargeDept).toBe('电学一部')
      expect(metaRes.data.caseTypeId).toBe('ct-1')
    }

    const filesRes = await client.executeNoticeAction({ action: 'getAppNoFiles', appNo: '202610012345.6' })
    expect(filesRes.ok).toBe(true)
    if (filesRes.ok) {
      expect(filesRes.data.caseFiles).toEqual([{ file_id: 'f-1', file_name: '一通.pdf' }])
    }

    expect(ops.map(x => x.op)).toEqual([
      'noticeDetail',
      'noticeDetailFee',
      'noticeDetailHebo',
      'noticeDetailDuibi',
      'noticeDetailFileTypes',
      'noticeDetail',
      'noticeDetailFee',
      'noticeDetailHebo',
      'noticeDetailDuibi',
      'noticeSearchCase',
      'noticeCaseChargeDept',
      'noticeCaseType',
      'noticeAppNoFiles'
    ])
  })

  it('loads upload process detail list with status filtering and uploads multi-file batches sharing one GUID', async () => {
    const chunkGuids: string[] = []
    const chunkNames: string[] = []
    let finishGuid = ''
    let detailCallParams = ''

    const fakeTransport = {
      async post(op: EasyOperation, params: URLSearchParams) {
        if (op === 'noticeUploadProcessDetail') {
          detailCallParams = params.toString()
          return {
            ok: true as const,
            data: {
              TableRowsCount: '2',
              TableRows: [
                {
                  id: 'd-1',
                  sn: 1,
                  file_name: 'notice1.pdf',
                  status: '上传失败',
                  message: '案卷不存在',
                  update_time_mm: '2026-11-23 11:00',
                  cn_name: '李四'
                }
              ]
            }
          }
        }
        if (op === 'noticeUploadCpcNew') {
          finishGuid = params.get('GUID') ?? ''
          return {
            ok: true as const,
            data: {
              ClientInfo: { Result: true, Message: '提交完成' },
              Tips: '共解析 2 份通知书',
              oa_ids: 'oa-1;oa-2'
            }
          }
        }
        return { ok: true as const, data: {} }
      },
      async postMultipart(_op: string, formData: FormData, query?: Record<string, string>) {
        chunkGuids.push(query?.GUID ?? '')
        const rawName = formData.get('name')
        chunkNames.push(typeof rawName === 'string' ? rawName : '')
        return { ok: true as const, data: {} }
      }
    } as unknown as EasyTransport

    const client = new NoticeClient({
      transport: fakeTransport,
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true
    })

    const detailRes = await client.executeNoticeAction({
      action: 'getUploadProcessDetailList',
      recordId: 'batch-1',
      status: '3',
      pageIndex: 2,
      pageSize: 10
    })
    expect(detailRes.ok).toBe(true)
    expect(detailCallParams).toContain('Call=GetUploadProcessDetailList')
    expect(detailCallParams).toContain('record_id=batch-1')
    expect(detailCallParams).toContain('status=3')
    expect(detailCallParams).toContain('log_pagename=UploadProcessDetail.aspx')
    if (detailRes.ok) {
      expect(detailRes.data.uploadProcessDetailTotal).toBe(2)
      expect(detailRes.data.uploadProcessDetailRows?.[0]?.status).toBe('上传失败')
    }

    const uploadRes = await client.executeNoticeAction({
      action: 'uploadCpcZip',
      kind: 'cpc',
      fileName: 'a.zip',
      mimeType: 'application/zip',
      base64: 'UEs=',
      files: [
        { fileName: 'a.zip', mimeType: 'application/zip', base64: 'UEs=' },
        { fileName: 'b.zip', mimeType: 'application/zip', base64: 'UEs=' }
      ]
    })
    expect(uploadRes.ok).toBe(true)
    expect(chunkNames).toEqual(['a.zip', 'b.zip'])
    expect(chunkGuids).toHaveLength(2)
    expect(chunkGuids[0]).toBeTruthy()
    expect(chunkGuids[0]).toBe(chunkGuids[1])
    expect(finishGuid).toBe(chunkGuids[0])
    if (uploadRes.ok) {
      expect(uploadRes.data.uploadTips).toBe('共解析 2 份通知书')
      expect(uploadRes.data.uploadedOaIds).toBe('oa-1;oa-2')
    }
  })

  it('pre-checks branch CPC login status before exporting cert or replay tabs', async () => {
    const ops: EasyOperation[] = []
    const fakeTransport = {
      async post(op: EasyOperation) {
        ops.push(op)
        if (op === 'noticeCheckUserStatus') {
          return { ok: true as const, data: { ClientInfo: { Result: false, Message: '401' } } }
        }
        return { ok: true as const, data: {} }
      }
    } as unknown as EasyTransport

    const client = new NoticeClient({
      transport: fakeTransport,
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true
    })

    const certBlocked = await client.exportNoticeExcel({
      tab: 'cert',
      query: { ...createDefaultNoticeCertQuery(), account: 'acc-branch' },
      accountLabel: '深圳_分部'
    })
    expect(certBlocked.ok).toBe(false)
    if (!certBlocked.ok) {
      expect(certBlocked.error.message).toContain('扫码')
    }

    const replayBlocked = await client.exportNoticeExcel({
      tab: 'replay',
      query: { ...createDefaultNoticeReplayQuery('acc-branch') },
      accountLabel: '北京_分部'
    })
    expect(replayBlocked.ok).toBe(false)
    expect(ops).toEqual(['noticeCheckUserStatus', 'noticeCheckUserStatus'])
  })

  it('emits full status-machine lifecycle for downloadTzsList polling', async () => {
    const events: Parameters<NonNullable<Parameters<NoticeClient['executeNoticeAction']>[1]>>[0][] = []
    let statusCalls = 0
    type Deps = ConstructorParameters<typeof NoticeClient>[0]

    const client = new NoticeClient({
      transport: {
        post: (_op: string, params: unknown) => {
          const call = params instanceof URLSearchParams ? params.get('Call') ?? '' : ''
          if (call === 'ProcessTzsList') {
            return Promise.resolve({
              ok: true,
              data: { ClientInfo: { Result: true, Message: '任务已提交，等待后台处理。' } }
            })
          }
          if (call === 'ProcessTzsListStatus') {
            statusCalls += 1
            if (statusCalls <= 2) {
              return Promise.resolve({
                ok: true,
                data: { ClientInfo: { Result: false, Message: '通知书处理中,请稍等!' } }
              })
            }
            return Promise.resolve({
              ok: true,
              data: { ClientInfo: { Result: true, Message: '通知书分析下载完成。' } }
            })
          }
          return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: 'ok' } } })
        }
      } as unknown as Deps['transport'],
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true,
      sleep: () => Promise.resolve()
    })

    const res = await client.executeNoticeAction(
      {
        action: 'downloadTzsList',
        account: 'acc-1',
        fids: ['fid-1'],
        xlh: ['xlh-1']
      },
      event => {
        events.push(event)
      }
    )

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.ok).toBe(true)
      expect(res.data.message).toBe('通知书分析下载完成。')
    }
    expect(statusCalls).toBe(3)
    expect(events.map(e => e.phase)).toEqual([
      'checking_login',
      'submitting',
      'polling',
      'polling',
      'polling',
      'done'
    ])
    expect(events[2]).toMatchObject({
      action: 'downloadTzsList',
      phase: 'polling',
      pollAttempt: 0,
      maxPolls: 25,
      serverMessage: '任务已提交，等待后台处理。'
    })
  })

  it('emits need_login, polling error, and background phases on failure or timeout', async () => {
    type Deps = ConstructorParameters<typeof NoticeClient>[0]
    type StatusEvent = Parameters<NonNullable<Parameters<NoticeClient['executeNoticeAction']>[1]>>[0]

    // 1. CPC 401 -> need_login
    const needLoginEvents: StatusEvent[] = []
    const needLoginClient = new NoticeClient({
      transport: {
        post: (_op: string, params: unknown) => {
          const call = params instanceof URLSearchParams ? params.get('Call') ?? '' : ''
          if (call === 'CheckUserStatus') {
            return Promise.resolve({
              ok: true,
              data: { ClientInfo: { Result: true, Message: 'ok' } }
            })
          }
          return Promise.resolve({
            ok: true,
            data: { ClientInfo: { Result: false, Message: '401' } }
          })
        }
      } as unknown as Deps['transport'],
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true,
      sleep: () => Promise.resolve()
    })
    const needLoginRes = await needLoginClient.executeNoticeAction(
      { action: 'downloadTzsList', account: 'acc-1', accountLabel: '深圳_分部' },
      event => needLoginEvents.push(event)
    )
    expect(needLoginRes.ok).toBe(true)
    if (needLoginRes.ok) {
      expect(needLoginRes.data.ok).toBe(false)
      expect(needLoginRes.data.needCpcLogin).toBe(true)
    }
    expect(needLoginEvents.map(e => e.phase)).toEqual(['checking_login', 'submitting', 'need_login'])

    // 2. Polling returns Result: false with failure message -> error
    const pollErrEvents: StatusEvent[] = []
    const pollErrClient = new NoticeClient({
      transport: {
        post: (_op: string, params: unknown) => {
          const call = params instanceof URLSearchParams ? params.get('Call') ?? '' : ''
          if (call === 'ProcessTzsList') {
            return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: '已启动' } } })
          }
          return Promise.resolve({
            ok: true,
            data: { ClientInfo: { Result: false, Message: '解析失败：连接 CPC 超时' } }
          })
        }
      } as unknown as Deps['transport'],
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true,
      sleep: () => Promise.resolve()
    })
    const pollErrRes = await pollErrClient.executeNoticeAction(
      { action: 'downloadTzsList', account: 'acc-1' },
      event => pollErrEvents.push(event)
    )
    expect(pollErrRes.ok).toBe(true)
    if (pollErrRes.ok) {
      expect(pollErrRes.data.ok).toBe(false)
      expect(pollErrRes.data.message).toBe('解析失败：连接 CPC 超时')
    }
    expect(pollErrEvents.at(-1)?.phase).toBe('error')

    // 3. Background timeout after 25 polls -> ok: true with background status
    const bgEvents: StatusEvent[] = []
    let bgPollCount = 0
    const bgClient = new NoticeClient({
      transport: {
        post: (_op: string, params: unknown) => {
          const call = params instanceof URLSearchParams ? params.get('Call') ?? '' : ''
          if (call === 'ProcessTzsList') {
            return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: '已开始处理' } } })
          }
          if (call === 'ProcessTzsListStatus') {
            bgPollCount += 1
            return Promise.resolve({
              ok: true,
              data: { ClientInfo: { Result: false, Message: '通知书处理中,请稍等!' } }
            })
          }
          return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: 'ok' } } })
        }
      } as unknown as Deps['transport'],
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true,
      sleep: () => Promise.resolve()
    })
    const bgRes = await bgClient.executeNoticeAction(
      { action: 'downloadTzsList', account: 'acc-1' },
      event => bgEvents.push(event)
    )
    expect(bgPollCount).toBe(25)
    expect(bgRes.ok).toBe(true)
    if (bgRes.ok) {
      expect(bgRes.data.ok).toBe(true)
      expect(bgRes.data.message).toContain('后台')
    }
    expect(bgEvents.at(-1)?.phase).toBe('background')
  })

  it('emits syncing_rows before terminal done for replayDownload (isReplay with fids)', async () => {
    type Deps = ConstructorParameters<typeof NoticeClient>[0]
    type StatusEvent = Parameters<NonNullable<Parameters<NoticeClient['executeNoticeAction']>[1]>>[0]
    const events: StatusEvent[] = []
    const client = new NoticeClient({
      transport: {
        post: (_op: string, params: unknown) => {
          const call = params instanceof URLSearchParams ? params.get('Call') ?? '' : ''
          if (call === 'ProcessTzsList') {
            return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: '二次下载已提交' } } })
          }
          if (call === 'ProcessTzsListStatus') {
            return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: '通知书分析下载完成。' } } })
          }
          return Promise.resolve({ ok: true, data: { ClientInfo: { Result: true, Message: '状态已更新' } } })
        }
      } as unknown as Deps['transport'],
      confirmAccountRead: () => Promise.resolve(true),
      expireSession: () => undefined,
      isWriteOpen: () => true,
      sleep: () => Promise.resolve()
    })

    const res = await client.executeNoticeAction(
      {
        action: 'downloadTzsList',
        account: 'acc-1',
        fids: ['fid-1', 'fid-2'],
        xlh: ['xlh-1', 'xlh-2'],
        isReplay: true
      },
      event => events.push(event)
    )

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data.ok).toBe(true)
    }
    expect(events.slice(-2).map(e => e.phase)).toEqual(['syncing_rows', 'done'])
  })
})
