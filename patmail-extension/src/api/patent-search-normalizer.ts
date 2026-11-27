import type { TreeOption } from '../query/option-tree'
import { isRecord } from './response-guards'
import { apiError, type ApiResult } from './types'
import { PATENT_CASE_TYPE_ID } from './patent-form'
import type { PatentOptionItem, PatentSearchQuery, PatentSearchResult, PatentSearchRow } from './patent-search-types'

function cleanText(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function sameGuid(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

function arr(obj: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const raw = obj[key]
  return Array.isArray(raw) ? raw.filter(isRecord) : []
}

function toTreeOptions(
  rows: Record<string, unknown>[],
  valueKey: string,
  labelKeys: string | string[],
  parentKey = 'parent_id'
): TreeOption[] {
  const keys = Array.isArray(labelKeys) ? labelKeys : [labelKeys]
  return rows
    .map(row => {
      const value = cleanText(row[valueKey] ?? row.id ?? row.value)
      let label = ''
      for (const k of keys) {
        label = cleanText(row[k])
        if (label) break
      }
      if (!label) label = cleanText(row.text_zh_cn ?? row.name ?? row.label)
      if (!value || !label) return null
      const parent = cleanText(row[parentKey] ?? row.pid ?? row.pId)
      const selectable = cleanText(row.TreeType).toLowerCase() !== 'dept' || valueKey !== 'id'
      return {
        value,
        label,
        ...(parent && parent !== '0' && parent !== '-1' ? { parent } : {}),
        ...(selectable ? {} : { selectable: false })
      }
    })
    .filter((x): x is TreeOption => x !== null)
}

function toSelectOptions(rows: Record<string, unknown>[], valueKey: string, labelKey: string): PatentOptionItem[] {
  return rows
    .map(row => {
      const value = cleanText(row[valueKey] ?? row.id)
      const label = cleanText(row[labelKey] ?? row.name)
      return value && label ? { value, label } : null
    })
    .filter((x): x is PatentOptionItem => x !== null)
}

export interface PatentBasicDicts {
  caseTypeId: string
  countries: TreeOption[]
  applyTypes: TreeOption[]
  bussTypes: TreeOption[]
  caseStatuses: TreeOption[]
  ctrlProcs: TreeOption[]
  procStatuses: TreeOption[]
  caseDirections: TreeOption[]
  customerStatuses: TreeOption[]
  applyTags: TreeOption[]
  reviewStages: TreeOption[]
  technicals: TreeOption[]
  products: TreeOption[]
  caseCoefficients: PatentOptionItem[]
  customerFroms: PatentOptionItem[]
  fromStages: TreeOption[]
  generationStatuses: PatentOptionItem[]
  protectionCenters: PatentOptionItem[]
  applicantTypes: PatentOptionItem[]
  sourceTypes: PatentOptionItem[]
  customerClasses: PatentOptionItem[]
  relateTypes: TreeOption[]
}

/** 对齐 ICSearch.js ChangeCaseType / Initalization 口径归一化 IPGetBasicData 字典。 */
export function normalizePatentBasicDicts(rawBody: unknown, fallbackCaseTypeId = PATENT_CASE_TYPE_ID): PatentBasicDicts {
  const body = isRecord(rawBody) ? rawBody : {}
  const patentCaseType = arr(body, 'CaseType').find(row => cleanText(row.case_type_code) === 'P')
  const caseTypeId = cleanText(patentCaseType?.case_type_id) || fallbackCaseTypeId

  return {
    caseTypeId,
    countries: toTreeOptions(arr(body, 'Country'), 'value', 'text_zh_cn'),
    applyTypes: toTreeOptions(
      arr(body, 'ApplyType').filter(r => !cleanText(r.case_type_id) || sameGuid(cleanText(r.case_type_id), caseTypeId)),
      'apply_type_id',
      'apply_type'
    ),
    bussTypes: toTreeOptions(
      arr(body, 'BussType').filter(r => !cleanText(r.case_type_id) || sameGuid(cleanText(r.case_type_id), caseTypeId)),
      'business_type_id',
      ['bussType', 'business_type']
    ),
    caseStatuses: toTreeOptions(
      arr(body, 'CaseStatus').filter(r => {
        const sc = cleanText(r.status_class).toUpperCase()
        return sameGuid(cleanText(r.case_type_id), caseTypeId) && (sc === 'ALL' || sc === 'CASE')
      }),
      'case_status_id',
      'case_status'
    ),
    ctrlProcs: toTreeOptions(
      arr(body, 'CtrlProc').filter(r => !cleanText(r.case_type_id) || sameGuid(cleanText(r.case_type_id), caseTypeId)),
      'ctrl_proc_id',
      'ctrl_proc'
    ),
    procStatuses: toTreeOptions(arr(body, 'ProcStatus'), 'proc_status_id', 'proc_status'),
    caseDirections: toTreeOptions(arr(body, 'Case_direction'), 'value', 'text_zh_cn'),
    customerStatuses: toTreeOptions(
      arr(body, 'customer_status').filter(r => !cleanText(r.case_type_id) || sameGuid(cleanText(r.case_type_id), caseTypeId)),
      'customer_status_id',
      'customer_status'
    ),
    applyTags: toTreeOptions(arr(body, 'ApplyTags'), 'id', 'name'),
    reviewStages: toTreeOptions(arr(body, 'ReviewStage'), 'id', 'name'),
    technicals: toTreeOptions(arr(body, 'Technical'), 'id', 'value'),
    products: toTreeOptions(arr(body, 'Products'), 'id', 'value'),
    caseCoefficients: toSelectOptions(arr(body, 'case_coefficient'), 'id', 'name'),
    customerFroms: toSelectOptions(
      arr(body, 'customerfrom').length ? arr(body, 'customerfrom') : arr(body, 'CustomerFrom'),
      'value',
      'text_zh_cn'
    ),
    fromStages: toTreeOptions(arr(body, 'from_stage'), 'value', 'text_zh_cn'),
    generationStatuses: toSelectOptions(arr(body, 'generation_status'), 'id', 'text_zh_cn'),
    protectionCenters: toSelectOptions(arr(body, 'ProtectionCenter'), 'id', 'name'),
    applicantTypes: toSelectOptions(arr(body, 'ApplicantType'), 'value', 'text_zh_cn'),
    sourceTypes: toSelectOptions(arr(body, 'sourcetype'), 'value', 'text_zh_cn'),
    customerClasses: toSelectOptions(arr(body, 'customerclass'), 'id', 'cus_class_name'),
    relateTypes: toTreeOptions(arr(body, 'RelateType'), 'value', 'text_zh_cn')
  }
}

function parseTotal(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value.trim())
  return NaN
}

export function normalizePatentSearch(raw: unknown, query: PatentSearchQuery): ApiResult<PatentSearchResult> {
  if (!isRecord(raw)) {
    return apiError('INVALID_RESPONSE', '专利查询返回了未知格式的数据。')
  }

  const clientInfo = isRecord(raw.ClientInfo) ? raw.ClientInfo : null
  if (clientInfo && clientInfo.Status === false) {
    if (clientInfo.IsLogin === false) {
      return apiError('SESSION_EXPIRED', '请先在 EASY 原网站登录并检测登录状态。')
    }
    return apiError('BUSINESS_ERROR', cleanText(clientInfo.Message) || '专利查询失败，请稍后重试。')
  }

  let rawRows: unknown = Object.hasOwn(raw, 'TableRows') ? raw.TableRows : raw.rows
  if (typeof rawRows === 'string') {
    try {
      rawRows = JSON.parse(rawRows)
    } catch {
      return apiError('INVALID_RESPONSE', '专利查询结果格式无效。')
    }
  }
  const total = parseTotal(raw.TableRowsCount ?? raw.total)
  if ((rawRows === null || rawRows === undefined) && total === 0) rawRows = []

  if (!Array.isArray(rawRows) || !Number.isSafeInteger(total) || total < 0) {
    return apiError('INVALID_RESPONSE', '专利查询返回的列表或总条数无效。')
  }

  const rows: PatentSearchRow[] = rawRows.map(item => {
    const rec = isRecord(item) ? item : {}
    const rawMap: Record<string, string> = {}
    for (const [k, v] of Object.entries(rec)) {
      const text = cleanText(v)
      if (text) rawMap[k] = text
    }
    return {
      caseId: cleanText(rec.case_id),
      procId: cleanText(rec.proc_id),
      caseTypeId: cleanText(rec.case_type_id),
      caseVolume: cleanText(rec.case_volume),
      caseVolumeCustomer: cleanText(rec.case_volume_customer),
      caseName: cleanText(rec.case_name),
      applyName: cleanText(rec.apply_name),
      applicants: cleanText(rec.applicants),
      picCase: cleanText(rec.pic_case),
      foreignPicCase: cleanText(rec.foreign_pic_case),
      appNo: cleanText(rec.app_no),
      appDate: cleanText(rec.app_date),
      applyType: cleanText(rec.apply_type),
      caseStatus: cleanText(rec.case_status),
      countryName: cleanText(rec.country_name),
      pctAppNo: cleanText(rec.pct_app_no),
      pctAppDate: cleanText(rec.pct_app_date),
      ctrlProc: cleanText(rec.ctrl_proc),
      picProc: cleanText(rec.pic_proc),
      procStatus: cleanText(rec.proc_status),
      legalDueDate: cleanText(rec.legal_due_date),
      cusDueDate: cleanText(rec.cus_due_date),
      intDueDate: cleanText(rec.int_due_date),
      procNote: cleanText(rec.proc_note),
      stateIntoDate: cleanText(rec.state_into_date),
      mentor: cleanText(rec.mentor),
      translate: cleanText(rec.translate),
      proofread: cleanText(rec.proofread),
      backInventorDate: cleanText(rec.back_inventor_date),
      translateCount: cleanText(rec.translate_count),
      raw: rawMap
    }
  })

  const totalPages = total === 0 ? 0 : Math.ceil(total / query.pageSize)
  return {
    ok: true,
    data: {
      rows,
      total,
      pageIndex: query.pageIndex,
      pageSize: query.pageSize,
      totalPages
    }
  }
}
