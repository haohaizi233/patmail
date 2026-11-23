import { downloadNamedBlob } from '../utils/download-blob'

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&')
}

export function sharedStringsFromXml(xml: string): string[] {
  const items: string[] = []
  for (const match of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const texts = [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(item => decodeXml(item[1]))
    items.push(texts.join(''))
  }
  return items
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/[^A-Z]/gi, '').toUpperCase()
  let index = 0
  for (const char of letters) index = index * 26 + char.charCodeAt(0) - 64
  return index - 1
}

function rowHiddenByFilter(attrs: string): boolean {
  return /\bhidden="(?:1|true)"/i.test(attrs)
}

/** 有筛选时只留下可见行。没筛选时隐藏行仍读进来。 */
export function sheetGridFromXml(xml: string, shared: string[]): { rows: string[][]; hiddenRows: number } {
  const filtered = /<autoFilter\b/.test(xml)
  const rows: string[][] = []
  let hiddenRows = 0
  for (const match of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    if (filtered && rowHiddenByFilter(match[1])) {
      hiddenRows += 1
      continue
    }
    const cells = cellsFromRowXml(match[2], shared)
    if (cells.some(item => item)) rows.push(cells)
    if (rows.length >= 5000) break
  }
  return { rows, hiddenRows }
}

function cellsFromRowXml(body: string, shared: string[]): string[] {
  const cells: string[] = []
  for (const cell of body.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]
      const body = cell[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? ''
      const index = ref ? columnIndex(ref) : cells.length
      if (index < 0 || index > 80) continue
      const kind = attrs.match(/\bt="([^"]+)"/)?.[1] ?? ''
      const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? ''
      const inline = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(item => decodeXml(item[1])).join('')
      let text = ''
      if (kind === 's') text = shared[Number(value)] ?? ''
      else if (kind === 'inlineStr') text = inline
      else text = decodeXml(value)
      while (cells.length < index) cells.push('')
      cells[index] = text.trim()
    }
  return cells
}

/** 第一张表的单元格。共享字符串用下标，普通单元格用文本。带筛选时不含隐藏行。 */
export function rowsFromSheetXml(xml: string, shared: string[]): string[][] {
  return sheetGridFromXml(xml, shared).rows
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(data)
      controller.close()
    }
  })
  const stream = source.pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZip(buffer: ArrayBuffer, include?: (name: string) => boolean): Promise<Map<string, string>> {
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)
  let end = -1
  const min = Math.max(0, bytes.length - 22 - 65536)
  for (let index = bytes.length - 22; index >= min; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      end = index
      break
    }
  }
  if (end < 0) throw new Error('这不是 xlsx 文件。')
  const count = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  const files = new Map<string, Uint8Array>()
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength))
    const wanted = !include || include(name)
    if (wanted && localOffset + 30 <= bytes.length && view.getUint32(localOffset, true) === 0x04034b50) {
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const start = localOffset + 30 + localNameLength + localExtraLength
      const compressed = bytes.subarray(start, start + compressedSize)
      if (method === 0) files.set(name, compressed)
      else if (method === 8) files.set(name, await inflateRaw(compressed))
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  const text = new Map<string, string>()
  const decoder = new TextDecoder()
  for (const [name, data] of files) text.set(name, decoder.decode(data))
  return text
}

export interface XlsxSheet {
  name: string
  rows: string[][]
  /** 筛选藏起来、因此没有导入的行。 */
  hiddenRows?: number
}

/**
 * 横向柱状图。柱子的数据就写在表里（标签列、值列、起止行，0 起数和 rows 对齐），
 * 图表引用这几格并缓存一份值，浮在 anchor 这块单元格上。bars 的顺序和数据行一致。
 */
export interface XlsxBarChart {
  /** 图表标题。 */
  title: string
  /** 系列名，图例上就是这一根柱子的口径。 */
  seriesName: string
  /** 每根柱子的分类文字和值。分类轴反向画，第一根在最上面。 */
  bars: Array<{ label: string; value: number }>
  /** 柱子标签写在第几列（0 起数）。 */
  labelColumn: number
  /** 柱子值写在第几列（0 起数）。 */
  valueColumn: number
  /** 柱子数据的起止行（0 起数，和 rows 对齐）。 */
  firstRow: number
  lastRow: number
  /** 图表浮在这些单元格上（0 起数的行、列），不压着数据行。 */
  anchor: { firstRow: number; lastRow: number; firstColumn: number; lastColumn: number }
}

