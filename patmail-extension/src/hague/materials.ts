import { BlobReader, TextWriter, ZipReader } from '@zip.js/zip.js'
import { readLegacyDocText } from './legacy-doc'

export const VIEW_CODES: Record<string, string> = { '1': 'Perspective', '2': 'Front', '3': 'Back', '4': 'Top', '5': 'Bottom', '6': 'Left', '7': 'Right', '8': 'Unfolded', '9': 'Exploded', '10': 'Cross-Sectional', '11': 'Enlarged', '00': 'Other type of view' }
export interface View { number: string; code: string; label: string }
export interface Filing { locarno: string; products: string[][]; description: string; views: View[]; issues: string[] }
export interface CaseFolder { path: string; caseVolume: string; documents: File[]; images: File[]; issues: string[]; notices?: string[] }
export const natural = (a: string, b: string): number => a.localeCompare(b, 'en', { numeric: true })
export const validCaseVolume = (s: string): boolean => /^P[A-Z0-9-]*HAGUE$/i.test(s.trim()) && s.trim().length <= 80
export const reference = (s: string): string => s.match(/(?<![A-Za-z0-9])(P[A-Za-z0-9]+(?:-\d+)*-?HAGUE)(?![A-Za-z0-9])/i)?.[1]?.toUpperCase() ?? ''
const pathOf = (f: File): string => (f.webkitRelativePath || f.name).replace(/\\/g, '/')
export function imageNumber(f: File): string { return f.name.replace(/\.[^.]+$/, '') }

export function discoverCases(files: File[]): CaseFolder[] {
  const groups = new Map<string, CaseFolder>()
  for (const f of files) {
    const path = pathOf(f), parts = path.split('/'); parts.pop()
    let index = -1
    parts.forEach((s, i) => { if (reference(s)) index = i })
    // A document directory is a fallback boundary for folders without a case reference.
    if (index < 0 && /\.docx?$/i.test(f.name) && !f.name.startsWith('~$')) {
      const dir = parts.join('/')
      if (!groups.has(dir)) groups.set(dir, { path: dir, caseVolume: reference(f.name), documents: [], images: [], issues: [] })
    } else if (index >= 0) {
      const dir = parts.slice(0, index + 1).join('/')
      if (!groups.has(dir)) groups.set(dir, { path: dir, caseVolume: reference(parts[index]), documents: [], images: [], issues: [] })
    }
  }
  const ordered = [...groups.values()].sort((a, b) => b.path.length - a.path.length)
  for (const f of files) {
    if (f.name.startsWith('~$')) continue
    const path = pathOf(f)
    const group = ordered.find(g => !g.path || path.startsWith(`${g.path}/`))
    if (!group) continue
    if (/\.docx?$/i.test(f.name)) group.documents.push(f)
    if (/^\d+\.\d+\.(jpg|jpeg|png)$/i.test(f.name)) group.images.push(f)
  }
  for (const g of groups.values()) {
    if (!g.caseVolume) g.issues.push('未识别案号，请填写我方文号')
    if (g.documents.length !== 1) g.issues.push(`需要一份定稿 Word，当前 ${g.documents.length} 份`)
    for (const d of g.documents) if (reference(d.name) && reference(d.name) !== g.caseVolume) (g.notices ??= []).push(`Word 文件名案号为 ${reference(d.name)}，默认使用文件夹识别的 ${g.caseVolume}`)
    if (!g.images.length) g.issues.push('未发现编号图片')
    g.images.sort((a, b) => natural(imageNumber(a), imageNumber(b)))
  }
  return [...groups.values()].sort((a, b) => natural(a.path, b.path))
}

const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const nodes = (e: Element | Document, name: string): Element[] => [...e.getElementsByTagNameNS(NS, name)]
const text = (e: Element): string => nodes(e, 't').map(n => n.textContent ?? '').join('').trim()
export function parseFilingXml(xml: string): Filing {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) throw new Error('Word XML 格式无效')
  const paragraphs = nodes(doc, 'p').map(text)
  const all = paragraphs.join('\n')
  const result: Filing = { locarno: all.match(/Locarno Class[^\n]*?:\s*(\d+)/i)?.[1] ?? '', products: [], description: '', views: [], issues: [] }
  const codes = { ...VIEW_CODES }
  // DM/1 editions differ (for example 12=Enlarged). The document's own key wins.
  for (const table of nodes(doc, 'tbl')) for (const cell of nodes(table, 'tc')) {
    const match = /^(\d{1,2})\s+(Perspective|Front|Back|Top|Bottom|Left|Right|Unfolded|Reference|Exploded|Cross[- ]Sectional|Enlarged)\b/i.exec(text(cell))
    if (match) codes[match[1]] = match[2].replace(/cross[- ]sectional/i, 'Cross-Sectional').replace(/^./, s => s.toUpperCase())
  }
  const start = paragraphs.findIndex(p => /^3\.\s*Description/i.test(p))
  const end = paragraphs.findIndex((p, i) => i > start && /^4\.\s*Legends/i.test(p))
  if (start >= 0) result.description = paragraphs.slice(start + 1, end < 0 ? undefined : end).filter(Boolean).join('\n')
  for (const table of nodes(doc, 'tbl')) {
    const rows = nodes(table, 'tr').map(r => [...r.children].filter(c => c.localName === 'tc').map(text))
    if (rows[0]?.some(c => /Product\(s\)/i.test(c))) result.products.push(...rows.slice(1))
    for (const row of rows) for (let offset = 0; offset + 2 < row.length; offset += 3) {
      const number = row[offset], code = row[offset + 1].trim(), legend = row[offset + 2].trim()
      if (!/^\d+\.\d+$/.test(number)) continue
      if (!(code in codes)) { result.issues.push(`${number} 视图代码无效：${code}`); continue }
      if (code === '00' && !legend) result.issues.push(`${number} 代码 00 缺少自定义 Legend`)
      if (code !== '00' && legend && legend.toLowerCase().replace(/\s+view$/, '') !== codes[code].toLowerCase()) result.issues.push(`${number} 代码与 Legend 不一致：${code} / ${legend}`)
      if (result.views.some(v => v.number === number)) result.issues.push(`${number} 表格图号重复`)
      result.views.push({ number, code, label: code === '00' ? legend : codes[code] })
    }
  }
  result.views.sort((a, b) => natural(a.number, b.number))
  if (!result.locarno) result.issues.push('未读取到 Locarno 大类')
  if (!result.products.length) result.issues.push('未读取到产品与小类表格')
  if (!result.description) result.issues.push('未读取到 Description')
  if (!result.views.length) result.issues.push('未读取到视图编号表')
  return result
}

