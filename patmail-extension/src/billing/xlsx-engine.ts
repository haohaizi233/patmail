import { Uint8ArrayReader, Uint8ArrayWriter, ZipReader, ZipWriter } from '@zip.js/zip.js'

/**
 * 请款工作流用的最小 xlsx 编辑器。
 * 目标：保留模板里的公式、样式、合并单元格，只在「数据块」里写值；
 * 需要时按 Excel「复制整块行」的语义克隆数据块，并同步调整合计行及跨表引用。
 */

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const XML_DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n'

export function colToNumber(col: string): number {
  let value = 0
  for (const ch of col) value = value * 26 + (ch.charCodeAt(0) - 64)
  return value
}

export function numberToCol(value: number): string {
  let text = ''
  let n = value
  while (n > 0) {
    const rest = (n - 1) % 26
    text = String.fromCharCode(65 + rest) + text
    n = Math.floor((n - 1) / 26)
  }
  return text
}

export function parseCellRef(ref: string): { col: number; row: number } {
  const match = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(ref)
  if (!match) throw new Error(`无效的单元格地址：${ref}`)
  return { col: colToNumber(match[1]), row: Number(match[2]) }
}

/** yyyy-mm-dd（或带时间）转 Excel 序列号；无效日期返回 null。 */
export function excelSerial(date: string | Date | null | undefined): number | null {
  if (!date) return null
  let y: number
  let m: number
  let d: number
  if (date instanceof Date) {
    y = date.getFullYear(); m = date.getMonth() + 1; d = date.getDate()
  } else {
    const match = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/.exec(date.trim())
    if (!match) return null
    y = Number(match[1]); m = Number(match[2]); d = Number(match[3])
  }
  const utc = Date.UTC(y, m - 1, d)
  const check = new Date(utc)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000)
}

// ---------------------------------------------------------------- 公式引用改写

const CELL = String.raw`\$?[A-Z]{1,3}\$?\d+`
const FORMULA_TOKEN = new RegExp(
  String.raw`("(?:[^"]|"")*")|(?<![A-Za-z0-9_.])((?:'(?:[^']|'')+'|[A-Za-z0-9_\u4e00-\u9fff.]+)!)?(${CELL})(?::(${CELL}))?(?![A-Za-z0-9_(])`,
  'g'
)

interface CellPart { colAbs: boolean; col: number; rowAbs: boolean; row: number }

function parsePart(text: string): CellPart {
  const match = /^(\$?)([A-Z]{1,3})(\$?)(\d+)$/.exec(text)
  if (!match) throw new Error(`无效引用：${text}`)
  return { colAbs: match[1] === '$', col: colToNumber(match[2]), rowAbs: match[3] === '$', row: Number(match[4]) }
}

function printPart(part: CellPart): string {
  return `${part.colAbs ? '$' : ''}${numberToCol(part.col)}${part.rowAbs ? '$' : ''}${part.row}`
}

function unquoteSheet(prefix: string): string {
  const name = prefix.slice(0, -1)
  return name.startsWith("'") ? name.slice(1, -1).replace(/''/g, "'") : name
}

function rewriteFormula(
  formula: string,
  rewrite: (sheet: string | null, first: CellPart, second: CellPart | null) => [CellPart, CellPart | null]
): string {
  return formula.replace(FORMULA_TOKEN, (match, literal: string | undefined, prefix: string | undefined, first: string, second: string | undefined) => {
    if (literal !== undefined) return match
    const [a, b] = rewrite(prefix ? unquoteSheet(prefix) : null, parsePart(first), second ? parsePart(second) : null)
    return `${prefix ?? ''}${printPart(a)}${b ? `:${printPart(b)}` : ''}`
  })
}

/** 与 Excel 复制粘贴一致：相对引用平移，$ 绝对引用不动。 */
export function translateFormula(formula: string, dRow: number, dCol = 0): string {
  const move = (part: CellPart): CellPart => ({
    ...part,
    row: part.rowAbs ? part.row : Math.max(1, part.row + dRow),
    col: part.colAbs ? part.col : Math.max(1, part.col + dCol)
  })
  return rewriteFormula(formula, (_sheet, first, second) => [move(first), second ? move(second) : null])
}

export interface ResizeSpan {
  sheet: string
  /** 数据区首行（原模板，默认 1）。 */
  start?: number
  /** 数据区最后一行（原模板）。 */
  end: number
  /** 数据区最后一行（调整后）。 */
  newEnd: number
}