/** 要写出去的一张表。单元格是文本或数字（数字写成数值格，图表引用时读得出来），表头就是每一张的第一行；freezeHeader 会把首行冻结。 */
export interface XlsxSheetSpec {
  name: string
  rows: Array<Array<string | number>>
  freezeHeader?: boolean
  /** 一张横向柱状图，浮在 anchor 那块单元格上。 */
  chart?: XlsxBarChart
}

function sheetEntries(files: Map<string, string>): Array<{ name: string; path: string }> {
  const workbook = files.get('xl/workbook.xml') ?? ''
  const rels = files.get('xl/_rels/workbook.xml.rels') ?? ''
  const targets = new Map<string, string>()
  for (const match of rels.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = match[1].match(/\bId="([^"]+)"/)?.[1]
    const target = match[1].match(/\bTarget="([^"]+)"/)?.[1]
    if (!id || !target) continue
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`
    targets.set(id, path)
  }
  const listed: Array<{ name: string; path: string }> = []
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = match[1].match(/\bname="([^"]*)"/)?.[1] ?? ''
    const id = match[1].match(/\br:id="([^"]+)"/)?.[1]
    const path = id ? targets.get(id) : undefined
    if (path) listed.push({ name: decodeXml(name), path })
  }
  if (listed.length) return listed
  return files.has('xl/worksheets/sheet1.xml') ? [{ name: 'Sheet1', path: 'xl/worksheets/sheet1.xml' }] : []
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function xmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function columnRef(index: number): string {
  let value = index + 1
  let letters = ''
  while (value > 0) {
    value -= 1
    letters = String.fromCharCode(65 + (value % 26)) + letters
    value = Math.floor(value / 26)
  }
  return letters
}

/** Excel 的列宽单位约等于一个半角字符。全角字按两个算，和双击「最合适列宽」的目测结果接近。 */
function cellWidth(value: string): number {
  let units = 0
  for (const char of value) {
    units += (char.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1
  }
  return units
}

/** 每列按最长的内容算最合适列宽，两边留一点空。上限取 Excel 自己的 255。 */
function bestFitCols(rows: Array<Array<string | number>>): string {
  const widths: number[] = []
  for (const line of rows) {
    line.forEach((value, column) => {
      widths[column] = Math.max(widths[column] ?? 0, cellWidth(String(value)))
    })
  }
  if (!widths.length) return ''
  return `<cols>${widths.map((width, column) => {
    const fitted = Math.min(255, Math.max(6, width + 2))
    return `<col min="${column + 1}" max="${column + 1}" width="${fitted}" customWidth="1"/>`
  }).join('')}</cols>`
}

function sheetXml(rows: Array<Array<string | number>>, freezeHeader: boolean, hasChart: boolean): string {
  const body = rows.map((line, index) => {
    // 数字写成数值格（图表的 numRef 引用文本格会被 Excel 读成 0），文字照旧写文本格。
    const cells = line.map((value, column) => {
      const ref = `${columnRef(column)}${index + 1}`
      return typeof value === 'number' && Number.isFinite(value)
        ? `<c r="${ref}"><v>${value}</v></c>`
        : `<c r="${ref}" t="inlineStr"><is><t>${xmlText(String(value))}</t></is></c>`
    }).join('')
    return `<row r="${index + 1}">${cells}</row>`
  }).join('')
  // 冻结首行：表头钉住，往下滚数据时表头不动。
  const views = freezeHeader
    ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
    : ''
  const root = hasChart
    ? `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    : `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
  // 图表挂在 drawing 部件上，关系写在这张表自己的 rels 里（rId1）。
  const drawing = hasChart ? `<drawing r:id="rId1"/>` : ''
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `${root}${views}${bestFitCols(rows)}<sheetData>${body}</sheetData>${drawing}</worksheet>`
}

/** 关系部件。表挂图、图挂图表各一份。 */
function relsXml(relationships: Array<{ id: string; type: string; target: string }>): string {
  const body = relationships
    .map(item => `<Relationship Id="${item.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${item.type}" Target="${item.target}"/>`)
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`
}

/** 图表里的轴号。每张图各写各的部分，写死一对就行。 */
const CHART_CAT_AXIS = 81000001
const CHART_VAL_AXIS = 81000002

/** 图表公式里的表名。带空格、中文的名字都套单引号，名字里的单引号写两个。 */
function sheetFormulaName(name: string): string {
  return `'${name.replace(/'/g, "''")}'`
}

function chartPoints(values: readonly (string | number)[]): string {
  return values.map((value, index) => `<c:pt idx="${index}"><c:v>${xmlText(String(value))}</c:v></c:pt>`).join('')
}

