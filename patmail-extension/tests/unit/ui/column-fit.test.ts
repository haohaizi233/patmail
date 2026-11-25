import { describe, expect, it } from 'vitest'
import { assignColumnWidths, autoColumnModes, fitColumnWidths, type ColumnFit } from '../../../src/shell/column-fit'

function sum(widths: number[]): number {
  return widths.reduce((total, width) => total + width, 0)
}

describe('期限表列宽', () => {
  it('两列都没超出下限时，空位平均铺满，锁定列不加宽', () => {
    const columns: ColumnFit[] = [
      { min: 72, content: 36, grow: true },
      { min: 64, content: 40, grow: true },
      { min: 80, content: 88, lock: true }
    ]
    const widths = assignColumnWidths(columns, 72 + 64 + 88 + 200)
    expect(widths).toEqual([172, 164, 88])
  })

  it('只有一列超出下限时，短列停在下限，空位都给这一列', () => {
    const widths = assignColumnWidths([
      { min: 72, content: 36, grow: true },
      { min: 64, content: 200, grow: true },
      { min: 80, content: 88, lock: true }
    ], 72 + 200 + 88 + 50)
    expect(widths).toEqual([72, 250, 88])
  })

  it('行不够宽时只省略还没分到文字宽度的列，旁边已放下的列不再留白', () => {
    const widths = assignColumnWidths([
      { min: 72, content: 130 },
      { min: 64, content: 420, grow: true },
      { min: 64, content: 64, grow: true },
      { min: 80, content: 180, lock: true }
    ], 130 + 64 + 64 + 180 + 40)
    expect(widths).toEqual([130, 104, 64, 180])
    expect(sum(widths)).toBe(130 + 64 + 64 + 180 + 40)
  })

  it('可伸长的列已经到下限后，才压缩其余列', () => {
    const widths = assignColumnWidths([
      { min: 72, content: 160 },
      { min: 48, content: 300, grow: true },
      { min: 80, content: 180, lock: true }
    ], 72 + 48 + 180 + 20)
    expect(widths[2]).toBe(180)
    expect(widths[1]).toBe(48)
    expect(widths[0]).toBe(72 + 20)
    expect(widths[0]).toBeLessThan(160)
  })

  it('锁定列在行比它还窄时仍保持文字宽度', () => {
    const widths = assignColumnWidths([
      { min: 40, content: 40, grow: true },
      { min: 20, content: 200, lock: true }
    ], 100)
    expect(widths).toEqual([40, 200])
  })

  it('容器连下限都放不下时按比例压进去，不出横向滚动条', () => {
    const widths = fitColumnWidths([
      { min: 72, content: 130 },
      { min: 64, content: 200, grow: true },
      { min: 80, content: 180, lock: true }
    ], 200)
    expect(sum(widths)).toBe(200)
    for (const width of widths) expect(width).toBeGreaterThan(0)
    const again = fitColumnWidths([
      { min: 72, content: 130 },
      { min: 64, content: 200, grow: true },
      { min: 80, content: 180, lock: true }
    ], 72 + 64 + 180 + 200)
    expect(again).toEqual(assignColumnWidths([
      { min: 72, content: 130 },
      { min: 64, content: 200, grow: true },
      { min: 80, content: 180, lock: true }
    ], 72 + 64 + 180 + 200))
  })
})

describe('通用弹窗与自动列策略 autoColumnModes + fitColumnWidths', () => {
  const pctSpecs = [
    { min: 84, content: 190 }, // 客户名称
    { min: 84, content: 145 }, // 我方文号
    { min: 84, content: 210 }, // 费用名称
    { min: 56, content: 100 }, // 金额
    { min: 56, content: 320 }, // 原因
  ]

  it('空列表返回空数组，单未锁定列自动设为 grow', () => {
    expect(autoColumnModes([], 500)).toEqual([])
    expect(autoColumnModes([{ min: 80, content: 120 }], 500)).toEqual([
      { min: 80, content: 120, lock: false, grow: true },
    ])
    expect(autoColumnModes([{ min: 80, content: 120 }], 500, ['lock'])).toEqual([
      { min: 80, content: 120, lock: true, grow: false },
    ])
  })

  it('宽容器下 5 列完整展示，多余空间仅补给超出均分的长列且总和严格等于容器宽', () => {
    const container = 1065
    const cols = autoColumnModes(pctSpecs, container)
    const widths = fitColumnWidths(cols, container)
    expect(sum(widths)).toBe(container)
    widths.forEach((width, index) => {
      expect(width).toBeGreaterThanOrEqual(pctSpecs[index].content)
    })
    expect(widths).toEqual([190, 145, 210, 100, 420])
  })

  it('中等容器下短列保持完整，超出均分的长列按比例收敛到容器内，不出横向滚动条', () => {
    const container = 820
    const cols = autoColumnModes(pctSpecs, container)
    expect(cols.map(col => Boolean(col.grow))).toEqual([true, false, true, false, true])

    const widths = fitColumnWidths(cols, container)
    expect(sum(widths)).toBe(container)
    expect(widths[1]).toBe(145)
    expect(widths[3]).toBe(100)
    expect(widths[0]).toBeLessThan(190)
    expect(widths[2]).toBeLessThan(210)
    expect(widths[4]).toBeLessThan(320)
  })

  it('显式指定 columnModes 时只让 grow 列优先吸收压缩，其余列尽量保留完整', () => {
    const container = 820
    const cols = autoColumnModes(pctSpecs, container, [undefined, 'lock', undefined, 'lock', 'grow'])
    expect(cols).toEqual([
      { min: 84, content: 190, lock: false, grow: false },
      { min: 84, content: 145, lock: true, grow: false },
      { min: 84, content: 210, lock: false, grow: false },
      { min: 56, content: 100, lock: true, grow: false },
      { min: 56, content: 320, lock: false, grow: true },
    ])
    const widths = fitColumnWidths(cols, container)
    expect(sum(widths)).toBe(container)
    expect(widths.slice(0, 4)).toEqual([190, 145, 210, 100])
    expect(widths[4]).toBe(175)
  })

  it('极窄容器下即便带有 lock 列也按比例压入容器宽，绝不溢出产生横向滚动条', () => {
    const container = 200
    const cols = autoColumnModes(pctSpecs, container, [undefined, 'lock', undefined, 'lock', 'grow'])
    const widths = fitColumnWidths(cols, container)
    expect(sum(widths)).toBe(container)
    for (const width of widths) expect(width).toBeGreaterThan(0)
  })

  it('所有列都较短时，多余宽度分给最宽的未锁定列（并列时取最后一列）', () => {
    const shortSpecs = [
      { min: 60, content: 90 },
      { min: 60, content: 150 },
      { min: 60, content: 80 },
      { min: 60, content: 150 },
      { min: 60, content: 100 },
    ]
    const container = 900
    const cols = autoColumnModes(shortSpecs, container)
    expect(cols.map(col => Boolean(col.grow))).toEqual([false, false, false, true, false])
    const widths = fitColumnWidths(cols, container)
    expect(sum(widths)).toBe(container)
    expect(widths).toEqual([90, 150, 80, 480, 100])
  })
})
