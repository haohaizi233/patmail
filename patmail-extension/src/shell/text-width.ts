/**
 * 量字宽的尺子。同一段文字只量一次：量宽度要强制回流，翻页逐格量会把界面卡死。
 * 优先用 canvas 量（不逼浏览器排版），拿不到 canvas 时退回离屏 span。
 */

export interface TextRuler {
  width(text: string, source: Element | null): number
  dispose(): void
}

export function createTextRuler(): TextRuler {
  let context: CanvasRenderingContext2D | null = null
  try {
    context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  } catch {
    context = null
  }
  let span: HTMLSpanElement | null = null
  const widths = new Map<string, number>()

  const ensureSpan = (): HTMLSpanElement | null => {
    if (span || typeof document === 'undefined') return span
    span = document.createElement('span')
    span.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden;pointer-events:none;'
    document.body.appendChild(span)
    return span
  }

  return {
    width(text: string, source: Element | null): number {
      if (!source) return 0
      const value = String(text ?? '')
      const font = getComputedStyle(source).font
      const key = `${font}\u0000${value}`
      const hit = widths.get(key)
      if (hit !== undefined) return hit
      let width: number
      if (context) {
        context.font = font || '13px sans-serif'
        width = Math.ceil(context.measureText(value).width) + 2
      } else {
        const ruler = ensureSpan()
        if (!ruler) return 0
        ruler.style.font = font
        ruler.textContent = value
        width = Math.ceil(ruler.offsetWidth) + 2
      }
      widths.set(key, width)
      return width
    },
    dispose(): void {
      span?.remove()
      span = null
      widths.clear()
    }
  }
}