/**
 * 横向柱状图（barDir=bar）的图表部件。分类轴反向（maxMin），次数最多的画在最上面；
 * 值轴跟着挪到最下面那根（crosses=max），两根轴还是常规的左和下。柱子上标数值。
 */
function barChartXml(sheetName: string, chart: XlsxBarChart): string {
  const first = chart.firstRow + 1
  const last = chart.lastRow + 1
  const labelRange = `${sheetFormulaName(sheetName)}!$${columnRef(chart.labelColumn)}$${first}:$${columnRef(chart.labelColumn)}$${last}`
  const valueRange = `${sheetFormulaName(sheetName)}!$${columnRef(chart.valueColumn)}$${first}:$${columnRef(chart.valueColumn)}$${last}`
  const count = chart.bars.length
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<c:chart>` +
    `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="zh-CN" sz="1200" b="1"/><a:t>${xmlText(chart.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
    `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>` +
    `<c:barChart><c:barDir val="bar"/><c:grouping val="clustered"/><c:varyColors val="0"/>` +
    `<c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:v>${xmlText(chart.seriesName)}</c:v></c:tx><c:invertIfNegative val="0"/>` +
    `<c:dLbls><c:numFmt formatCode="General" sourceLinked="0"/><c:dLblPos val="outEnd"/><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>` +
    `<c:cat><c:strRef><c:f>${xmlText(labelRange)}</c:f><c:strCache><c:ptCount val="${count}"/>${chartPoints(chart.bars.map(bar => bar.label))}</c:strCache></c:strRef></c:cat>` +
    `<c:val><c:numRef><c:f>${xmlText(valueRange)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${count}"/>${chartPoints(chart.bars.map(bar => bar.value))}</c:numCache></c:numRef></c:val>` +
    `</c:ser><c:gapWidth val="100"/><c:axId val="${CHART_CAT_AXIS}"/><c:axId val="${CHART_VAL_AXIS}"/></c:barChart>` +
    // 分类轴留在左边（不写 crosses，取默认的 autoZero）；分类反向后值轴用 crosses=max 才压在最下面那根上。
    `<c:catAx><c:axId val="${CHART_CAT_AXIS}"/><c:scaling><c:orientation val="maxMin"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:crossAx val="${CHART_VAL_AXIS}"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
    `<c:valAx><c:axId val="${CHART_VAL_AXIS}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorTickMark val="out"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${CHART_CAT_AXIS}"/><c:crosses val="max"/><c:crossBetween val="between"/></c:valAx>` +
    `</c:plotArea><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`
}

/** 图表画在哪几格上。from/to 是单元格左上角，锚定从 from 的左上到 to 的左上。 */
function drawingXml(chart: XlsxBarChart): string {
  const { firstRow, lastRow, firstColumn, lastColumn } = chart.anchor
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<xdr:twoCellAnchor>` +
    `<xdr:from><xdr:col>${firstColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${firstRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>` +
    `<xdr:to><xdr:col>${lastColumn}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${lastRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
    `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="${xmlText(chart.title)}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr>` +
    `<xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">` +
    `<c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/>` +
    `</a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`
}

function storedZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = new TextEncoder().encode(file.name)
    const crc = crc32(file.data)
    const local = new Uint8Array(30 + name.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, 0, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, file.data.length, true)
    view.setUint32(22, file.data.length, true)
    view.setUint16(26, name.length, true)
    local.set(name, 30)
    const central = new Uint8Array(46 + name.length)
    const directory = new DataView(central.buffer)
    directory.setUint32(0, 0x02014b50, true)
    directory.setUint16(4, 20, true)
    directory.setUint16(6, 20, true)
    directory.setUint16(10, 0, true)
    directory.setUint16(12, 0, true)
    directory.setUint32(16, crc, true)
    directory.setUint32(20, file.data.length, true)
    directory.setUint32(24, file.data.length, true)
    directory.setUint16(28, name.length, true)
    directory.setUint32(42, offset, true)
    central.set(name, 46)
    locals.push(local, file.data)
    centrals.push(central)
    offset += local.length + file.data.length
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0)
  const end = new Uint8Array(22)
  const tail = new DataView(end.buffer)
  tail.setUint32(0, 0x06054b50, true)
  tail.setUint16(8, files.length, true)
  tail.setUint16(10, files.length, true)
  tail.setUint32(12, centralSize, true)
  tail.setUint32(16, offset, true)
  const output = new Uint8Array(offset + centralSize + end.length)
  let cursor = 0
  for (const part of [...locals, ...centrals, end]) {
    output.set(part, cursor)
    cursor += part.length
  }
  return output
}