/** 数据区行数变化后，修正指向该表数据区之后的引用，以及以数据区末行收尾的区间。 */
export function adjustFormulaForResize(formula: string, selfSheet: string, span: ResizeSpan): string {
  const delta = span.newEnd - span.end
  if (delta === 0) return formula
  const startRow = span.start ?? 1
  return rewriteFormula(formula, (sheet, first, second) => {
    if ((sheet ?? selfSheet) !== span.sheet) return [first, second]
    if (!second) {
      return [first.row > span.end ? { ...first, row: first.row + delta } : first, null]
    }
    const lo = Math.min(first.row, second.row)
    const hi = Math.max(first.row, second.row)
    const expandEnd = hi === span.end && lo >= startRow && lo <= span.end
    const nextFirst: CellPart = first.row > span.end
      ? { ...first, row: first.row + delta }
      : (expandEnd && first.row === hi && second.row < first.row ? { ...first, row: span.newEnd } : first)
    const nextSecond: CellPart = second.row > span.end
      ? { ...second, row: second.row + delta }
      : (expandEnd && second.row === hi ? { ...second, row: span.newEnd } : second)
    return [nextFirst, nextSecond]
  })
}

function shiftRange(range: string, span: ResizeSpan, dropFrom: number, dropTo: number): string | null {
  const delta = span.newEnd - span.end
  const parts = range.split(':').map(parsePart)
  const lo = Math.min(...parts.map(part => part.row))
  const hi = Math.max(...parts.map(part => part.row))
  if (lo >= dropFrom && hi <= dropTo && dropFrom <= dropTo) return null
  const moved = parts.map(part => (part.row > span.end ? { ...part, row: part.row + delta } : part))
  if (parts.length === 2 && hi === span.end && lo <= span.end && hi >= dropFrom) {
    return moved.map(part => printPart(part.row === hi ? { ...part, row: span.newEnd } : part)).join(':')
  }
  return moved.map(printPart).join(':')
}

// ---------------------------------------------------------------- 工作簿

function elements(parent: Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagNameNS(MAIN_NS, name))
}

function childElements(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(child => child.localName === name)
}

export class SheetEditor {
  private rowMap = new Map<number, Element>()

  constructor(readonly book: XlsxBook, readonly name: string, readonly doc: Document) {
    this.pruneTrailingEmptyRows()
    this.rebuildRowIndex()
  }

