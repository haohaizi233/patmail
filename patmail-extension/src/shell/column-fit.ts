/** 列的分配策略：lock 尽量维持内容宽，grow 吸收多余空间或优先承担压缩。 */
export type ColumnFitMode = 'lock' | 'grow' | undefined

/** 一列在分配前的宽度。content 含单元格左右内边距。 */
export type ColumnFit = {
  /** 空内容或短内容时的下限。表头宽度通常就是这个下限。 */
  min: number
  /** 这一列里最宽的文字。 */
  content: number
  /** 按文字定宽，不伸长也不缩短。期限表里的日期和流程状态用这个。 */
  lock?: boolean
  /** 每列都能放下文字之后，多出来的宽度分到这里。 */
  grow?: boolean
}

/**
 * 为未显式指定策略的列自动推导 lock/grow：
 * 短列保持 fit（尽量不截断），超出均分的长列标记为 grow 优先吸收多余空间与压缩。
 */
export function autoColumnModes(
  specs: readonly Pick<ColumnFit, 'min' | 'content'>[],
  container: number,
  explicit?: readonly ColumnFitMode[],
): ColumnFit[] {
  if (!specs.length) return []
  const mapped: ColumnFit[] = specs.map((spec, index) => {
    const mode = explicit?.[index]
    return {
      min: spec.min,
      content: spec.content,
      lock: mode === 'lock',
      grow: mode === 'grow',
    }
  })

  if (mapped.some(col => col.grow)) return mapped

  if (mapped.length === 1) {
    if (!mapped[0].lock) mapped[0].grow = true
    return mapped
  }

  const fairShare = container > 0 ? Math.floor(container / specs.length) : 0
  let anyGrow = false
  for (const col of mapped) {
    if (!col.lock && col.content > fairShare) {
      col.grow = true
      anyGrow = true
    }
  }
  if (!anyGrow) {
    let bestIndex = -1
    let maxContent = -1
    mapped.forEach((col, index) => {
      if (!col.lock && col.content >= maxContent) {
        maxContent = col.content
        bestIndex = index
      }
    })
    if (bestIndex >= 0) mapped[bestIndex].grow = true
  }
  return mapped
}

/**
 * 先给每列 max(最小宽度, 文字宽度)。
 * 行还有空位时，空位只补给还想变宽的列，短列停在下限。
 * 行不够宽时，先压可伸长的列，再压其余列，锁定列保持文字宽度。
 * 只有分到的宽度仍小于文字宽度时，这一列才该省略。
 */
export function assignColumnWidths(columns: readonly ColumnFit[], container: number): number[] {
  const specs = columns.map(column => ({
    min: Math.max(0, Math.floor(column.min)),
    content: Math.max(0, Math.floor(column.content)),
    lock: column.lock === true,
    grow: column.grow === true && column.lock !== true
  }))
  const pref = specs.map(column => Math.max(column.min, column.content))
  const widths = pref.slice()
  const target = Math.max(0, Math.floor(container))
  const indexes = (pick: (column: (typeof specs)[number]) => boolean) =>
    specs.map((column, index) => (pick(column) ? index : -1)).filter(index => index >= 0)
  const lockIdx = indexes(column => column.lock)
  const growIdx = indexes(column => column.grow)
  const fitIdx = indexes(column => !column.lock && !column.grow)
  const sumAt = (list: number[], chosen: number[]) => chosen.reduce((total, index) => total + list[index], 0)

  const lockW = sumAt(pref, lockIdx)
  const fitW = sumAt(pref, fitIdx)
  const growW = sumAt(pref, growIdx)
  const fitMin = sumAt(specs.map(column => column.min), fitIdx)
  const growMin = sumAt(specs.map(column => column.min), growIdx)

  if (target >= lockW + fitW + growW) {
    const receivers = growIdx.length ? growIdx : (fitIdx.length ? fitIdx : lockIdx)
    share(widths, receivers, leftoverWeight(specs, receivers), target - lockW - fitW - growW)
    return widths
  }

  const budget = target - lockW
  if (budget >= fitW + growMin) {
    growIdx.forEach(index => { widths[index] = specs[index].min })
    share(widths, growIdx, slackWeight(specs, pref, growIdx), budget - fitW - growMin)
    return widths
  }

  if (budget >= fitMin + growMin) {
    growIdx.forEach(index => { widths[index] = specs[index].min })
    fitIdx.forEach(index => { widths[index] = specs[index].min })
    share(widths, fitIdx, slackWeight(specs, pref, fitIdx), budget - growMin - fitMin)
    return widths
  }

  fitIdx.forEach(index => { widths[index] = specs[index].min })
  growIdx.forEach(index => { widths[index] = specs[index].min })
  return widths
}

/**
 * 分配和 assignColumnWidths 一样，只多一条兜底：容器连各列下限都放不下时，
 * 按比例把列压进容器宽里——单元格本来就是省略号截字，宁可截一点也不出横向滚动条。
 */
export function fitColumnWidths(columns: readonly ColumnFit[], container: number): number[] {
  const widths = assignColumnWidths(columns, container)
  const target = Math.max(0, Math.floor(container))
  const total = widths.reduce((sum, width) => sum + width, 0)
  if (total <= target || total === 0) return widths
  const floor = 24
  const scaled = widths.map(width => Math.max(floor, Math.floor(width * target / total)))
  let rest = target - scaled.reduce((sum, width) => sum + width, 0)
  if (rest > 0) {
    const order = scaled.map((width, index) => ({ width, index })).sort((left, right) => right.width - left.width).map(item => item.index)
    let at = 0
    while (rest > 0 && order.length) {
      scaled[order[at % order.length]] += 1
      rest -= 1
      at += 1
    }
    return scaled
  }
  // 连下限的地板都顶破容器时（极窄的容器），从最宽的列开始往下削，直到塞进容器。
  while (rest < 0) {
    let widest = 0
    for (let index = 1; index < scaled.length; index += 1) {
      if (scaled[index] > scaled[widest]) widest = index
    }
    if (scaled[widest] <= 1) break
    scaled[widest] -= 1
    rest += 1
  }
  return scaled
}

function leftoverWeight(specs: { min: number; content: number }[], indexes: number[]): number[] {
  return indexes.map(index => Math.max(0, specs[index].content - specs[index].min))
}

function slackWeight(specs: { min: number }[], pref: number[], indexes: number[]): number[] {
  return indexes.map(index => Math.max(0, pref[index] - specs[index].min))
}

function share(widths: number[], indexes: number[], weights: number[], amount: number): void {
  if (!indexes.length || amount <= 0) return
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let left = amount
  indexes.forEach((index, order) => {
    const last = order === indexes.length - 1
    const portion = total <= 0
      ? Math.floor(amount / indexes.length)
      : Math.floor(amount * weights[order] / total)
    const given = last ? left : portion
    widths[index] += given
    left -= given
  })
}