function zipFile(name: string, text: string): { name: string; data: Uint8Array } {
  return { name, data: new TextEncoder().encode(text) }
}

/** 多张表。单元格都是文本，表头就是每一张的第一行；freezeHeader 会把首行冻结，chart 会在表里浮一张横向柱状图。 */
export function xlsxBookBytes(sheets: XlsxSheetSpec[]): ArrayBuffer {
  const used = sheets.filter(sheet => sheet.rows.length).slice(0, 8)
  const list: XlsxSheetSpec[] = used.length ? used : [{ name: 'Sheet1', rows: [] as string[][] }]
  const rawNames = list.map((sheet, index) => {
    const text = sheet.name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`
    return text
  })
  const names = rawNames.map(name => xmlText(name))
  const overrides = list.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')
  const chartOverrides = list.flatMap((sheet, index) => sheet.chart ? [
    `<Override PartName="/xl/drawings/drawing${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`,
    `<Override PartName="/xl/charts/chart${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`
  ] : []).join('')
  const sheetTags = list.map((_, index) => `<sheet name="${names[index]}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')
  const rels = list.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')
  const files = [
    zipFile('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      overrides +
      chartOverrides +
      `</Types>`),
    zipFile('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`),
    zipFile('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${sheetTags}</sheets></workbook>`),
    zipFile('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`),
    ...list.map((sheet, index) => zipFile(`xl/worksheets/sheet${index + 1}.xml`, sheetXml(sheet.rows, sheet.freezeHeader === true, Boolean(sheet.chart))))
  ]
  // 有图的表再挂三件：表的 rels 指向 drawing，drawing 的 rels 指向 chart。
  list.forEach((sheet, index) => {
    if (!sheet.chart) return
    files.push(
      zipFile(`xl/worksheets/_rels/sheet${index + 1}.xml.rels`, relsXml([{ id: 'rId1', type: 'drawing', target: `../drawings/drawing${index + 1}.xml` }])),
      zipFile(`xl/drawings/drawing${index + 1}.xml`, drawingXml(sheet.chart)),
      zipFile(`xl/drawings/_rels/drawing${index + 1}.xml.rels`, relsXml([{ id: 'rId1', type: 'chart', target: `../charts/chart${index + 1}.xml` }])),
      zipFile(`xl/charts/chart${index + 1}.xml`, barChartXml(rawNames[index], sheet.chart))
    )
  })
  const bytes = storedZip(files)
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

/** 一张表。单元格都是文本，表头就是第一行。 */
export function xlsxBytes(rows: string[][], sheetName = 'Sheet1'): ArrayBuffer {
  return xlsxBookBytes([{ name: sheetName, rows }])
}

export function downloadXlsxSheets(sheets: XlsxSheetSpec[], filename: string): void {
  const blob = new Blob([xlsxBookBytes(sheets)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  downloadNamedBlob(blob, filename)
}

export function downloadXlsxRows(rows: string[][], filename: string, sheetName = 'Sheet1'): void {
  downloadXlsxSheets([{ name: sheetName, rows }], filename)
}

export async function readXlsxSheets(buffer: ArrayBuffer, pick?: (name: string) => boolean): Promise<XlsxSheet[]> {
  const index = await readZip(buffer, name => name === 'xl/workbook.xml' || name === 'xl/_rels/workbook.xml.rels')
  const listed = sheetEntries(index)
  if (!listed.length) throw new Error('表格里没有工作表。')
  const chosen = pick ? listed.filter(item => pick(item.name)) : listed
  const use = chosen.length ? chosen : listed.slice(0, 1)
  const wanted = new Set(['xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', ...use.map(item => item.path)])
  const files = await readZip(buffer, name => wanted.has(name))
  const shared = sharedStringsFromXml(files.get('xl/sharedStrings.xml') ?? '')
  return use.map(item => {
    const grid = sheetGridFromXml(files.get(item.path) ?? '', shared)
    return { name: item.name, rows: grid.rows, ...(grid.hiddenRows ? { hiddenRows: grid.hiddenRows } : {}) }
  })
}

export async function readXlsxRows(buffer: ArrayBuffer): Promise<string[][]> {
  const sheets = await readXlsxSheets(buffer)
  const rows = sheets[0]?.rows
  if (!rows) throw new Error('表格里没有工作表。')
  return rows
}
