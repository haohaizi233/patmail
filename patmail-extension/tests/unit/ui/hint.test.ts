import { describe, expect, it } from 'vitest'
import { isTextClipped, visibleHint } from '../../../src/shell/components/hint'

describe('悬停气泡', () => {
  it('写明的说明一直显示', () => {
    expect(visibleHint('http://183.36.43.44:88', '中小客户', false, false)).toBe('http://183.36.43.44:88')
  })

  it('被截断的全文才弹出，完整可见时不重复', () => {
    expect(visibleHint('专利权终止通知书.pdf', '专利权终止通知书.pdf', true, true)).toBe('专利权终止通知书.pdf')
    expect(visibleHint('案件联系人', '案件联系人', true, false)).toBe('')
  })

  it('截断模式没另写句子时，用元素上的文字', () => {
    expect(visibleHint('', '广汽丰田汽车有限公司', true, true)).toBe('广汽丰田汽车有限公司')
    expect(visibleHint('', '广汽丰田', true, false)).toBe('')
  })

  it('检测元素自身或子元素文字截断', () => {
    const parent = document.createElement('li')
    const child = document.createElement('span')
    child.className = 'picked-name'
    parent.appendChild(child)

    // 未溢出
    Object.defineProperty(parent, 'scrollWidth', { value: 100, configurable: true })
    Object.defineProperty(parent, 'clientWidth', { value: 100, configurable: true })
    Object.defineProperty(child, 'scrollWidth', { value: 80, configurable: true })
    Object.defineProperty(child, 'clientWidth', { value: 80, configurable: true })
    expect(isTextClipped(parent)).toBe(false)
    expect(isTextClipped(child)).toBe(false)

    // 子元素溢出省略
    Object.defineProperty(child, 'scrollWidth', { value: 200, configurable: true })
    Object.defineProperty(child, 'clientWidth', { value: 80, configurable: true })
    expect(isTextClipped(child)).toBe(true)
    expect(isTextClipped(parent)).toBe(true)
  })
})
