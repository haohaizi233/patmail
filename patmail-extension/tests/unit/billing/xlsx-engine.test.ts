import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js'
import { describe, expect, it } from 'vitest'
import { adjustFormulaForResize, excelSerial, translateFormula, XlsxBook } from '../../../src/billing/xlsx-engine'

async function buildBook(): Promise<Uint8Array> {
  const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
  const files: Record<string, string> = {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/calcChain.xml" ContentType="x"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="明细" sheetId="1" r:id="rId1"/><sheet name="汇总 表" sheetId="2" r:id="rId2"/></sheets><definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">'明细'!$A$1:$D$8</definedName></definedNames><calcPr calcId="1"/></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="x" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="x" Target="calcChain.xml"/></Relationships>',
    'xl/calcChain.xml': '<calcChain/>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="${main}"><dimension ref="A1:D8"/><sheetData>` +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>标题</t></is></c></row>' +
      // 两个数据块，每块 2 行：上行 B*2、下行小计；共享公式在 D 列
      '<row r="2"><c r="A2"><v>1</v></c><c r="B2"><v>10</v></c><c r="C2"><f>B2*2</f><v>20</v></c><c r="D2"><f t="shared" ref="D2:D3" si="0">C2+1</f><v>21</v></c></row>' +
      '<row r="3"><c r="B3"><v>5</v></c><c r="C3"><f>B3*2</f><v>10</v></c><c r="D3"><f t="shared" si="0"/><v>11</v></c></row>' +
      '<row r="4"><c r="A4"><v>2</v></c><c r="B4"><v>7</v></c><c r="C4"><f>B4*2</f></c><c r="D4"><f>C4+1</f></c></row>' +
      '<row r="5"><c r="B5"><v>8</v></c><c r="C5"><f>B5*2</f></c><c r="D5"><f>C5+1</f></c></row>' +
      '<row r="7"><c r="B7"><f>SUM(B2:B5)</f></c><c r="C7"><f>SUM(C2:C5)</f></c><c r="D7"><f>C7+LOG10(100)+B2+"B5"</f></c></row>' +
      '</sheetData><mergeCells count="3"><mergeCell ref="A2:A3"/><mergeCell ref="A4:A5"/><mergeCell ref="A7:A8"/></mergeCells></worksheet>',
    'xl/worksheets/sheet2.xml': `<?xml version="1.0"?><worksheet xmlns="${main}"><sheetData><row r="1"><c r="A1"><f>'明细'!C7+明细!B7+B3</f></c></row></sheetData></worksheet>`
  }
  const writer = new ZipWriter(new Uint8ArrayWriter())
  for (const [name, text] of Object.entries(files)) await writer.add(name, new Uint8ArrayReader(new TextEncoder().encode(text)))
  return writer.close()
}

describe('xlsx 公式引用改写', () => {
  it('translateFormula 相对引用平移、$ 绝对引用不动、字符串与函数名不动', () => {
    expect(translateFormula('SUM(B2:B3)+$C$1+D$4', 3)).toBe('SUM(B5:B6)+$C$1+D$4')
    expect(translateFormula('ROUND(P7*Q7,2)', 3)).toBe('ROUND(P10*Q10,2)')
    expect(translateFormula('LOG10(100)+"B5"&B5', 2)).toBe('LOG10(100)+"B5"&B7')
    expect(translateFormula("'线下 表'!AF16+SUM(R7:R9)", 3)).toBe("'线下 表'!AF19+SUM(R10:R12)")
    expect(translateFormula('#REF!-M4', 1)).toBe('#REF!-M5')
  })

  it('adjustFormulaForResize 只调整数据区之后的引用与以末行收尾的区间', () => {
    const span = { sheet: '明细', end: 5, newEnd: 9 }
    expect(adjustFormulaForResize('SUM(B2:B5)', '明细', span)).toBe('SUM(B2:B9)')
    expect(adjustFormulaForResize('SUM(B2:B3)', '明细', span)).toBe('SUM(B2:B3)')
    expect(adjustFormulaForResize('B7+B3', '明细', span)).toBe('B11+B3')
    expect(adjustFormulaForResize("'明细'!C7+B7", '汇总', span)).toBe("'明细'!C11+B7")
    expect(adjustFormulaForResize('明细!B7', '汇总', span)).toBe('明细!B11')
    // oldCount === 1（单行区 SUM(B5:B5)）也应正确扩展末行
    expect(adjustFormulaForResize('SUM(B5:B5)', '明细', { sheet: '明细', start: 5, end: 5, newEnd: 8 })).toBe('SUM(B5:B8)')
  })

  it('excelSerial 只接受有效公历日期', () => {
    expect(excelSerial('2026-11-19')).toBe(46345)
    expect(excelSerial('2026-02-31')).toBeNull()
    expect(excelSerial('')).toBeNull()
  })
})

