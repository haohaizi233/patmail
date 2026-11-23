import { describe, expect, it } from 'vitest'
import { NoticeClient } from '../../../src/api/notice-client'
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
      expect(detailRes.data.detailFees).toEqual([{ fee_name: '实审费', fee_amount: 2500 }])
      expect(detailRes.data.detailHebo).toEqual([{ law: 'A22.3' }])
      expect(detailRes.data.detailDuibi).toEqual([{ country: 'CN', file_no: 'CN111111A' }])
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
      'noticeSearchCase',
      'noticeCaseChargeDept',
      'noticeCaseType',
      'noticeAppNoFiles'
    ])
  })
})