  get sheetData(): Element {
    const data = this.doc.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0]
    if (!data) throw new Error(`工作表「${this.name}」缺少 sheetData`)
    return data
  }

  private pruneTrailingEmptyRows(): void {
    const data = this.doc.getElementsByTagNameNS(MAIN_NS, 'sheetData')[0]
    if (!data) return
    const rows = childElements(data, 'row')
    for (let i = rows.length - 1; i >= 0; i--) {
      if (childElements(rows[i], 'c').length === 0) {
        rows[i].remove()
      } else {
        break
      }
    }
  }

  private rebuildRowIndex(): void {
    this.rowMap.clear()
    for (const row of childElements(this.sheetData, 'row')) {
      const n = Number(row.getAttribute('r'))
      if (n > 0) this.rowMap.set(n, row)
    }
  }

  rows(): Element[] {
    return childElements(this.sheetData, 'row')
  }

  rowNumber(row: Element): number {
    return Number(row.getAttribute('r'))
  }

  ensureRow(rowNo: number): Element {
    const found = this.rowMap.get(rowNo)
    if (found) return found
    const created = this.doc.createElementNS(MAIN_NS, 'row')
    created.setAttribute('r', String(rowNo))
    const rows = this.rows()
    const anchor = rows.find(row => this.rowNumber(row) > rowNo) ?? null
    this.sheetData.insertBefore(created, anchor)
    this.rowMap.set(rowNo, created)
    return created
  }

  cell(ref: string, create = false): Element | null {
    const { col, row } = parseCellRef(ref)
    const rowEl = create ? this.ensureRow(row) : this.rowMap.get(row)
    if (!rowEl) return null
    const cells = childElements(rowEl, 'c')
    const found = cells.find(item => parseCellRef(item.getAttribute('r') as string).col === col)
    if (found || !create) return found ?? null
    const created = this.doc.createElementNS(MAIN_NS, 'c')
    created.setAttribute('r', `${numberToCol(col)}${row}`)
    const anchor = cells.find(item => parseCellRef(item.getAttribute('r') as string).col > col) ?? null
    rowEl.insertBefore(created, anchor)
    return created
  }

  hasFormula(ref: string): boolean {
    const cell = this.cell(ref)
    return Boolean(cell && childElements(cell, 'f').length)
  }

  formulaOf(ref: string): string | null {
    const cell = this.cell(ref)
    const f = cell ? childElements(cell, 'f')[0] : undefined
    return f ? (f.textContent ?? '') : null
  }

  /** 读取单元格（共享字符串/内联字符串/数值），仅用于核对。 */
  valueOf(ref: string): string | number | null {
    const cell = this.cell(ref)
    if (!cell) return null
    const type = cell.getAttribute('t')
    if (type === 'inlineStr') return elements(cell, 't').map(item => item.textContent ?? '').join('')
    const v = childElements(cell, 'v')[0]
    if (!v || v.textContent === null || v.textContent === '') return null
    if (type === 's') return this.book.sharedString(Number(v.textContent))
    if (type === 'str') return v.textContent
    const num = Number(v.textContent)
    return Number.isFinite(num) ? num : v.textContent
  }

  /**
   * 写入输入单元格：保留样式，替换原有内容（包括模板里手敲的算式）。
   * 只应对数据录入格调用；合计、税费等计算公式格不要调用。
   */
  setCell(ref: string, value: string | number | null): void {
    const cell = this.cell(ref, true) as Element
    for (const child of Array.from(cell.children)) cell.removeChild(child)
    cell.removeAttribute('t')
    if (value === null || value === '') return
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return
      const v = this.doc.createElementNS(MAIN_NS, 'v')
      v.textContent = String(value)
      cell.appendChild(v)
      return
    }
    cell.setAttribute('t', 'inlineStr')
    const is = this.doc.createElementNS(MAIN_NS, 'is')
    const t = this.doc.createElementNS(MAIN_NS, 't')
    t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
    t.textContent = value
    is.appendChild(t)
    cell.appendChild(is)
  }

  private setRowNumber(row: Element, rowNo: number): void {
    row.setAttribute('r', String(rowNo))
    for (const cell of childElements(row, 'c')) {
      const { col } = parseCellRef(cell.getAttribute('r') as string)
      cell.setAttribute('r', `${numberToCol(col)}${rowNo}`)
    }
  }

  /**
   * 数据块伸缩：第一个块做原型，其余块按原型复制（公式相对平移），
   * 之后的行整体顺延，合计行的区间、跨表引用同步调整。
   */
  resizeBlocks(spec: { firstRow: number; blockSize: number; oldCount: number; newCount: number }): void {
    const newCount = Math.max(1, Math.floor(spec.newCount))
    const regionEnd = spec.firstRow + spec.blockSize * spec.oldCount - 1
    const firstBlockEnd = spec.firstRow + spec.blockSize - 1
    const newEnd = spec.firstRow + spec.blockSize * newCount - 1
    const delta = newEnd - regionEnd
    const span: ResizeSpan = { sheet: this.name, start: spec.firstRow, end: regionEnd, newEnd }

    for (const row of this.rows()) {
      const n = this.rowNumber(row)
      if (n > firstBlockEnd && n <= regionEnd) row.remove()
    }
    if (delta !== 0) {
      for (const row of this.rows()) {
        const n = this.rowNumber(row)
        if (n > regionEnd) this.setRowNumber(row, n + delta)
      }
      this.book.adjustAllFormulas(span)
    }
    this.adjustSheetRanges(span, firstBlockEnd + 1, regionEnd)

    const protos = this.rows().filter(row => {
      const n = this.rowNumber(row)
      return n >= spec.firstRow && n <= firstBlockEnd
    })
    const anchor = this.rows().find(row => this.rowNumber(row) > firstBlockEnd) ?? null
    for (let k = 1; k < newCount; k += 1) {
      for (const proto of protos) {
        const clone = proto.cloneNode(true) as Element
        this.setRowNumber(clone, this.rowNumber(proto) + k * spec.blockSize)
        for (const f of elements(clone, 'f')) {
          if (f.textContent) f.textContent = translateFormula(f.textContent, k * spec.blockSize)
        }
        this.sheetData.insertBefore(clone, anchor)
      }
    }

    const merges = this.doc.getElementsByTagNameNS(MAIN_NS, 'mergeCells')[0]
    if (merges) {
      const inFirstBlock = childElements(merges, 'mergeCell').filter(item => {
        const parts = (item.getAttribute('ref') as string).split(':').map(parseCellRef)
        const lo = Math.min(...parts.map(part => part.row))
        const hi = Math.max(...parts.map(part => part.row))
        return lo >= spec.firstRow && hi <= firstBlockEnd
      })
      for (let k = 1; k < newCount; k += 1) {
        for (const item of inFirstBlock) {
          const moved = (item.getAttribute('ref') as string).split(':').map(part => {
            const p = parseCellRef(part)
            return `${numberToCol(p.col)}${p.row + k * spec.blockSize}`
          }).join(':')
          const created = this.doc.createElementNS(MAIN_NS, 'mergeCell')
          created.setAttribute('ref', moved)
          merges.appendChild(created)
        }
      }
      merges.setAttribute('count', String(childElements(merges, 'mergeCell').length))
    }
    this.refreshDimension()
    this.rebuildRowIndex()
  }

  /** 合并单元格、条件格式、筛选、数据验证等「区域属性」随行变动。 */
  private adjustSheetRanges(span: ResizeSpan, dropFrom: number, dropTo: number): void {
    const merges = this.doc.getElementsByTagNameNS(MAIN_NS, 'mergeCells')[0]
    if (merges) {
      for (const item of childElements(merges, 'mergeCell')) {
        const next = shiftRange(item.getAttribute('ref') as string, span, dropFrom, dropTo)
        if (next === null) item.remove()
        else item.setAttribute('ref', next)
      }
      merges.setAttribute('count', String(childElements(merges, 'mergeCell').length))
    }
    for (const tag of ['conditionalFormatting', 'dataValidation']) {
      for (const item of elements(this.doc.documentElement, tag)) {
        const ranges = (item.getAttribute('sqref') ?? '').split(/\s+/).filter(Boolean)
          .map(range => shiftRange(range, span, dropFrom, dropTo)).filter((range): range is string => range !== null)
        if (!ranges.length) item.remove()
        else item.setAttribute('sqref', ranges.join(' '))
      }
    }
    for (const filter of elements(this.doc.documentElement, 'autoFilter')) {
      const ref = filter.getAttribute('ref')
      const next = ref ? shiftRange(ref, span, 1, 0) : null
      if (next) filter.setAttribute('ref', next)
    }
  }

  private refreshDimension(): void {
    for (const dim of elements(this.doc.documentElement, 'dimension')) dim.remove()
  }
}

