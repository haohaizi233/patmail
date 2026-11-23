export type WDateFormat = 'yyyy-MM-dd' | 'MM-dd'

export interface DateRangeCellSpec {
  start?: string
  end: string
  format?: WDateFormat
}

/** 按 WDatePicker 格式（默认 `yyyy-MM-dd`，月日格 `MM-dd`）格式化本地当天日期。 */
export function formatWDate(now: Date = new Date(), format: WDateFormat = 'yyyy-MM-dd'): string {
  const pad = (part: number): string => String(part).padStart(2, '0')
  const mmdd = `${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return format === 'MM-dd' ? mmdd : `${now.getFullYear()}-${mmdd}`
}

/** 遍历一组日期区间定义，把每个 `end` 字段默认填为当天（`month_day_from` 自动按 `MM-dd`）。 */
export function buildEndDateDefaults(
  cells: readonly DateRangeCellSpec[],
  now: Date = new Date()
): Record<string, string> {
  return Object.fromEntries(
    cells.map(cell => {
      const fmt: WDateFormat = cell.format ?? (cell.start === 'month_day_from' ? 'MM-dd' : 'yyyy-MM-dd')
      return [cell.end, formatWDate(now, fmt)]
    })
  )
}
