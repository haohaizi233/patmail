import type { Decision, Priority } from './arbitration'

const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const value = (r: Record<string, unknown>, ...keys: string[]): string => { for (const k of keys) if (typeof r[k] === 'string' && r[k].trim()) return r[k].trim(); return '' }
const han = /\p{Script=Han}/u
const english = (s:string) => !han.test(s)&&/[A-Za-z]/.test(s)?s:''
const applicantName=(r:Record<string,unknown>)=>english(value(r,'applicant_name_en'))||english(value(r,'applicant_name_cn'))
export function sourceCountry(raw:string):string {
  const names:Record<string,string>={中国:'CN',China:'CN',新加坡:'SG',Singapore:'SG',美国:'US','United States':'US',英国:'GB','United Kingdom':'GB',日本:'JP',Japan:'JP',加拿大:'CA',Canada:'CA',韩国:'KR','Republic of Korea':'KR',法国:'FR',France:'FR'}
  const text=raw.trim()
  return Object.entries(names).find(([name])=>name.toLowerCase()===text.toLowerCase())?.[1]??(/^[A-Z]{2}(?=\s*(?:[-–—(]|$))/i.exec(text)?.[0].toUpperCase())??''
}
function applicantCountry(r:Record<string,unknown>):string{return ['country_code','country_en','country_zh_cn','country'].map(k=>sourceCountry(value(r,k))).find(Boolean)??addressCountry(value(r,'contact_address_en'))}
function addressCountry(address:string):string {
  const tail=/(?:^|[,\s])(China|Singapore|United States|United Kingdom|Japan|Canada|Republic of Korea|France)\s*(?:\d{5,6})?\s*$/i.exec(address)
  return tail?sourceCountry(tail[1]):''
}
export function validSourcePostalCode(postalCode:string,country:string):boolean {
  return !/^0+$/.test(postalCode)&&(/^(?:CN|SG)$/.test(sourceCountry(country))?/^\d{6}$/.test(postalCode):/^(?=.*\d)[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/.test(postalCode))
}
/** Recover only explicit source values. Never turn a city into a guessed postcode/country. */
function applicantContact(r:Record<string,unknown>) {
  const address=value(r,'contact_address_en'),country=applicantCountry(r)
  const countries=['country_code','country_en','country_zh_cn','country'].map(k=>sourceCountry(value(r,k))).filter(Boolean)
  const fromAddress=addressCountry(address)
  const notes:string[]=[],evidence:string[]=[]
  if(new Set([...countries,fromAddress].filter(Boolean)).size>1)notes.push('国家字段与其他来源字段或英文地址存在冲突，保留首个来源国家，需人工核对。')
  const raw=value(r,'postcode')
  const valid=(s:string)=>validSourcePostalCode(s,country)
  const explicit=valid(raw)?raw:''
  // Only a standalone six-digit token at the address tail (possibly before the country).
  const postalMatch=/(?:^|[\s,])([0-9]{6})\s*(?:,?\s*(?:China|Singapore))?\s*$/i.exec(address)
  const looksLikeBuilding=postalMatch&&/\b(?:No\.?|Building|Room|Unit|Suite|Block|Road|Street)\s*$/i.test(address.slice(0,postalMatch.index))
  const addressPostal=looksLikeBuilding?'':postalMatch?.[1]??''
  const recovered=/^(?:CN|SG)$/.test(country)&&valid(addressPostal)?addressPostal:''
  const postalCode=explicit||recovered
  if(explicit&&recovered&&explicit!==recovered)notes.push('邮编字段与英文地址中的邮编存在冲突，保留邮编字段原值，需人工核对。')
  if(!explicit&&recovered)evidence.push('邮编字段不可用，采用本案完整英文地址中明确写出的邮编；未按城市推测。')
  if(!countries.length&&fromAddress)evidence.push('国家字段缺失，采用本案英文地址末尾明确写出的国家。')
  return {country,postalCode,notes,evidence,unresolved:{...(!postalCode?{postalCode:`${raw||'未提供'}（缺失或无效；不得按城市猜测）`}:{}),...(!country?{country:value(r,'country_code','country_en','country_zh_cn','country')||'未提供'}:{})}}
}
function creatorName(r:Record<string,unknown>):{givenName:string;familyName:string} {
  const givenName=english(value(r,'first_name_en'))||english(value(r,'first_name_cn'))
  const familyName=english(value(r,'last_name_en'))
  if(givenName&&familyName)return {givenName,familyName}
  const full=english(value(r,'inventor_name_en'))
  // Uppercase surname is explicit typography in these source records; all-uppercase names remain ambiguous.
  const tail=/^(.+\p{Ll}.*?)\s+([A-Z][A-Z'-]+)$/u.exec(full)
  return tail?{givenName:tail[1].trim(),familyName:tail[2]}:{givenName,familyName}
}
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
  if(['北京', '上海', '天津', '重庆'].includes(municipality))return PROVINCES[municipality]
  if(applicantCountry(r)==='SG'&&/\bSINGAPORE\b/i.test(address))return 'Singapore'
  const region=location(value(r,'province'),value(r,'province_en'),'',address,PROVINCES)
  const segments=address.split(/[,，]/).map(s=>s.trim())
  const at=region?segments.findIndex(s=>s.toLowerCase()===region.toLowerCase()):-1
  return at>0&&/^[A-Za-z][A-Za-z' -]*$/.test(segments[at-1])?segments[at-1]:''
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
export function sourceRequirements(source: string): { parties: string[] | null; publicationMonths: number | null; remark: string; unrecognized: string[]; reviewNotes:string[] } {
  const data: unknown = JSON.parse(source)
  const pages = record(data) && Array.isArray(data.GetCaseInfo) ? data.GetCaseInfo : []
  const rows = pages.flatMap(p => record(p) ? [p, ...[p.CaseInfo, p.TableRows].flatMap(v => Array.isArray(v) ? v.filter(record) : [])] : [])
  const remark = rows.map(r => value(r, 'remark', 'case_remark')).filter(Boolean).join('\n')
  const sections = [...remark.matchAll(/(?:海牙(?:进入|指定)|指定缔约方|指定国家|指定地区|申请国家(?:为|是)?|申请地区(?:为|是)?)\s*[:：]?\s*([^；;\n。]+)/gi)].map(m=>m[1].split(/\s+[A-Z]{2}\d|[，,、]?\s*(?:立即公开|公开(?:情况|时间|方式)?\s*[:：])/)[0].trim()).filter(Boolean)
  const aliases: [RegExp, string][] = [[/美国|\bUS\b/i, 'US'], [/欧盟|欧洲联盟|\b(?:EM|EU)\b/i, 'EM'], [/英国|\b(?:GB|UK)\b/i, 'GB'], [/日本|\bJP\b/i, 'JP'], [/加拿大|\bCA\b/i, 'CA'], [/韩国|\bKR\b/i, 'KR'], [/中国|\bCN\b/i, 'CN'], [/瑞士|\bCH\b/i, 'CH'], [/新加坡|\bSG\b/i, 'SG'], [/澳大利亚|\bAU\b/i, 'AU'], [/俄罗斯|\bRU\b/i, 'RU'], [/挪威|\bNO\b/i, 'NO'], [/土耳其|\bTR\b/i, 'TR']]
  aliases.push([/墨西哥|\bMX\b/i, 'MX'], [/越南|\bVN\b/i, 'VN'])
  aliases.push([/沙特(?:阿拉伯)?|\bSA\b/i, 'SA'])
  aliases.push([/巴西|\bBR\b/i,'BR'])
  const countryText=sections.map(s=>s.replace(/\([^()]*\)|（[^（）]*）/g,'')).join('、')
  const sets=sections.map(s=>aliases.filter(([pattern])=>pattern.test(s.replace(/\([^()]*\)|（[^（）]*）/g,''))).map(([,code])=>code))
  const designationConflict=new Set(sets.map(s=>s.join(','))).size>1
  const parties = designationConflict?null:countryText ? aliases.filter(([pattern]) => pattern.test(countryText)).map(([, code]) => code) : null
  let residue=countryText??''
  for(const [pattern]of aliases)residue=residue.replace(new RegExp(pattern.source,'gi'),'')
  // Remove complete filing/certificate identifiers BEFORE comma tokenization (35/523,448, D1,123,008 S).
  residue=residue.replace(/[A-Za-z]*\/?\d[\dA-Za-z.,/–-]*(?:\s+[A-Z](?=$|[\s、,，]))?/g,'').replace(/申请号|授权公告号|授权号|公告号|证书号|公告日|届满日|设计|编号/g,'')
  const unrecognized=residue.split(/[、,，/\s]+|以及|和|及/).map(s=>s.trim()).filter(Boolean)
  // The filing instructions name the publication-status field as authoritative.
  // Parenthetical procedural history (e.g. 已申请提前公开) does not override 正常公开.
  const publicationFields=[...remark.matchAll(/公开(?:情况|时间|方式)\s*[:：]?\s*([^；;\n。]+)/g)]
  const readPublicationField=(text:string):number|null=>{
    const requirement=text.trim().replace(/^(?:客户)?要求\s*[:：]?\s*/,'')
    if(/^立即公开/.test(requirement))return 0
    if(/^(?:正常|标准)公开/.test(requirement))return 12
    const months=/^(?:延迟|延期)?\s*(-?\d+)\s*个?月/.exec(requirement)
    return months?Number(months[1]):null
  }
  const publicationText=remark.replace(/(?:不(?:要|会)?|未|非|无需|暂不)\s*(?:立即公开|正常公开|标准公开)/g,'')
  const fallbackMonths=[...publicationText.matchAll(/公开\s*[:：]?\s*(-?\d+)\s*个?月|(-?\d+)\s*个?月(?:后)?公开/g)].map(m=>Number(m[1]??m[2]))
  const choices=new Set(publicationFields.length?publicationFields.map(m=>readPublicationField(m[1])):[...fallbackMonths,...(/立即公开/.test(publicationText)?[0]:[]),...(/正常公开|标准公开/.test(publicationText)?[12]:[])])
  let publicationMonths=choices.size===1?[...choices][0]:null
  const reviewNotes:string[]=[]
  if(designationConflict)reviewNotes.push('备注包含多段指定缔约方清单且存在冲突，需人工确认本案最终指定清单；未合并或只取第一段。')
  if(choices.size>1){publicationMonths=null;reviewNotes.push('备注同时包含不同公开时间要求，需人工确认最终公开月份。')}
  else if(publicationMonths!==null&&(!Number.isInteger(publicationMonths)||publicationMonths<0||publicationMonths>30||publicationMonths===1)){publicationMonths=null;reviewNotes.push('备注公开月份不在当前草稿支持范围（0 或 2–30 个月），需人工核对。')}
  if(/不申请|不指定|仅申请/.test(remark))reviewNotes.push('备注存在按款式限定指定国的条件，需确认本案对应款式；未自动改写主指定清单。')
  if(/海牙美国同日递交/.test(remark)&&!parties?.includes('US'))reviewNotes.push('备注另提海牙美国同日递交，与主指定清单的关系需人工确认；未自动追加美国。')
  return { parties, publicationMonths, remark, unrecognized,reviewNotes }
}
/** Semantic projection for arbitration. Database identifiers and personal contact metadata stay local. */
export function parsedHagueSource(source: string): unknown {
  return {
    applicants: sourceRows(source, 'GetCaseApplicant').map(r => {
      const address = value(r, 'contact_address_en')
      const city = applicantCity(r, address)
      const region = location(value(r, 'province'), value(r, 'province_en'), '', address, PROVINCES)
      const contact=applicantContact(r),country=contact.country
      return { name: applicantName(r), address: addressThroughDistrict(address, city), city, region, postalCode:contact.postalCode, country,
        unresolved: { ...(!city ? { city: value(r, 'city') } : {}), ...(!region&&country!=='SG' ? { region: value(r, 'province') } : {}),...contact.unresolved },...(contact.notes.length?{reviewNotes:contact.notes}:{}),...(contact.evidence.length?{evidence:contact.evidence}:{}) }
    }),
    creators: sourceRows(source, 'GetCaseInventor').map(r => {
      const name = value(r, 'inventor_name_en')
      const {givenName,familyName}=creatorName(r)
      return { sourceName:value(r,'inventor_name_cn','inventor_name_en'),...(givenName && familyName ? { givenName, familyName } : name ? { name } : { needsEnglishName: true }), addressSource: 'applicants[0]' }
    }),
    priorities: sourceRows(source, 'GetCasePriority').map(r => ({ number: value(r, 'priority_no'), date: value(r, 'priority_date_dd', 'priority_date').slice(0, 10), country: value(r, 'priority_country_id'), das: value(r, 'access_code') })),
    requirements: (() => {
      const { parties, publicationMonths, remark, unrecognized,reviewNotes } = sourceRequirements(source)
      const relevantRemark = remark.split(/[\n；;]/).filter(line => (parties===null||unrecognized.length>0)&&/海牙(?:进入|指定)|指定(?:缔约方|国家|地区)|申请国家/.test(line)||publicationMonths===null&&/公开/.test(line)).join('\n').replace(/\b[A-Z]{2}\d[A-Z\d-]*/g, '').replace(/[，,、\s]+(?=[，,、]|$)/g, '').trim()
      return { parties, publicationMonths, ...(unrecognized.length || parties === null || publicationMonths === null ? { sourceText: relevantRemark, unrecognized } : {}),...(reviewNotes.length?{reviewNotes}:{}) }
    })()
  }
}
export function applySourceFields(result: Decision, source: string): Decision {
  // Revalidate program-owned fields after restoring their source values. Model warnings
  // about these fields may describe its discarded guesses rather than the actual data.
  const sourceData:unknown=JSON.parse(source)
  const hasCreatorSource=record(sourceData)&&Array.isArray(sourceData.GetCaseInventor)
  const hasRequirementSource=record(sourceData)&&Array.isArray(sourceData.GetCaseInfo)
  result.warnings = result.warnings.filter(w => !/优先权|DAS|priority|数据库序号|地址|address|省份|province|region|城市|city|邮编|postal|申请人.*(?:name|英文名称|国家|country)|applicant.*(?:name|country)/i.test(w)
    && !(hasCreatorSource&&/设计人|英文姓名|creator|inventor/i.test(w))
    && !(hasRequirementSource&&/公开|publication|缔约方|指定国|指定地区|未识别地区|designated|contracting|unrecognized.*(?:countr|region)/i.test(w)))
  const applicants = sourceRows(source, 'GetCaseApplicant')
  const original = applicants[0]
  if (original) {
    const englishAddress = value(original, 'contact_address_en')
    const city = applicantCity(original, englishAddress, result.applicant.city)
    const contact=applicantContact(original),country=contact.country
    const region = country==='SG'&&!value(original,'province','province_en')?'':location(value(original, 'province'), value(original, 'province_en'), result.applicant.region, englishAddress, PROVINCES)
    result.applicant = { ...result.applicant, name: applicantName(original), address: englishAddress && !han.test(englishAddress) ? addressThroughDistrict(englishAddress, city) : '', city, region, postalCode:contact.postalCode,country }
    result.warnings.push(...contact.notes)
    result.evidence.push(...contact.evidence)
    result.evidence.push('申请人名称采用源英文值；英文名称栏为空时仅采用中文名称栏中原本就是英文的原文，不翻译或编造。地址采用 contact_address_en，城市、省份分别核对。')
    if (applicants.length > 1) result.evidence.push(`本案 ${applicants.length} 位申请人均保留用于逐位 Add Applicant；设计人地址复用第一申请人。`)
  }
  for (const key of ['name', 'address', 'city', 'region'] as const) {
    if (han.test(result.applicant[key])) { result.applicant[key] = ''; result.warnings.push(`申请人 ${key} 不是英文，需补充英文值`) }
    if (!result.applicant[key]&&!(key==='region'&&result.applicant.country==='SG')) result.warnings.push(`申请人 ${key} 缺少可靠英文值`)
  }
  if (!result.applicant.postalCode) result.warnings.push('申请人邮编缺失')
  if (!result.applicant.country) result.warnings.push('申请人国家缺少可靠来源，需人工核对；未采用模型猜测。')
  applicants.slice(1).forEach((r,i)=>{
    const contact=applicantContact(r)
    result.warnings.push(...contact.notes.map(n=>`申请人 ${i+2}：${n}`))
    if(!contact.postalCode)result.warnings.push(`申请人 ${i+2} 邮编缺失或无效，需补充本案来源。`)
    if(!contact.country)result.warnings.push(`申请人 ${i+2} 国家缺少可靠来源，需人工核对。`)
  })
  if(hasCreatorSource){
    const candidates=result.creators
    result.creators=sourceRows(source,'GetCaseInventor').map((r,i)=>{
      const names=creatorName(r),sourceName=value(r,'inventor_name_cn','inventor_name_en')
      let nameOrigin:'source'|'ai-transliterated'='source'
      if((!names.givenName||!names.familyName)&&han.test(sourceName)){
        const matching=candidates.filter(c=>c.sourceName?.replace(/\s/g,'')===sourceName.replace(/\s/g,''))
        const pairs=matching.map(c=>({givenName:c.givenName.replace(/\s+/g,''),familyName:c.familyName.replace(/\s+/g,'')})).filter(c=>/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(c.givenName)&&/^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(c.familyName))
        const unique=new Map(pairs.map(c=>[`${c.givenName.toLowerCase()}|${c.familyName.toLowerCase()}`,c]))
        if(unique.size===1){
          const translated=[...unique.values()][0]
          names.givenName ||= translated.givenName[0].toUpperCase()+translated.givenName.slice(1).toLowerCase()
          names.familyName ||= translated.familyName.toUpperCase()
          nameOrigin='ai-transliterated'
          result.evidence.push(`设计人 ${i+1}：${sourceName} → ${names.givenName} ${names.familyName}（AI 拼音转写，保留中文原名供草稿审核）。`)
        }
      }
      if(!names.givenName||!names.familyName)result.warnings.push(`设计人 ${i+1}${sourceName?`（${sourceName}）`:''}的 AI 姓名转写未完整返回或无法匹配，需重试仲裁或补充。`)
      return {...names,sourceName,nameOrigin,address:{...result.applicant}}
    })
    if(!result.creators.length)result.warnings.push('来源未提供设计人记录，需人工补充。')
  }else result.creators = result.creators.map(c => ({ ...c, address: { ...result.applicant } }))
  result.evidence.push('所有设计人的详细地址、城市、省份、邮编和国家均复用第一申请人地址。')
  const requirements = sourceRequirements(source)
  if (requirements.parties?.length) {
    result.parties = requirements.parties
    result.warnings = result.warnings.filter(w => !/缔约方|指定国家/.test(w))
    result.evidence.push(`指定缔约方按案件备注明确清单校验：${requirements.parties.join(', ')}。`)
  } else if (requirements.parties) result.warnings.push('案件备注的指定地区未完整识别，请核对原始清单。')
  if (requirements.unrecognized.length) result.warnings.push(`指定缔约方有未识别项目：${requirements.unrecognized.join('、')}，请核对原始清单，不能遗漏。`)
  if(hasRequirementSource&&!requirements.parties?.length){result.parties=[];result.warnings.push('案件备注未能确定指定缔约方，需人工核对。')}
  if (requirements.publicationMonths !== null && requirements.publicationMonths <= 30) {
    result.publicationMonths = requirements.publicationMonths
    result.warnings = result.warnings.filter(w => !/公开.*(?:缺失|没有|未读|未提供)/.test(w))
  }
  else if(hasRequirementSource){result.publicationMonths=null;if(!requirements.reviewNotes.some(n=>/公开/.test(n)))result.warnings.push('案件备注未能确定公开月份，需人工核对；未默认立即公开。')}
  result.warnings.push(...requirements.reviewNotes)
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

