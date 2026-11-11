import { requestAssistantJob } from '../app/assistant-job'
import { applySourceFields, parsedHagueSource } from './source'
import type { Filing } from './materials'

export interface Applicant { name: string; address: string; city: string; region: string; postalCode: string; country: string }
export interface Priority { number: string; date: string; country: string; das: string; originalNumber?: string; generated?: boolean; requiresReview?: boolean }
export interface Decision { applicant: Applicant; creators: { givenName: string; familyName: string; address: Applicant }[]; parties: string[]; publicationMonths: number; priorities: Priority[]; warnings: string[]; evidence: string[] }
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const string = (x: unknown): string => typeof x === 'string' ? x.trim() : ''
export function parseDecision(text: string): Decision {
  let x: unknown
  try {
    const body = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    x = JSON.parse(body) as unknown
  } catch { throw new Error('Agent 回复不是有效 JSON，未采用回复内容') }
  if (record(x) && record(x.result)) x = x.result
  if (!record(x)) throw new Error('Agent 回复必须是 JSON 对象')
  const a = record(x.applicant) ? x.applicant : {}
  const applicant: Applicant = { name: string(a.name ?? a.name_en), address: string(a.address ?? a.address_en), city: string(a.city), region: string(a.region ?? a.province), postalCode: string(a.postalCode ?? a.postal_code ?? a.postcode), country: string(a.country ?? a.countryCode) }
  const warnings = Array.isArray(x.warnings) ? x.warnings.filter((w): w is string => typeof w === 'string') : []
  const creators = Array.isArray(x.creators) ? x.creators.filter(record).map(c => ({ givenName: string(c.givenName ?? c.given_name), familyName: string(c.familyName ?? c.family_name), address: { ...applicant } })) : []
  const parties = Array.isArray(x.parties) ? x.parties.filter((p): p is string => typeof p === 'string' && /^[A-Z]{2}$/.test(p)) : []
  if (!applicant.name && !creators.some(c => c.givenName || c.familyName) && !parties.length) throw new Error('Agent 回复缺少可识别的申请人、设计人和指定缔约方')
  let publicationMonths = Number(x.publicationMonths ?? x.publication_months)
  if (!Number.isInteger(publicationMonths) || publicationMonths < 0 || publicationMonths > 30) { publicationMonths = 0; warnings.push('公开时间缺失或无效，需核对案件备注') }
  const priorities = Array.isArray(x.priorities) ? x.priorities.filter(record).map(p => ({ number: string(p.number), date: string(p.date), country: string(p.country), das: string(p.das) })) : []
  const evidence = Array.isArray(x.evidence) ? x.evidence.filter((e): e is string => typeof e === 'string') : record(x.evidence) ? Object.entries(x.evidence).flatMap(([k, v]) => typeof v === 'string' ? [`${k}：${v}`] : []) : []
  for (const key of ['name', 'address', 'city', 'region', 'postalCode', 'country'] as const) if (!applicant[key]) warnings.push(`申请人缺少 ${key}`)
  if (!creators.length) warnings.push('缺少设计人')
  for (const c of creators) if (!c.givenName || !c.familyName) warnings.push('设计人姓或名缺失，请人工核对；未猜测拆分姓名。')
  if (!parties.length) warnings.push('缺少指定缔约方')
  if (!evidence.length) warnings.push('缺少字段来源')
  return { applicant, creators, parties, publicationMonths, priorities, warnings, evidence }
}
interface Pending { caseVolume: string; filing: Filing; source: string; signal?: AbortSignal; onStart?: () => void; resolve(value: Decision): void; reject(error: Error): void }
const pending: Pending[] = []
let running = false, timer: ReturnType<typeof setTimeout> | undefined, batchNumber = 0
export function compactHagueSource(source: string): unknown {
  const clean = (v: unknown): unknown => Array.isArray(v) ? v.map(clean) : record(v) ? Object.fromEntries(Object.entries(v).map(([k, value]) => [k, clean(value)]).filter(([, value]) => value !== '' && value !== null && value !== undefined && !(record(value) && !Object.keys(value).length))) : v
  return clean(parsedHagueSource(source))
}
export function hagueArbitrationMaterial(caseVolume: string, filing: Filing, source: string): unknown {
  return { caseVolume, parsed: compactHagueSource(source), ...(filing.issues.length ? { materialIssues: filing.issues } : {}) }
}
export function formatHagueMaterial(caseVolume: string, filing: Filing, source: string): string {
  const parsed = compactHagueSource(source)
  if (!record(parsed)) throw new Error('预解析材料无效')
  const lines = [`案件文号：${caseVolume}`]
  const labels: Record<string, string> = { name: '英文名称', address: '详细地址（到区）', city: '城市', region: '省份', postalCode: '邮编', country: '国家', givenName: '名', familyName: '姓', sourceName: '原文姓名', number: '在先申请号', date: '申请日期', das: 'DAS 接入码' }
  const fields = (r: Record<string, unknown>) => Object.entries(r).flatMap(([key, v]) => labels[key] && typeof v === 'string' ? [`  ${labels[key]}：${v}`] : [])
  for (const [key, title] of [['applicants', '申请人'], ['creators', '设计人'], ['priorities', '优先权']] as const) {
    const rows = Array.isArray(parsed[key]) ? parsed[key].filter(record) : []
    lines.push(`${title}：${rows.length ? '' : '无记录'}`)
    rows.forEach((r, i) => {
      lines.push(`第 ${i + 1} 位${title}`, ...fields(r))
      if (key === 'creators') lines.push('  地址：详细地址、城市、省份、邮编和国家均复用第一申请人')
      if (r.needsEnglishName) lines.push('  待核对：缺少英文姓名来源，需人工补充')
      if (record(r.unresolved)) lines.push(...Object.entries(r.unresolved).map(([k, v]) => `  待核对${labels[k] ?? k}：${String(v)}`))
    })
  }
  const requirements = record(parsed.requirements) ? parsed.requirements : {}
  lines.push(`指定缔约方：${Array.isArray(requirements.parties) ? requirements.parties.join('、') : '未识别，需核对'}`)
  lines.push(`公开时间：${requirements.publicationMonths === 0 ? '立即公开（0个月）' : typeof requirements.publicationMonths === 'number' ? `${requirements.publicationMonths}个月` : '未识别，需核对'}`)
  if (typeof requirements.sourceText === 'string') lines.push(`待核对备注：${requirements.sourceText}`)
  if (Array.isArray(requirements.unrecognized) && requirements.unrecognized.length) lines.push(`未识别地区：${requirements.unrecognized.join('、')}`)
  if (filing.issues.length) lines.push(`材料问题：${filing.issues.join('；')}`)
  return lines.join('\n')
}
export function takeHagueBatch(queue: Pending[]): Pending[] {
  const batch: Pending[] = []; let length = 0
  while (queue.length && batch.length < 3) {
    const next = queue[0]
    const size = formatHagueMaterial(next.caseVolume, next.filing, next.source).length
    if (size > 90000) { queue.shift(); next.reject(new Error('本案材料超过助手单轮容量，请缩小材料范围后重试。')); continue }
    if (batch.length && length + size > 20000) break
    batch.push(queue.shift()!); length += size
  }
  return batch
}
async function drain(): Promise<void> {
  if (running) return
  running = true
  try {
    while (pending.length) {
      const batch = takeHagueBatch(pending).filter(p => !p.signal?.aborted)
      if (!batch.length) continue
      const controller = new AbortController()
      const abort = () => { if (batch.every(p => p.signal?.aborted)) controller.abort() }
      batch.forEach(p => p.signal?.addEventListener('abort', abort))
      try {
        const materials = batch.map(p => formatHagueMaterial(p.caseVolume, p.filing, p.source)).join('\n\n—— 下一案件 ——\n\n')
        let lastError: unknown
        for (let attempt = 0; attempt < 2; attempt++) {
          const reply = await requestAssistantJob(`请核对以下本地预解析结果。已确定字段保持来源值，仅处理缺失、冲突和未识别项；缺少英文姓名来源时提示人工补充，禁止编造。按海牙技能约定返回逐案 JSON。${attempt ? '上一批回复格式有误，请按海牙技能约定输出 JSON，必须逐案返回。' : ''}\n材料：\n${materials}`, `海牙材料仲裁 · 第 ${++batchNumber} 批 · ${batch.length} 案`, controller.signal, () => batch.forEach(p => { if (!p.signal?.aborted) p.onStart?.() }))
          try {
            const body = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
            const parsed: unknown = JSON.parse(body)
            if (!record(parsed) || !Array.isArray(parsed.results)) throw new Error('助手未返回 results 案件列表')
            const results: unknown[] = parsed.results
            const outcomes = batch.map(p => {
              const matches = results.filter(r => record(r) && typeof r.caseVolume === 'string' && r.caseVolume.replace(/\s/g, '').toUpperCase() === p.caseVolume.replace(/\s/g, '').toUpperCase())
              if (matches.length !== 1 || !record(matches[0])) return { p, error: new Error(`助手未唯一返回文号 ${p.caseVolume} 的结果`) }
              try { return { p, value: applySourceFields(parseDecision(JSON.stringify(matches[0].decision)), p.source) } } catch (error) { return { p, error: error instanceof Error ? error : new Error('结果格式无效') } }
            })
            for (const result of outcomes) if (!result.p.signal?.aborted) { if (result.value) result.p.resolve(result.value); else result.p.reject(result.error) }
            lastError = undefined; break
          } catch (error) { lastError = error }
        }
        if (lastError) throw lastError instanceof Error ? lastError : new Error('助手回复格式无效')
      } catch (error) {
        const failure = error instanceof Error ? error : new Error('AI 助手仲裁失败')
        batch.forEach(p => { if (!p.signal?.aborted) p.reject(failure) })
        if (/已停下|队列已清空|助手已关闭/.test(failure.message)) { pending.splice(0).forEach(p => p.reject(failure)); break }
      }
      finally { batch.forEach(p => p.signal?.removeEventListener('abort', abort)) }
    }
  } finally { running = false }
}
export function arbitrate(caseVolume: string, filing: Filing, source: string, signal?: AbortSignal, onStart?: () => void): Promise<Decision> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('已停止')); return }
    const abort = () => { reject(new Error('已停止')); signal?.removeEventListener('abort', abort) }
    signal?.addEventListener('abort', abort, { once: true })
    const finish = () => signal?.removeEventListener('abort', abort)
    pending.push({ caseVolume, filing, source, signal, onStart, resolve: value => { finish(); resolve(value) }, reject: error => { finish(); reject(error) } })
    if (!timer) timer = setTimeout(() => { timer = undefined; void drain() }, 100)
  })
}
