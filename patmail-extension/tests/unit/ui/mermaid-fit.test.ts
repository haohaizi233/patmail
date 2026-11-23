import { describe, expect, it } from 'vitest'
import {
  computeFitWidth,
  computeFitWindow,
  MAX_INLINE_FIT_SCALE,
  MAX_INTERACTIVE_FIT_SCALE,
} from '../../../src/app/docs/mermaid-fit'

describe('Mermaid 图表自适应缩放上限', () => {
  it('窄图在文档内联时限制最大缩放为 100% 并水平居中', () => {
    const result = computeFitWidth(900, 260, MAX_INLINE_FIT_SCALE)
    expect(result).toEqual({
      scale: 1,
      x: (900 - 260) / 2,
      y: 16,
    })
  })

  it('宽图在文档内联时按可用宽度等比缩小并保留 16px 左右边距', () => {
    const result = computeFitWidth(832, 1600, MAX_INLINE_FIT_SCALE)
    expect(result).toEqual({
      scale: 0.5,
      x: 16,
      y: 16,
    })
  })

  it('放大查看弹窗中对小图限制最大自适应缩放为 125%，大图照常缩小居中', () => {
    const smallWidth = computeFitWidth(1200, 200, MAX_INTERACTIVE_FIT_SCALE)
    expect(smallWidth).toEqual({
      scale: 1.25,
      x: (1200 - 250) / 2,
      y: 16,
    })

    const smallWindow = computeFitWindow(1200, 800, 200, 300)
    expect(smallWindow).toEqual({
      scale: 1.25,
      x: (1200 - 250) / 2,
      y: (800 - 375) / 2,
    })

    const largeWindow = computeFitWindow(1032, 832, 2000, 800)
    expect(largeWindow).toEqual({
      scale: 0.5,
      x: (1032 - 1000) / 2,
      y: (832 - 400) / 2,
    })
  })

  it('容器或图表尺寸无效时返回 null 避免异常计算', () => {
    expect(computeFitWidth(32, 200, MAX_INLINE_FIT_SCALE)).toBeNull()
    expect(computeFitWidth(800, 0, MAX_INLINE_FIT_SCALE)).toBeNull()
    expect(computeFitWidth(800, 200, 0)).toBeNull()
    expect(computeFitWindow(0, 600, 200, 300)).toBeNull()
    expect(computeFitWindow(800, 600, -1, 300)).toBeNull()
  })
})
