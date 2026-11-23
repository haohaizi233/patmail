import { describe, expect, it } from 'vitest'
import {
  isCpcAuthRequired,
  normalizeNoticeInitData,
  normalizeNoticeSearchResponse,
  normalizeUploadProcessList
} from '../../../src/api/notice-normalizer'
import { PATENT_CASE_TYPE_ID } from '../../../src/api/notice-params'

describe('notice-normalizer', () => {
  it('accepts readonly dictionaries even when ClientInfo.Result is false and filters patent apply types', () => {
    const data = normalizeNoticeInitData({
      applyTypes: {
        ClientInfo: { IsLogin: true, Status: true, Result: false },
        ApplyType: [
          { value: 'a1', text_zh_cn: '发明专利', case_type_id: PATENT_CASE_TYPE_ID, apply_type_code: 'IV' },
          { value: 't1', text_zh_cn: '商标', case_type_id: '0E8A4B7F-E407-4EFF-9562-3809BF484207' }
        ]
      },
      agencies: {
        ClientInfo: { IsLogin: true, Status: true, Result: false },
        Agency: [{ agency_id: 'ag1', agency_name_cn: '某某所', agency_code: '44001' }]
      },
      directions: {
        DirectionType: [{ value: 'OO', text_zh_cn: '内到外' }]
      },
      applyTags: {
        ApplyTags: [{ id: 'tag1', name: '高价值' }]
      },
      branches: {
        BranchList: [{ dept_id: 'd1', dept_name: '恒程创新' }]
      },
      countries: {
        country: [{ id: 'CN', name: '中国' }]
      },
      fileTypes: {
        FileType: [
          {
            id: `${PATENT_CASE_TYPE_ID}_11111111-1111-1111-1111-111111111111`,
            name: '官方来文',
            pid: PATENT_CASE_TYPE_ID,
            seq: 1,
            TreeType: 'Dept'
          },
          {
            id: '22222222-2222-2222-2222-222222222222',
            name: '第一次审查意见通知书',
            pid: `${PATENT_CASE_TYPE_ID}_11111111-1111-1111-1111-111111111111`,
            seq: 2
          }
        ]
      },
      cpcAccounts: {
        accounts: [{ id: 'acc1', name: '主账号' }]
      },
      cpcTzsDate: { time: '2026-10-01&2026-11-20' },
      handCheck: { TableRowsCount: '6710', TableRows: [] },
      nolaiutoCount: { ClientInfo: { IsLogin: true, Status: true, Result: false }, count: 161191 }
    })

    expect(data.applyTypes).toEqual([{ value: 'a1', label: '发明专利', extra: { code: 'IV' } }])
    expect(data.agencies[0]?.label).toBe('某某所 (44001)')
    expect(data.directions).toEqual([{ value: 'OO', label: '内到外' }])
    expect(data.applyTags).toEqual([{ value: 'tag1', label: '高价值' }])
    expect(data.branches).toEqual([{ value: 'd1', label: '恒程创新' }])
    expect(data.countries).toEqual([{ value: 'CN', label: '中国' }])
    expect(data.fileTypes).toHaveLength(2)
    expect(data.fileTypes[0]?.selectable).toBe(false)
    expect(data.fileTypes[1]?.selectable).toBeUndefined()
    expect(data.cpcAccounts).toEqual([{ value: 'acc1', label: '主账号' }])
    expect(data.defaultTzsStartDate).toBe('2026-10-01')
    expect(data.handCount).toBe(6710)
    expect(data.nolaiutoCount).toBe(161191)
  })

  it('normalizes string totals, null TableRows, 401 CPC auth, and expired sessions', () => {
    const emptyRes = normalizeNoticeSearchResponse(
      'import',
      { ClientInfo: { IsLogin: true, Status: true, Result: true }, TableRows: null, TableRowsCount: 0 },
      1,
      50
    )
    expect(emptyRes).toEqual({ ok: true, data: { tab: 'import', rows: [], total: 0, pageIndex: 1, pageSize: 50 } })

    const cpc401 = { ClientInfo: { IsLogin: true, Result: false, Message: '401' } }
    expect(isCpcAuthRequired(cpc401)).toBe(true)
    const replayRes = normalizeNoticeSearchResponse('replay', cpc401, 1, 50)
    expect(replayRes.ok).toBe(true)
    if (replayRes.ok) expect(replayRes.data.needCpcLogin).toBe(true)

    const expired = normalizeNoticeSearchResponse('hand', { ClientInfo: { IsLogin: false, Status: false } }, 1, 50)
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error.code).toBe('SESSION_EXPIRED')
  })

  it('normalizes UploadFile GetUploadProcessList rows', () => {
    const rows = normalizeUploadProcessList({
      TableRows: [{ id: 'p1', sn: 1, zip_file_name: 'batch.zip', status: '完成', process: '100%', success_num: 12, fail_num: 0 }]
    })
    expect(rows).toEqual([
      {
        id: 'p1',
        sn: 1,
        zipFileName: 'batch.zip',
        status: '完成',
        process: '100%',
        successNum: '12',
        failNum: '0',
        createTime: '',
        remark: ''
      }
    ])
  })
})
