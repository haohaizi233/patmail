import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { readXlsxSheets } from '../../../src/customer/xlsx-table'
import { pctRowsFromWorkbook } from '../../../src/customer/pct-workbook'

for (const sample of [
  { file: '外观提醒小客户-413.xlsx', kind: 'design', proc: '提醒申请涉外外观' },
  { file: '小客户国家提醒261103.xlsx', kind: 'national', proc: 'PCT进国家阶段官方绝限' }
]) {
  const path = `D:/Users/Administrator/Desktop/${sample.file}`
  it.skipIf(!existsSync(path))(`原始样表导入：${sample.file}`, async () => {
    const data = await readFile(path)
    const sheets = await readXlsxSheets(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
    const parsed = pctRowsFromWorkbook(sheets, [], undefined, 'block', [], sample.file)
    const header = sheets[0].rows[0]
    const our = header.indexOf('我方文号'), customer = header.indexOf('客户文号')
    const expected = sheets[0].rows.slice(1).filter(row => row[our]?.trim() || row[customer]?.trim()).length
    expect(parsed.rows.length).toBeGreaterThan(0)
    expect(parsed.rows.length).toBe(expected)
    expect(parsed.rows.every(row => row.letterKind === sample.kind && row.procLabel === sample.proc)).toBe(true)
    const ipr = header.indexOf(sample.kind === 'design' ? '案件客户联系人IPR' : '客户联系人(IPR)')
    const filledSource = sheets[0].rows.slice(1).filter(row => row[ipr]?.trim()).length
    expect(parsed.rows.filter(row => row.iprName.trim()).length).toBeGreaterThanOrEqual(filledSource)
    console.info(`${sample.kind}: imported=${parsed.rows.length}, hidden=${sheets[0].hiddenRows ?? 0}`)
  })
}
