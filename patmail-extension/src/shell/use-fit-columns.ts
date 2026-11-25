import { computed, onBeforeUnmount, ref, watch, type CSSProperties, type ComputedRef, type Ref, type WatchSource } from 'vue'
import { assignColumnWidths, autoColumnModes, fitColumnWidths, type ColumnFit, type ColumnFitMode } from './column-fit'
import { createTextRuler, type TextRuler } from './text-width'

export interface FitColumnDefinition {
  title: string
  values: readonly string[]
  mode?: ColumnFitMode
  fixedWidth?: number
}

export interface FitColumnsContext {
  header: Element | null
  cell: Element | null
  headerPad: number
  cellPad: number
  container: number
  ruler: TextRuler
  measure: (title: string, values: readonly string[], mode?: ColumnFitMode) => ColumnFit
}

export interface UseFitColumnsOptions {
  host: Ref<HTMLElement | null>
  columns: (ctx: FitColumnsContext) => readonly ColumnFit[] | readonly FitColumnDefinition[]
  watchSource: WatchSource<unknown> | WatchSource<unknown>[]
  noHorizontalScroll?: boolean
  autoMode?: boolean
  cellSelector?: string
}

export interface UseFitColumnsResult {
  colWidths: Ref<number[]>
  tableStyle: ComputedRef<CSSProperties | undefined>
  layout: () => void
}

function horizontalPad(el: Element | null, fallback = 16): number {
  if (!el || typeof getComputedStyle !== 'function') return fallback
  const style = getComputedStyle(el)
  const pad = Math.ceil((parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0))
  return pad > 0 ? pad : fallback
}

function isColumnFit(item: ColumnFit | FitColumnDefinition): item is ColumnFit {
  return 'min' in item && 'content' in item
}

/**
 * 统一的表格自适应列宽标准：
 * - 动态测量表头和单元格文字宽度及真实水平内边距；
 * - 监听宿主容器尺寸变化（含动态挂载/卸载的弹窗）与数据变化；
 * - 默认严格收进容器宽度不出横向滚动条（fitColumnWidths），溢出文本交由省略号与 v-hint.clip 悬停展示。
 */
export function useFitColumns(options: UseFitColumnsOptions): UseFitColumnsResult {
  const colWidths = ref<number[]>([])
  const ruler = createTextRuler()
  let observer: ResizeObserver | undefined

  const disconnectObserver = (): void => {
    observer?.disconnect()
    observer = undefined
  }

  const layout = (): void => {
    const root = options.host.value
    const table = root?.querySelector('table')
    if (!root || !table) return
    const container = root.clientWidth
    if (container <= 0) return

    const header = table.querySelector('thead th') || table
    const cell = table.querySelector(options.cellSelector ?? 'tbody td') || header
    const headerPad = horizontalPad(header)
    const cellPad = horizontalPad(cell)

    const measure = (title: string, values: readonly string[], mode?: ColumnFitMode): ColumnFit => {
      const min = ruler.width(title, header) + headerPad
      let content = min
      for (const value of values) {
        content = Math.max(content, ruler.width(value, cell) + cellPad)
      }
      return {
        min,
        content,
        lock: mode === 'lock',
        grow: mode === 'grow',
      }
    }

    const raw = options.columns({
      header,
      cell,
      headerPad,
      cellPad,
      container,
      ruler,
      measure,
    })

    if (!raw.length) {
      colWidths.value = []
      return
    }

    const explicitModes: ColumnFitMode[] = []
    const specs: ColumnFit[] = raw.map(item => {
      if (isColumnFit(item)) {
        explicitModes.push(item.lock ? 'lock' : item.grow ? 'grow' : undefined)
        return item
      }
      if (item.fixedWidth !== undefined) {
        explicitModes.push('lock')
        return { min: item.fixedWidth, content: item.fixedWidth, lock: true, grow: false }
      }
      explicitModes.push(item.mode)
      return measure(item.title, item.values, item.mode)
    })

    const finalSpecs = options.autoMode
      ? autoColumnModes(specs, container, explicitModes)
      : specs

    const preventHorizontalScroll = options.noHorizontalScroll !== false
    colWidths.value = preventHorizontalScroll
      ? fitColumnWidths(finalSpecs, container)
      : assignColumnWidths(finalSpecs, container)
  }

  const tableStyle = computed<CSSProperties | undefined>(() => {
    if (!colWidths.value.length) return undefined
    if (options.noHorizontalScroll !== false) {
      return { width: '100%' }
    }
    const total = colWidths.value.reduce((sum, width) => sum + width, 0)
    return { width: `${total}px`, minWidth: '100%' }
  })

  watch(
    options.host,
    (el) => {
      disconnectObserver()
      if (!el) {
        colWidths.value = []
        return
      }
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => layout())
        observer.observe(el)
      }
      layout()
    },
    { flush: 'post', immediate: true },
  )

  const sources = Array.isArray(options.watchSource) ? options.watchSource : [options.watchSource]
  watch(sources, () => layout(), { flush: 'post' })

  onBeforeUnmount(() => {
    disconnectObserver()
    ruler.dispose()
  })

  return {
    colWidths,
    tableStyle,
    layout,
  }
}
