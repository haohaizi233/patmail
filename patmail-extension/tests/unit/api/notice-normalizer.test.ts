import { describe, expect, it } from 'vitest'
import {
  isCpcAuthRequired,
  normalizeNoticeDetailFileTypes,
  normalizeNoticeInitData,
  normalizeNoticeSearchResponse,
  normalizeUploadProcessDetailList,
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
    // pcheck: true 允许勾选来文大类父节点
    expect(data.fileTypes[0]?.selectable).toBeUndefined()
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

  it('normalizes UploadFile GetUploadProcessList and GetUploadProcessDetailList rows and publish flags', () => {
    const rows = normalizeUploadProcessList({
      TableRows: [
        {
          id: 'p1',
          sn: 1,
          zip_file_name: 'batch.zip',
          status: '完成',
          process: '100%',
          success_num: 12,
          fail_num: 0,
          merge_num: 2,
          total_num: 14,
          create_time_mm: '2026-11-23 10:00',
          cn_name: '张三'
        }
      ]
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
        mergeNum: '2',
        totalNum: '14',
        createTime: '2026-11-23 10:00',
        uploader: '张三',
        remark: ''
      }
    ])

    const detail = normalizeUploadProcessDetailList({
      TableRowsCount: '15',
      TableRows: [
        {
          id: 'd1',
          sn: 1,
          file_name: 'GA001.pdf',
          status: '上传失败',
          message: '找不到匹配案件',
          update_time_mm: '2026-11-23 10:01',
          cn_name: '张三'
        }
      ]
    })
    expect(detail).toEqual({
      total: 15,
      rows: [
        {
          id: 'd1',
          sn: 1,
          fileName: 'GA001.pdf',
          status: '上传失败',
          message: '找不到匹配案件',
          updateTime: '2026-11-23 10:01',
          uploader: '张三'
        }
      ]
    })

    const cfgData = normalizeNoticeInitData({
      noticeGfConfig: { PublishConfig: { cfg_value: '1' } },
      closeCaseConfig: { PublishConfig: { cfg_value: '0' } },
      closeCaseImportConfig: { PublishConfig: { cfg_value: '1' } },
      sgReduceConfig: { PublishConfig: { cfg_value: 'TRUE' } }
    })
    expect(cfgData.noticeGfEnabled).toBe(true)
    expect(cfgData.closeCaseRule).toBe('0')
    expect(cfgData.closeCaseImportNotice).toBe('1')
    expect(cfgData.sgReduceEnabled).toBe(true)
  })

  it('normalizes GetTreeUser personnel tree, keeps country parents, and allows parent selection on fileTypes', () => {
    const data = normalizeNoticeInitData({
      countries: {
        country: [
          { id: 'Asia', name: '亚洲', pid: '0' },
          { id: 'CN', name: '中国', pid: 'Asia' }
        ]
      },
      fileTypes: {
        FileType: [
          { id: 'cat-1', name: '审查意见', pid: '0', TreeType: 'Class' },
          { id: 'ft-1', name: '一通', pid: 'cat-1', TreeType: 'FileType' }
        ]
      },
      users: {
        TreeUser: [
          { id: 'dept-1', name: '专利流程部', pid: '0', TreeType: 'Dept' },
          { id: 'usr-1', name: '陈秋晓', pid: 'dept-1', TreeType: 'User' },
          { id: 'usr-1', name: '重复跳过', pid: 'dept-1', TreeType: 'User' }
        ]
      }
    })

    expect(data.countries).toEqual([
      { value: 'Asia', label: '亚洲', parent: '0' },
      { value: 'CN', label: '中国', parent: 'Asia' }
    ])
    expect(data.fileTypes.find(n => n.id === 'cat-1')?.selectable).toBeUndefined()
    expect(data.users).toEqual([
      { id: 'dept-1', name: '专利流程部', parentId: '0', selectable: false, treeType: 'Dept' },
      { id: 'usr-1', name: '陈秋晓', parentId: 'dept-1', treeType: 'User' }
    ])
  })

  it('normalizes LoadFileTypeByTypeID Types preserving order, case-insensitive pid links, and parent non-selectable', () => {
    const nodes = normalizeNoticeDetailFileTypes({
      Types: [
        { id: '81802CDE-D39D-4658-B45E-74631B0715C1', pid: '0', name: '官方来文' },
        { id: '8c44762d-44d5-4473-b4fc-b818373d6763', pid: '81802cde-d39d-4658-b45e-74631b0715c1', name: '国际检索单位书面意见(PCT/ISA/237)' },
        { id: 'A09080AE-EC39-4048-B882-D6D3A73B1CE9', pid: '81802CDE-D39D-4658-B45E-74631B0715C1', name: '发明专利申请公布通知书(签章)(210305CA)' },
        { id: '84F88F96-5BEB-491E-B8E9-8142704E1524', pid: '', name: '拒绝恢复优先权请求和/或提交声明或其他证据的通知(PCT/RO/158)' },
        { id: 'BS-1', pid: '0', name: '本所文件' },
        { id: 'BS-LEAF', pid: 'bs-1', name: '通知书副本' }
      ]
    })

    // notice.js 将 pid=='0' 且为「本所文件」置于首位，其余严格保留服务端返回顺序（无外层“专利”包裹）
    expect(nodes.map(n => n.name)).toEqual([
      '本所文件',
      '官方来文',
      '国际检索单位书面意见(PCT/ISA/237)',
      '发明专利申请公布通知书(签章)(210305CA)',
      '拒绝恢复优先权请求和/或提交声明或其他证据的通知(PCT/RO/158)',
      '通知书副本'
    ])
    expect(nodes[1]).toEqual({
      id: '81802CDE-D39D-4658-B45E-74631B0715C1',
      name: '官方来文',
      parentId: '',
      selectable: false
    })
    expect(nodes[2]).toEqual({
      id: '8c44762d-44d5-4473-b4fc-b818373d6763',
      name: '国际检索单位书面意见(PCT/ISA/237)',
      parentId: '81802CDE-D39D-4658-B45E-74631B0715C1'
    })
    expect(nodes[4]?.parentId).toBe('')
    expect(nodes[5]?.parentId).toBe('BS-1')
  })
})