describe('xlsx 数据块伸缩', () => {
  it('3 个块 → 展开共享公式、复制原型块、合计与跨表引用同步，且不动其他公式', async () => {
    const book = await XlsxBook.open(await buildBook())
    const sheet = book.sheet('明细')
    sheet.resizeBlocks({ firstRow: 2, blockSize: 2, oldCount: 2, newCount: 3 })
    // 第 3 块 = 第 1 块平移 4 行
    expect(sheet.formulaOf('C6')).toBe('B6*2')
    expect(sheet.formulaOf('D6')).toBe('C6+1')
    expect(sheet.formulaOf('D7')).toBe('C7+1')
    // 原第 2 块被原型取代，行号顺延；合计行下移 2 行，区间扩到新末行
    expect(sheet.formulaOf('B9')).toBe('SUM(B2:B7)')
    expect(sheet.formulaOf('C9')).toBe('SUM(C2:C7)')
    expect(sheet.formulaOf('D9')).toBe('C9+LOG10(100)+B2+"B5"')
    expect(sheet.hasFormula('B7')).toBe(false)
    // 跨表引用跟随合计行
    expect(book.sheet('汇总 表').formulaOf('A1')).toBe("'明细'!C9+明细!B9+B3")
    // 合并单元格随块复制、合计区顺延
    const refs = Array.from(sheet.doc.getElementsByTagName('mergeCell')).map(item => item.getAttribute('ref'))
    expect([...refs].sort()).toEqual(['A2:A3', 'A4:A5', 'A6:A7', 'A9:A10'])
    expect(sheet.doc.getElementsByTagName('mergeCells')[0]?.getAttribute('count')).toBe('4')
  })

  it('块数变少时同样调整，输入格写值保留样式并替换手敲算式', async () => {
    const book = await XlsxBook.open(await buildBook())
    const sheet = book.sheet('明细')
    sheet.resizeBlocks({ firstRow: 2, blockSize: 2, oldCount: 2, newCount: 1 })
    expect(sheet.formulaOf('B5')).toBe('SUM(B2:B3)')
    sheet.setCell('B2', 99)
    sheet.setCell('A1', '新标题')
    sheet.setCell('C3', null)
    expect(sheet.valueOf('B2')).toBe(99)
    expect(sheet.valueOf('A1')).toBe('新标题')
    expect(sheet.hasFormula('C3')).toBe(false)
    expect(sheet.hasFormula('C2')).toBe(true)
  })

  it('保存后重读：去掉 calcChain、强制重算、公式缓存清空', async () => {
    const book = await XlsxBook.open(await buildBook())
    book.sheet('明细').resizeBlocks({ firstRow: 2, blockSize: 2, oldCount: 2, newCount: 2 })
    const saved = await XlsxBook.open(await book.save())
    const workbookXml = new XMLSerializer().serializeToString(saved.doc('xl/workbook.xml'))
    expect(workbookXml).toContain('fullCalcOnLoad="1"')
    expect(() => saved.doc('xl/calcChain.xml')).toThrow()
    expect(new XMLSerializer().serializeToString(saved.doc('[Content_Types].xml'))).not.toContain('calcChain')
    const cached = saved.sheet('明细').cell('C2')?.getElementsByTagName('v').length
    expect(cached).toBe(0)
  })

  it('clearRootRefFormulas 只清理根级 #REF! 公式格，保留下游依赖汇总公式', async () => {
    const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    const files: Record<string, string> = {
      '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>',
      '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml': `<?xml version="1.0"?><workbook xmlns="${main}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="汇总" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml': `<?xml version="1.0"?><worksheet xmlns="${main}"><sheetData>` +
        '<row r="4"><c r="L4" s="1" t="e"><f>#REF!-M4</f><v>#REF!</v></c><c r="M4" s="1" t="e"><f>#REF!</f><v>#REF!</v></c><c r="N4" s="2" t="e"><f>L4+M4</f><v>#REF!</v></c></row>' +
        '<row r="7"><c r="L7" s="3" t="e"><f>SUM(L4:L6)</f><v>#REF!</v></c></row>' +
        '</sheetData></worksheet>'
    }
    const writer = new ZipWriter(new Uint8ArrayWriter())
    for (const [name, text] of Object.entries(files)) await writer.add(name, new Uint8ArrayReader(new TextEncoder().encode(text)))
    const book = await XlsxBook.open(await writer.close())
    expect(book.clearRootRefFormulas()).toBe(2)
    const sheet = book.sheet('汇总')
    expect(sheet.hasFormula('L4')).toBe(false)
    expect(sheet.hasFormula('M4')).toBe(false)
    expect(sheet.cell('L4')?.getAttribute('s')).toBe('1')
    expect(sheet.formulaOf('N4')).toBe('L4+M4')
    expect(sheet.formulaOf('L7')).toBe('SUM(L4:L6)')
  })
})