export function parseLegacyFilingText(text: string): Filing {
  const clean = (s: string) => s.replace(/[\r\n]+/g, ' ').split(String.fromCharCode(11)).join(' ').trim()
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').split('').filter(c => c.charCodeAt(0) >= 32 || [9, 10, 13].includes(c.charCodeAt(0))).join('')
  const paragraph = (s: string) => `<w:p><w:r><w:t>${escape(s)}</w:t></w:r></w:p>`
  const table = (rows: string[][]) => `<w:tbl>${rows.map(row => `<w:tr>${row.map(c => `<w:tc>${paragraph(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
  const productsSection = text.split(/3\.\s*Description/i)[0]
  const cells = productsSection.split('\x07').map(clean), products: string[][] = []
  for (let i = 0; i + 3 < cells.length; i++) if (/^\d+$/.test(cells[i]) && /^\d+$/.test(cells[i + 1]) && cells[i + 2] && /^\d+$/.test(cells[i + 3])) { products.push(cells.slice(i, i + 4)); i += 3 }
  const legends = text.split(/4\.\s*Legends/i)[1]?.split(/5\.\s*Claim/i)[0] ?? ''
  const legendCells = legends.split('\x07').map(clean), views: string[][] = []
  for (let i = 0; i + 2 < legendCells.length; i++) if (/^\d+\.\d+$/.test(legendCells[i])) { views.push(legendCells.slice(i, i + 3)); i += 2 }
  const description = text.split(/3\.\s*Description[^\r]*/i)[1]?.split(/4\.\s*Legends/i)[0] ?? ''
  const locarno = /Locarno Class[^\r]*?:\s*(\d+)/i.exec(text)?.[1] ?? ''
  return parseFilingXml(`<w:document xmlns:w="${NS}"><w:body>${paragraph(`Locarno Class: ${locarno}`)}${table([['No.', 'Total', 'Product(s)', 'Subclass'], ...products])}${paragraph('3. Description')}${description.split('\r').map(paragraph).join('')}${paragraph('4. Legends')}${table([legendCells.filter(c => /^\d{1,2}\s+[A-Za-z]/.test(c))])}${table(views)}</w:body></w:document>`)
}

export function validateImages(filing: Filing, images: File[]): string[] {
  const issues: string[] = [], seen = new Set<string>()
  for (const f of images) { const n = imageNumber(f); if (seen.has(n)) issues.push(`图片编号重复：${n}`); seen.add(n) }
  for (const v of filing.views) if (!seen.has(v.number)) issues.push(`缺少图片：${v.number}`)
  for (const n of seen) if (!filing.views.some(v => v.number === n)) issues.push(`图片没有对应表格记录：${n}`)
  const expected = filing.products.reduce((sum, row) => sum + (Number(row[1]) || 0), 0)
  if (expected && expected !== images.length) issues.push(`图片数量不符：Word ${expected} / 文件 ${images.length}`)
  return issues
}
export async function readFiling(file: File): Promise<Filing> {
  if (file.size > 20 * 1024 * 1024) throw new Error('Word 超过 20MB，请检查材料')
  if (/\.doc$/i.test(file.name)) {
    const buffer = await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(new Error('Word 文件读取失败')); reader.readAsArrayBuffer(file) })
    return parseLegacyFilingText(readLegacyDocText(new Uint8Array(buffer)))
  }
  const reader = new ZipReader(new BlobReader(file), { useWebWorkers: false })
  try {
    const entries = await reader.getEntries()
    const entry = entries.find(e => e.filename === 'word/document.xml')
    if (!entry || !('getData' in entry) || !entry.getData || entry.uncompressedSize > 10 * 1024 * 1024) throw new Error('无法读取 Word 正文或正文过大')
    return parseFilingXml(await entry.getData(new TextWriter()))
  } finally { await reader.close() }
}
