import type { Decision, Priority } from './arbitration'

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const value = (r: Record<string, unknown>, ...keys: string[]): string => { for (const k of keys) if (typeof r[k] === 'string' && r[k].trim()) return r[k].trim(); return '' }
const han = /\p{Script=Han}/u
export function sourceRows(source: string, call: string): Record<string, unknown>[] {
  const data: unknown = JSON.parse(source)
  if (!record(data) || !Array.isArray(data[call])) return []
  return data[call].flatMap(p => record(p) && Array.isArray(p.TableRows) ? p.TableRows.filter(record) : [])
}
const PROVINCES: Record<string, string> = { 广东: 'Guangdong', 北京: 'Beijing', 上海: 'Shanghai', 天津: 'Tianjin', 重庆: 'Chongqing', 浙江: 'Zhejiang', 江苏: 'Jiangsu', 福建: 'Fujian', 山东: 'Shandong', 河北: 'Hebei', 河南: 'Henan', 湖北: 'Hubei', 湖南: 'Hunan', 江西: 'Jiangxi', 安徽: 'Anhui', 四川: 'Sichuan', 贵州: 'Guizhou', 云南: 'Yunnan', 海南: 'Hainan', 山西: 'Shanxi', 陕西: 'Shaanxi', 甘肃: 'Gansu', 青海: 'Qinghai', 辽宁: 'Liaoning', 吉林: 'Jilin', 黑龙江: 'Heilongjiang', 广西: 'Guangxi', 内蒙古: 'Inner Mongolia', 宁夏: 'Ningxia', 西藏: 'Tibet', 新疆: 'Xinjiang', 香港: 'Hong Kong', 澳门: 'Macao', 台湾: 'Taiwan' }
const CITIES: Record<string, string> = { 深圳: 'Shenzhen', 广州: 'Guangzhou', 东莞: 'Dongguan', 佛山: 'Foshan', 珠海: 'Zhuhai', 中山: 'Zhongshan', 惠州: 'Huizhou', 杭州: 'Hangzhou', 宁波: 'Ningbo', 南京: 'Nanjing', 苏州: 'Suzhou', 成都: 'Chengdu', 武汉: 'Wuhan', 西安: 'Xi’an', 厦门: 'Xiamen', 福州: 'Fuzhou', 青岛: 'Qingdao', 大连: 'Dalian', ...PROVINCES }
function location(raw: string, english: string, candidate: string, address: string, names: Record<string, string>): string {
  if (english && !han.test(english)) return english
  if (raw && !han.test(raw)) return raw
  const known = names[raw.replace(/省|市|自治区|特别行政区/g, '')]
  if (known) return known
  // Unknown translations are accepted only when literally supported by the English address.
  return candidate && !han.test(candidate) && address.toLowerCase().includes(candidate.toLowerCase()) ? candidate : ''
}
function applicantCity(r: Record<string, unknown>, address: string, candidate = ''): string {
  const city = location(value(r, 'city'), value(r, 'city_en'), candidate, address, CITIES)
  if (city) return city
  const municipality = value(r, 'province').replace(/市$/, '')
  return ['北京', '上海', '天津', '重庆'].includes(municipality) ? PROVINCES[municipality] : ''
}
export function addressThroughDistrict(address: string, city: string): string {
  const areas = [...address.matchAll(/\b(?:District|County|Cooperation Zone|New Area)\b/gi)]
  const last = areas.at(-1)
  if (last?.index !== undefined) return address.slice(0, last.index + last[0].length).trim().replace(/[,;\s]+$/, '')
  const index = city ? address.toLowerCase().lastIndexOf(`, ${city.toLowerCase()}`) : -1
  return index >= 0 ? address.slice(0, index).trim().replace(/[,;\s]+$/, '') : address
}
export function validCnNumber(number: string): boolean {
  const n = number.toUpperCase().replace(/^CN/, '').replace('.', '')
  if (!/^\d{4}[12389]\d{7}[0-9X]$/.test(n)) return false
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
  const check = [...n.slice(0, 12)].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11
  return n[12] === (check === 10 ? 'X' : String(check))
}
/** User-authorized draft placeholder, retaining the original for mandatory human review. */
export function generateDraftPriority(priority: Priority, random = crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32): Priority {
  const year = /^\d{4}/.exec(priority.date)?.[0] ?? '2026'
  const digits = `${year}3${String(1 + Math.floor(Math.max(0, Math.min(random, 0.999999999)) * 9_999_999)).padStart(7, '0')}`
  const check = [...digits].reduce((sum, d, i) => sum + Number(d) * [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5][i], 0) % 11
  return { ...priority, number: `${digits}.${check === 10 ? 'X' : check}`, originalNumber: priority.originalNumber ?? priority.number, generated: true, requiresReview: true }
}
export function sourceRequirements(source: string): { parties: string[] | null; publicationMonths: number | null; remark: string; unrecognized: string[] } {
  const data: unknown = JSON.parse(source)
  const pages = record(data) && Array.isArray(data.GetCaseInfo) ? data.GetCaseInfo : []
  const rows = pages.flatMap(p => record(p) ? [p, ...[p.CaseInfo, p.TableRows].flatMap(v => Array.isArray(v) ? v.filter(record) : [])] : [])
  const remark = rows.map(r => value(r, 'remark', 'case_remark')).filter(Boolean).join('\n')
  const section = /(?:海牙(?:进入|指定)|指定缔约方|指定国家|指定地区)\s*[:：]?\s*([^；;\n]+)/i.exec(remark)?.[1]?.split(/\s+[A-Z]{2}\d|[，,、]?\s*(?:立即公开|公开(?:情况|时间)?\s*[:：])/)[0].trim()
  const aliases: [RegExp, string][] = [[/美国|\bUS\b/i, 'US'], [/欧盟|欧洲联盟|\b(?:EM|EU)\b/i, 'EM'], [/英国|\b(?:GB|UK)\b/i, 'GB'], [/日本|\bJP\b/i, 'JP'], [/加拿大|\bCA\b/i, 'CA'], [/韩国|\bKR\b/i, 'KR'], [/中国|\bCN\b/i, 'CN'], [/瑞士|\bCH\b/i, 'CH'], [/新加坡|\bSG\b/i, 'SG'], [/澳大利亚|\bAU\b/i, 'AU'], [/俄罗斯|\bRU\b/i, 'RU'], [/挪威|\bNO\b/i, 'NO'], [/土耳其|\bTR\b/i, 'TR']]
  aliases.push([/墨西哥|\bMX\b/i, 'MX'], [/越南|\bVN\b/i, 'VN'])
  aliases.push([/沙特(?:阿拉伯)?|\bSA\b/i, 'SA'])
  const parties = section ? aliases.filter(([pattern]) => pattern.test(section)).map(([, code]) => code) : null
  const months = /公开(?:情况|时间)?\s*[:：]?\s*(\d+)\s*个?月/.exec(remark)?.[1]
  const unrecognized = section ? section.split(/[、,，]|以及|和|及/).map(t => t.trim()).filter(t => t && !aliases.some(([pattern]) => pattern.test(t))) : []
  return { parties, publicationMonths: months === undefined ? (/(?:^|[\s，,；;。])立即公开(?:$|[\s，,；;。])|公开(?:情况|时间)?\s*[:：]?\s*立即公开/.test(remark) ? 0 : null) : Number(months), remark, unrecognized }
}
/** Semantic projection for arbitration. Database identifiers and personal contact metadata stay local. */
export function parsedHagueSource(source: string): unknown {
  const country = (r: Record<string, unknown>) => value(r, 'country_en', 'country_code', 'country_zh_cn', 'country')
  return {
    applicants: sourceRows(source, 'GetCaseApplicant').map(r => {
      const address = value(r, 'contact_address_en')
      const city = applicantCity(r, address)
      const region = location(value(r, 'province'), value(r, 'province_en'), '', address, PROVINCES)
      const rawCountry = country(r)
      return { name: value(r, 'applicant_name_en'), address: addressThroughDistrict(address, city), city, region, postalCode: value(r, 'postcode'), country: rawCountry === '中国' ? 'China' : rawCountry,
        unresolved: { ...(!city ? { city: value(r, 'city') } : {}), ...(!region ? { region: value(r, 'province') } : {}) } }
    }),
    creators: sourceRows(source, 'GetCaseInventor').map(r => {
      const name = value(r, 'inventor_name_en')
      const givenName = value(r, 'first_name_en', 'first_name_cn')
      const familyName = value(r, 'last_name_en')
      return { ...(givenName && familyName ? { givenName, familyName } : name ? { name } : { sourceName: value(r, 'inventor_name_cn'), needsEnglishName: true }), addressSource: 'applicants[0]' }
    }),
    priorities: sourceRows(source, 'GetCasePriority').map(r => ({ number: value(r, 'priority_no'), date: value(r, 'priority_date_dd', 'priority_date').slice(0, 10), country: value(r, 'priority_country_id'), das: value(r, 'access_code') })),
    requirements: (() => {
      const { parties, publicationMonths, remark, unrecognized } = sourceRequirements(source)
      const relevantRemark = remark.split(/[\n；;]/).filter(line => /海牙(?:进入|指定)|指定(?:缔约方|国家|地区)|公开/.test(line)).join('\n').replace(/\b[A-Z]{2}\d[A-Z\d-]*/g, '').replace(/[，,、\s]+(?=[，,、]|$)/g, '').trim()
      return { parties, publicationMonths, ...(unrecognized.length || parties === null || publicationMonths === null ? { sourceText: relevantRemark, unrecognized } : {}) }
    })()
  }
}
export function applySourceFields(result: Decision, source: string): Decision {
  // Revalidate program-owned fields after restoring their source values. Model warnings
  // about these fields may describe its discarded guesses rather than the actual data.
  result.warnings = result.warnings.filter(w => !/优先权|DAS|数据库序号|地址|省份|城市|申请人.*(?:name|city|region|address|postalCode|英文名称)/i.test(w))
  const applicants = sourceRows(source, 'GetCaseApplicant')
  const original = applicants[0]
  if (original) {
    const englishAddress = value(original, 'contact_address_en')
    const city = applicantCity(original, englishAddress, result.applicant.city)
    const region = location(value(original, 'province'), value(original, 'province_en'), result.applicant.region, englishAddress, PROVINCES)
    result.applicant = { ...result.applicant, name: value(original, 'applicant_name_en'), address: englishAddress && !han.test(englishAddress) ? addressThroughDistrict(englishAddress, city) : '', city, region, postalCode: value(original, 'postcode') }
    result.evidence.push('申请人英文名称、详细地址采用 GetCaseApplicant 的 applicant_name_en / contact_address_en 原文；城市和省份按独立 city / province 核对英文名称。')
    if (applicants.length > 1) result.warnings.push('本案有多个申请人，当前展示第一申请人，请核对其余申请人。')
  }
  for (const key of ['name', 'address', 'city', 'region'] as const) {
    if (han.test(result.applicant[key])) { result.applicant[key] = ''; result.warnings.push(`申请人 ${key} 不是英文，需补充英文值`) }
    if (!result.applicant[key]) result.warnings.push(`申请人 ${key} 缺少可靠英文值`)
  }
  if (!result.applicant.postalCode) result.warnings.push('申请人邮编缺失')
  result.creators = result.creators.map(c => ({ ...c, address: { ...result.applicant } }))
  result.evidence.push('所有设计人的详细地址、城市、省份、邮编和国家均复用第一申请人地址。')
  const requirements = sourceRequirements(source)
  if (requirements.parties?.length) {
    result.parties = requirements.parties
    result.warnings = result.warnings.filter(w => !/缔约方|指定国家/.test(w))
    result.evidence.push(`指定缔约方按案件备注明确清单校验：${requirements.parties.join(', ')}。`)
  } else if (requirements.parties) result.warnings.push('案件备注的指定地区未完整识别，请核对原始清单。')
  if (requirements.unrecognized.length) result.warnings.push(`指定缔约方有未识别项目：${requirements.unrecognized.join('、')}，请核对原始清单，不能遗漏。`)
  if (requirements.publicationMonths !== null && requirements.publicationMonths <= 30) {
    result.publicationMonths = requirements.publicationMonths
    result.warnings = result.warnings.filter(w => !/公开.*(?:缺失|没有|未读|未提供)/.test(w))
  }
  const raw = sourceRows(source, 'GetCasePriority')
  // These are explicit named API columns: never ask the model to infer them from IDs or seq.
  result.priorities = raw.map(r => ({ number: value(r, 'priority_no'), date: value(r, 'priority_date_dd', 'priority_date').slice(0, 10), country: value(r, 'priority_country_id'), das: value(r, 'access_code') }))
  result.evidence.push(`优先权直接读取 GetCasePriority 共 ${raw.length} 条：priority_no / priority_date_dd 或 priority_date / priority_country_id / access_code；priority_id 和 seq 不作申请号。`)
  for (const [i, p] of result.priorities.entries()) {
    if (p.country === 'CN' && !validCnNumber(p.number)) {
      const draft = generateDraftPriority(p)
      result.priorities[i] = draft
      result.warnings.push(`优先权 ${i + 1} 原始申请号 ${p.number || '空'} 不可用，已自动生成草稿占位号 ${draft.number}，需人工审核替换。`)
    } else if (!p.number) result.warnings.push(`优先权 ${i + 1} 申请号缺失，请核对。`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) result.warnings.push(`优先权 ${i + 1} 日期缺失或格式无效`)
    if (!/^[A-Z]{2}$/.test(p.country)) result.warnings.push(`优先权 ${i + 1} 国家代码缺失`)
    if (!p.das) result.warnings.push(`优先权 ${i + 1} DAS 接入码缺失`)
    else if (!/^[A-Za-z0-9]{4}$/.test(p.das)) result.warnings.push(`优先权 ${i + 1} DAS 接入码不符合四位格式；创建草稿时留空，需人工补充。原值仍保留。`)
  }
  result.warnings = [...new Set(result.warnings)]
  return result
}

