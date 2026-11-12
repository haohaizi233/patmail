import type { Applicant, Priority } from './arbitration'
import type { HagueRow } from './workflow'
import { imageNumber, natural, validateImages, validCaseVolume } from './materials'
import { parsedHagueSource, sourceRows, validSourcePostalCode } from './source'

export interface DraftImage { number: string; legend: string; file: File }
export interface DraftDesign { number: string; subclass: string; product: string; images: DraftImage[] }
export interface DraftPlan {
  reference: string; applicants: Applicant[]; creators: { givenName: string; familyName: string; address: Applicant }[]
  parties: string[]; publicationMonths: number; priorities: Priority[]; locarno: string; description: string; designs: DraftDesign[]
}
export const DRAFT_CONTACTS = {
  applicantEmail: 'hccx2005@126.com',
  representative: { name: 'CENFO Intellectual Property Agency', address: '6th Floor, Block A, Building 6, Shenzhen International Innovation Valley, Nanshan District', city: 'Shenzhen', region: 'Guangdong', postalCode: '518055', country: 'CN', email: 'sjhc2020@163.com' }
}
export function buildDraftPlan(row: HagueRow): DraftPlan {
  const { filing, decision } = row
  if (!filing || !decision || !validCaseVolume(row.folder.caseVolume)) throw new Error('请先完成材料解析、取数和仲裁。')
  const issues = [...row.folder.issues, ...filing.issues, ...validateImages(filing, row.folder.images)]
  if (issues.length) throw new Error(issues.join('；'))
  if(row.source&&sourceRows(row.source,'GetCaseApplicant').some(a=>typeof a.applicant_type==='string'&&/自然人|个人|natural/i.test(a.applicant_type)))throw new Error('自然人申请人的英文姓、名及资格需单独核对，当前自动填表配置适用于法人申请人。')
  const applicants = row.source ? (parsedHagueSource(row.source) as { applicants: Applicant[] }).applicants.map(a => ({ name:a.name, address:a.address, city:a.city, region:a.region, postalCode:a.postalCode, country:a.country })) : []
  if (applicants.length) applicants[0] = { ...decision.applicant }
  else applicants.push({ ...decision.applicant })
  applicants.forEach((a,i) => {
    if (!validSourcePostalCode(a.postalCode,a.country)) throw new Error(`申请人 ${i+1} 的邮编缺失或无效，请先补充可靠来源。`)
    for (const key of ['name','address','city','region','postalCode','country'] as const) if ((!a[key]&&!(key==='region'&&a.country==='SG')) || /\p{Script=Han}/u.test(a[key])) throw new Error(`申请人 ${i+1} 的 ${key} 缺少可靠英文值，请先补充。`)
    if (!['CN','China','CN - China'].includes(a.country)) throw new Error(`申请人 ${i+1} 的国籍、住所和 ACP 需人工核对；当前递交配置适用于中国申请人。`)
  })
  const sourceCreators = row.source ? sourceRows(row.source,'GetCaseInventor').length : 0
  if (!decision.creators.length || (sourceCreators && decision.creators.length !== sourceCreators)) throw new Error('设计人数量与来源不一致，请补齐全部设计人。')
  const creators = decision.creators.map((c,i) => {
    if (!c.givenName || !c.familyName || /\p{Script=Han}/u.test(c.givenName+c.familyName)) throw new Error(`设计人 ${i+1} 缺少英文姓或名，请先补充。`)
    return { givenName:c.givenName, familyName:c.familyName, address:{ ...applicants[0] } }
  })
  if (!decision.parties.length || decision.parties.some(p=>! /^[A-Z]{2}$/.test(p))) throw new Error('指定缔约方缺失或无效。')
  if (typeof decision.publicationMonths!=='number' || !Number.isInteger(decision.publicationMonths) || decision.publicationMonths < 0 || decision.publicationMonths > 30 || decision.publicationMonths===1) throw new Error('公开月份尚未确定或无效，请先核对。')
  for (const p of decision.priorities) if (!p.number || !/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^[A-Z]{2}$/.test(p.country)) throw new Error('优先权申请号、日期或国家不完整。')
  const designs = filing.products.map(p => {
    const images=row.folder.images.filter(f=>imageNumber(f).split('.')[0]===p[0]).sort((a,b)=>natural(imageNumber(a),imageNumber(b))).map(file=>({number:imageNumber(file),legend:filing.views.find(v=>v.number===imageNumber(file))!.label,file}))
    if (!p[0] || !/^\d+$/.test(p[3]) || !p[2] || !images.length) throw new Error('设计编号、小类、产品名称或图纸不完整。')
    if(Number(p[1])!==images.length)throw new Error(`设计 ${p[0]} 的图纸数量与产品表不符。`)
    for (const image of images) if (!/\.(?:jpe?g|tiff?)$/i.test(image.file.name) || image.file.size>2097152) throw new Error(`图纸 ${image.file.name} 须为不超过 2MB 的 JPG/TIF，请转换后重选。`)
    return { number:p[0], subclass:String(Number(p[3])), product:p[2], images }
  }).sort((a,b)=>natural(a.number,b.number))
  if(designs.some((d,i)=>Number(d.number)!==i+1))throw new Error('设计编号须从 1 连续编号，请先核对产品表和图纸归属。')
  if (designs.reduce((n,d)=>n+d.images.length,0)!==row.folder.images.length) throw new Error('部分图纸未匹配到设计编号。')
  if (!designs.length || !/^\d+$/.test(filing.locarno)) throw new Error('设计或 Locarno 大类缺失。')
  return {reference:row.folder.caseVolume,applicants,creators,parties:[...new Set(decision.parties)],publicationMonths:decision.publicationMonths,priorities:decision.priorities.map(p=>({...p})),locarno:filing.locarno,description:filing.description,designs}
}