export class XlsxBook {
  private files = new Map<string, Uint8Array>()
  private docs = new Map<string, Document>()
  private shared: string[] | null = null
  sheets: Array<{ name: string; path: string }> = []

  static async open(data: Uint8Array): Promise<XlsxBook> {
    const book = new XlsxBook()
    const reader = new ZipReader(new Uint8ArrayReader(data))
    try {
      for (const entry of await reader.getEntries()) {
        if (entry.directory) continue
        book.files.set(entry.filename, await entry.getData(new Uint8ArrayWriter()))
      }
    } finally {
      await reader.close()
    }
    book.readSheetList()
    for (const sheet of book.sheets) book.expandSharedFormulas(book.doc(sheet.path))
    return book
  }

  doc(path: string): Document {
    const cached = this.docs.get(path)
    if (cached) return cached
    const bytes = this.files.get(path)
    if (!bytes) throw new Error(`xlsx 缺少 ${path}`)
    const parsed = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml')
    if (parsed.getElementsByTagName('parsererror').length) throw new Error(`${path} 无法解析`)
    this.docs.set(path, parsed)
    return parsed
  }

  private readSheetList(): void {
    const workbook = this.doc('xl/workbook.xml')
    const rels = this.doc('xl/_rels/workbook.xml.rels')
    const targets = new Map<string, string>()
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      const target = rel.getAttribute('Target') ?? ''
      const normalized = target.startsWith('/') ? target.slice(1) : target.startsWith('xl/') ? target : `xl/${target}`
      targets.set(rel.getAttribute('Id') ?? '', normalized)
    }
    this.sheets = elements(workbook.documentElement, 'sheet').map(sheet => ({
      name: sheet.getAttribute('name') ?? '',
      path: targets.get(sheet.getAttributeNS(REL_NS, 'id') ?? sheet.getAttribute('r:id') ?? '') ?? ''
    })).filter(sheet => sheet.name && sheet.path)
  }

  sharedString(index: number): string {
    if (!this.shared) {
      this.shared = []
      if (this.files.has('xl/sharedStrings.xml')) {
        const doc = this.doc('xl/sharedStrings.xml')
        this.shared = elements(doc.documentElement, 'si').map(si => elements(si, 't').map(t => t.textContent ?? '').join(''))
      }
    }
    return this.shared[index] ?? ''
  }

  sheet(name: string): SheetEditor {
    const found = this.sheets.find(item => item.name === name)
    if (!found) throw new Error(`模板里没有工作表「${name}」`)
    return new SheetEditor(this, name, this.doc(found.path))
  }

  private expandSharedFormulas(doc: Document): void {
    const masters = new Map<string, { text: string; row: number; col: number }>()
    const cells = elements(doc.documentElement, 'c')
    for (const cell of cells) {
      const f = childElements(cell, 'f')[0]
      if (f?.getAttribute('t') === 'shared' && f.textContent) {
        const { col, row } = parseCellRef(cell.getAttribute('r') as string)
        masters.set(f.getAttribute('si') as string, { text: f.textContent, row, col })
      }
    }
    for (const cell of cells) {
      const f = childElements(cell, 'f')[0]
      if (f?.getAttribute('t') !== 'shared') continue
      const master = masters.get(f.getAttribute('si') as string)
      const { col, row } = parseCellRef(cell.getAttribute('r') as string)
      if (master) f.textContent = translateFormula(master.text, row - master.row, col - master.col)
      for (const attr of ['t', 'si', 'ref']) f.removeAttribute(attr)
    }
  }

  /**
   * 清理公式本身含 `#REF!` 的根级失效格（如模板删表残留的 `=#REF!`、`=#REF!-M4`），
   * 仅清空其公式与缓存值并保留单元格样式；下游引用它们的汇总/小计公式保持原样。
   */
  clearRootRefFormulas(): number {
    let cleared = 0
    for (const sheet of this.sheets) {
      for (const cell of elements(this.doc(sheet.path).documentElement, 'c')) {
        const f = childElements(cell, 'f')[0]
        if (!f || !/#REF!/i.test(f.textContent ?? '')) continue
        for (const child of Array.from(cell.children)) cell.removeChild(child)
        cell.removeAttribute('t')
        cleared += 1
      }
    }
    return cleared
  }

  /** 数据区伸缩后，所有工作表（含跨表引用）和定义名称里的引用统一修正。 */
  adjustAllFormulas(span: ResizeSpan): void {
    for (const sheet of this.sheets) {
      for (const f of elements(this.doc(sheet.path).documentElement, 'f')) {
        if (f.textContent) f.textContent = adjustFormulaForResize(f.textContent, sheet.name, span)
      }
    }
    const workbook = this.doc('xl/workbook.xml')
    for (const name of elements(workbook.documentElement, 'definedName')) {
      if (name.textContent) name.textContent = adjustFormulaForResize(name.textContent, '', span)
    }
  }

  async save(): Promise<Uint8Array> {
    this.files.delete('xl/calcChain.xml')
    if (this.files.has('[Content_Types].xml')) {
      const types = this.doc('[Content_Types].xml')
      for (const item of Array.from(types.getElementsByTagName('Override'))) {
        if ((item.getAttribute('PartName') ?? '').endsWith('calcChain.xml')) item.remove()
      }
    }
    const rels = this.doc('xl/_rels/workbook.xml.rels')
    for (const rel of Array.from(rels.getElementsByTagName('Relationship'))) {
      if ((rel.getAttribute('Target') ?? '').endsWith('calcChain.xml')) rel.remove()
    }
    const workbook = this.doc('xl/workbook.xml')
    let calc = elements(workbook.documentElement, 'calcPr')[0]
    if (!calc) {
      calc = workbook.createElementNS(MAIN_NS, 'calcPr')
      workbook.documentElement.appendChild(calc)
    }
    calc.setAttribute('fullCalcOnLoad', '1')
    // 公式的缓存结果已过期：清掉，打开时由 Excel / WPS 重新计算。
    for (const sheet of this.sheets) {
      for (const cell of elements(this.doc(sheet.path).documentElement, 'c')) {
        if (!childElements(cell, 'f').length) continue
        for (const v of childElements(cell, 'v')) cell.removeChild(v)
        cell.removeAttribute('t')
      }
    }
    const serializer = new XMLSerializer()
    for (const [path, doc] of this.docs) {
      const text = serializer.serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '')
      this.files.set(path, new TextEncoder().encode(XML_DECL + text))
    }
    const writer = new ZipWriter(new Uint8ArrayWriter())
    const names = Array.from(this.files.keys()).sort((a, b) => (a === '[Content_Types].xml' ? -1 : b === '[Content_Types].xml' ? 1 : 0))
    for (const name of names) await writer.add(name, new Uint8ArrayReader(this.files.get(name) as Uint8Array))
    return writer.close()
  }
}
