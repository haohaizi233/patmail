import { describe, expect, it } from 'vitest'
import {
  NOTICE_DEFAULT_EXPORT_COLUMNS,
  NOTICE_IMPORT_COMPLETED_COLUMNS,
  NOTICE_TABLE_COLUMNS,
  noticeCellRaw
} from '../../../src/api/notice-params'

const EXPECTED_IMPORT_KEYS = [
  'oa_name',
  'file_desc_code',
  'FaWenRQ',
  'customer_name',
  'assayer',
  'ShenQingH',
  'case_volume',
  'case_name',
  'case_status',
  'applicant_name',
  'pic',
  'sales_user',
  'remark'
] as const

const REMOVED_IMPORT_KEYS = [
  'sn',
  'issue_no',
  'issue_date',
  'certificate_no',
  'customer_status',
  'contract_no',
  'sales_help',
  'introducer',
  'app_date',
  'apply_tags',
  'oa_error_msg',
  'is_speed_checkd',
  'hearing_the_case'
] as const

describe('notice table columns & field aliases', () => {
  it('import 列顺序与约定一致且移除 13 个无用列', () => {
    const keys = NOTICE_TABLE_COLUMNS.import.map(col => col.key)
    expect(keys).toEqual(EXPECTED_IMPORT_KEYS)
    for (const removed of REMOVED_IMPORT_KEYS) {
      expect(keys).not.toContain(removed)
    }
  })

  it('download 列不包含下载时间与备注', () => {
    const keys = NOTICE_TABLE_COLUMNS.download.map(col => col.key)
    expect(keys).not.toContain('download_time')
    expect(keys).not.toContain('remark')
  })

  it('replay 页面列移除序号/账号/备注且 famingczmc 表头为案件名称，同时保留原站导出栏位', () => {
    const keys = NOTICE_TABLE_COLUMNS.replay.map(col => col.key)
    expect(keys).toEqual([
      'tongzhismc',
      'fawenxlh',
      'dianzifwrq',
      'cnApplicationnumber',
      'famingczmc',
      'status'
    ])
    expect(keys).not.toContain('sn')
    expect(keys).not.toContain('account')
    expect(keys).not.toContain('remark')
    expect(NOTICE_TABLE_COLUMNS.replay.find(col => col.key === 'famingczmc')?.label).toBe('案件名称')
    expect(NOTICE_DEFAULT_EXPORT_COLUMNS.replay.find(col => col.value === 'famingczmc')?.text).toBe('发明创造名称')
    expect(NOTICE_DEFAULT_EXPORT_COLUMNS.replay.some(col => col.value === 'account')).toBe(true)
  })

  it('hand 异常来文列移除序号且首列为 oa_name', () => {
    const keys = NOTICE_TABLE_COLUMNS.hand.map(col => col.key)
    expect(keys).not.toContain('sn')
    expect(keys[0]).toBe('oa_name')
  })

  it('handExcel 电子申请清单对比列移除序号', () => {
    const keys = NOTICE_TABLE_COLUMNS.handExcel.map(col => col.key)
    expect(keys).not.toContain('sn')
    expect(keys[0]).toBe('app_no')
  })

  it('import 与 completed 每列均配置显式 width，避免 fixed 布局被压成 0px', () => {
    for (const col of NOTICE_TABLE_COLUMNS.import) {
      expect(col.width).toBeTruthy()
      expect(Number.parseInt(col.width ?? '0', 10)).toBeGreaterThan(0)
    }
    for (const col of NOTICE_IMPORT_COMPLETED_COLUMNS) {
      expect(col.width).toBeTruthy()
      expect(Number.parseInt(col.width ?? '0', 10)).toBeGreaterThan(0)
    }
  })

  it('noticeCellRaw 在 import tab 支持别名回退并优先使用主字段', () => {
    expect(noticeCellRaw('import', { applicant_name_cn: 'X' }, 'applicant_name')).toBe('X')
    expect(noticeCellRaw('import', { first_applicant_name: 'FirstCorp' }, 'applicant_name')).toBe('FirstCorp')
    expect(noticeCellRaw('import', { applicant_name: 'Main', applicant_name_cn: 'X' }, 'applicant_name')).toBe('Main')
    expect(noticeCellRaw('import', { applicant_name: '   ', applicant_name_cn: 'Fallback' }, 'applicant_name')).toBe('Fallback')

    expect(noticeCellRaw('import', { FaMingMC: 'Y' }, 'case_name')).toBe('Y')
    expect(noticeCellRaw('import', { case_name: 'PrimaryCase', FaMingMC: 'Y' }, 'case_name')).toBe('PrimaryCase')

    expect(noticeCellRaw('import', { case_status_zh_cn: '实质审查' }, 'case_status')).toBe('实质审查')
  })

  it('noticeCellRaw 对非 import tab 原样返回 row[key]', () => {
    expect(noticeCellRaw('download', { applicant_name_cn: 'X' }, 'applicant_name')).toBeUndefined()
    expect(noticeCellRaw('cert', { FaMingMC: 'Y', case_name: 'Direct' }, 'case_name')).toBe('Direct')
    expect(noticeCellRaw('cert', { FaMingMC: 'Y' }, 'case_name')).toBeUndefined()
  })
})
