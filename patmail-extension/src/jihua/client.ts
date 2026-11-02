import { attachmentFieldsForType, normalizeApplicationNo } from './materials'
import type { Attachment, Detail, JihuaTransport, PatentType, TargetRecord, UploadReceipt } from './types'

export class JihuaError extends Error {
  constructor(message: string, readonly kind: 'session' | 'unmatched' | 'invalid' | 'unknown' = 'invalid') {
    super(message)
    this.name = 'JihuaError'
  }
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new JihuaError('平台返回的数据结构无效，未继续写入。')
  return value as Record<string, unknown>
}
export function envelope(value: unknown): Record<string, unknown> {
  const body = object(value)
  if (Number(body.code) !== 200) {
    const msg = typeof body.msg === 'string' ? body.msg.slice(0, 500) : '平台没有确认业务成功。'
    throw new JihuaError(msg, Number(body.code) === 401 || Number(body.code) === 403 ? 'session' : 'invalid')
  }
  return body
}
function attachments(value: unknown): Attachment[] {
  if (!Array.isArray(value)) throw new JihuaError('平台附件列表格式无效，未覆盖原有附件。')
  return value.map(item => {
    const obj = object(item)
    if (typeof obj.ID !== 'string' || !obj.ID.trim()) throw new JihuaError('平台附件缺少有效 ID，未继续关联。')
    return { ...obj, ID: obj.ID }
  })
}
export function parseUploadReceipt(value: unknown, ofc: boolean): UploadReceipt {
  const body = envelope(value)
  const data = ofc ? object(body.data) : undefined
  const list = attachments(data ? data.appendixList : body.data)
  if (!list.length) throw new JihuaError('上传响应没有附件 ID，结果未确认。', 'unknown')
  if (!ofc) return { attachments: list }
  const recognized = data?.IS_OFC_SUCCESS === true || data?.IS_OFC_SUCCESS === 'TRUE' || data?.IS_OFC_SUCCESS === 1 || data?.IS_OFC_SUCCESS === 'true'
  return { attachments: list, ofcRecognized: recognized,
    ...(!recognized ? { warning: '附件已上传，官文识别未成功；本流程仅关联附件，请在平台检查识别字段。' } : {}) }
}

/** Keep the latest full form and every attachment category, including future/unrendered fields. */
export function buildUpdate(detail: Detail, type: PatentType, additions: Record<string, Attachment[]>): Record<string, unknown> {
  const body: Record<string, unknown> = { patentParameter: { ...detail.form } }
  const keys = new Set([...attachmentFieldsForType(type), ...Object.keys(detail.attachments), ...Object.keys(additions)])
  for (const key of keys) {
    if (!/^[a-zA-Z][a-zA-Z0-9]*AppendixList$/.test(key)) throw new JihuaError('附件关联字段无效。')
    const all = [...(detail.attachments[key] ?? []), ...(additions[key] ?? [])]
    body[key] = [...new Set(all.map(item => item.ID))]
  }
  return body
}

export class JihuaClient {
  constructor(readonly transport: JihuaTransport) {}

  async findUnique(input: string): Promise<TargetRecord> {
    const applicationNo = normalizeApplicationNo(input)
    if (!/^\d{12}[\dX]$/.test(applicationNo)) throw new JihuaError('目前自动传文支持 13 位中国专利申请号；该申请号格式未匹配。', 'unmatched')
    const kind = applicationNo[4]
    const type: PatentType = kind === '1' ? 'INVENTION' : 'UTILITY'
    if (kind !== '1' && kind !== '2') throw new JihuaError('目前只支持已核对接口的发明、实用新型台账；该申请号类型未匹配。', 'unmatched')
    const exact = new Map<string, TargetRecord>()
    let fetched = 0
    for (let pageNum = 1; pageNum <= 1000; pageNum++) {
      const params = new URLSearchParams({ pageNum: String(pageNum), pageSize: '100', PATENT_NUM: applicationNo })
      const body = envelope(await this.transport.request(`/conow/pat/parameter/${type}?${params}`))
      if (!Array.isArray(body.rows)) throw new JihuaError('平台查询没有返回有效 rows 列表。')
      const total = Number(body.total)
      if (!Number.isSafeInteger(total) || total < 0) throw new JihuaError('平台查询总数无效，无法确认唯一案件。')
      for (const value of body.rows) {
        const row = object(value)
        if (typeof row.PATENT_NO !== 'string' || normalizeApplicationNo(row.PATENT_NO) !== applicationNo) continue
        if (typeof row.ID !== 'string' || !row.ID.trim()) throw new JihuaError('匹配的案件缺少 ID。')
        exact.set(row.ID, { id: row.ID, type, applicationNo, name: typeof row.PATENT_NAME === 'string' ? row.PATENT_NAME : '' })
      }
      fetched += body.rows.length
      if (fetched >= total) {
        if (!exact.size) throw new JihuaError('没有匹配到该申请号的台账。', 'unmatched')
        if (exact.size !== 1) throw new JihuaError('平台存在多条相同申请号的台账，请人工核实。', 'unmatched')
        return [...exact.values()][0]
      }
      if (!body.rows.length) throw new JihuaError('平台分页提前结束，无法确认唯一案件。')
    }
    throw new JihuaError('平台查询超过分页上限，无法确认唯一案件。')
  }

  async detail(record: TargetRecord): Promise<Detail> {
    const body = envelope(await this.transport.request(`/conow/pat/parameter/${record.type}/${encodeURIComponent(record.id)}`))
    const data = object(body.data)
    const form = object(data.patentParameter)
    if (form.ID !== record.id || typeof form.PATENT_NO !== 'string' || normalizeApplicationNo(form.PATENT_NO) !== record.applicationNo) {
      throw new JihuaError('平台详情的案件 ID 或申请号与查询结果不一致，已停止上传。')
    }
    const lists: Record<string, Attachment[]> = {}
    const keys = new Set([...attachmentFieldsForType(record.type), ...Object.keys(data).filter(key => key.endsWith('AppendixListObj')).map(key => key.slice(0, -3)),
      ...Object.keys(form).filter(key => key.endsWith('AppendixListObj')).map(key => key.slice(0, -3))])
    for (const key of keys) {
      const list = data[`${key}Obj`] ?? form[`${key}Obj`]
      lists[key] = list == null ? [] : attachments(list)
    }
    return { form: { ...form }, attachments: lists }
  }

  async update(record: TargetRecord, detail: Detail, additions: Record<string, Attachment[]>, requestId: string): Promise<void> {
    envelope(await this.transport.request('/conow/pat/parameter/patent/update', 'POST', buildUpdate(detail, record.type, additions), requestId))
  }
}
