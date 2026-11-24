import { afterEach, describe, expect, it } from 'vitest'
import { absorbNativeTitle, hintDirective, installHintHost, isTextClipped, visibleHint } from '../../../src/shell/components/hint'

afterEach(() => {
  document.body.innerHTML = ''
})

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

  it('封装层自动剥离原生 title 并用卡哇伊气泡替代展示', async () => {
    const icon = document.createElement('i')
    icon.textContent = '?'
    icon.setAttribute('title', '对应第一申请人信息中的行政区划')
    document.body.appendChild(icon)

    installHintHost(document)
    expect(icon.getAttribute('title')).toBeNull()
    expect(icon.dataset.patmailHint).toBe('对应第一申请人信息中的行政区划')

    icon.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const bubble = document.body.querySelector<HTMLElement>(':scope > .patmail-hint')
    expect(bubble?.hidden).toBe(false)
    expect(bubble?.textContent).toBe('对应第一申请人信息中的行政区划')

    icon.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(bubble?.hidden).toBe(true)

    // 后续动态添加带原生 title 的节点也会被 MutationObserver 自动吸收
    const dynamicBtn = document.createElement('button')
    dynamicBtn.setAttribute('title', '动态按钮说明')
    document.body.appendChild(dynamicBtn)
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(dynamicBtn.getAttribute('title')).toBeNull()
    expect(dynamicBtn.dataset.patmailHint).toBe('动态按钮说明')

    const frame = document.createElement('iframe')
    frame.title = '安全保留的 iframe 标题'
    absorbNativeTitle(frame)
    expect(frame.getAttribute('title')).toBe('安全保留的 iframe 标题')
  })

  it('未显式写 v-hint 的溢出 .clip 元素也能由封装层委托弹出卡哇伊气泡', () => {
    installHintHost(document)
    const span = document.createElement('span')
    span.className = 'clip'
    span.textContent = '深圳市世纪恒程知识产权代理事务所（超长截断全称）'
    Object.defineProperty(span, 'scrollWidth', { value: 320, configurable: true })
    Object.defineProperty(span, 'clientWidth', { value: 120, configurable: true })
    document.body.appendChild(span)

    span.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const bubble = document.body.querySelector<HTMLElement>(':scope > .patmail-hint')
    expect(bubble?.hidden).toBe(false)
    expect(bubble?.textContent).toBe('深圳市世纪恒程知识产权代理事务所（超长截断全称）')
  })

  it('v-hint 指令通过宿主委托弹出和隐藏气泡，支持普通模式、.clip 修饰符与卸载清理', () => {
    const tag = document.createElement('span')
    const child = document.createElement('b')
    child.textContent = 'PA2610021PCT'
    tag.appendChild(child)
    document.body.appendChild(tag)

    hintDirective.mounted(tag, { value: '文号详情：PA2610021PCT', modifiers: {} })
    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    const bubble = document.body.querySelector<HTMLElement>(':scope > .patmail-hint')
    expect(bubble?.hidden).toBe(false)
    expect(bubble?.textContent).toBe('文号详情：PA2610021PCT')

    hintDirective.updated(tag, { value: '更新后说明', modifiers: {} })
    child.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(bubble?.textContent).toBe('更新后说明')

    tag.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
    expect(bubble?.hidden).toBe(true)

    const clipEl = document.createElement('span')
    clipEl.className = 'clip'
    clipEl.textContent = '短名称'
    Object.defineProperty(clipEl, 'scrollWidth', { value: 80, configurable: true })
    Object.defineProperty(clipEl, 'clientWidth', { value: 80, configurable: true })
    document.body.appendChild(clipEl)

    hintDirective.mounted(clipEl, { value: '短名称', modifiers: { clip: true } })
    clipEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(bubble?.hidden).toBe(true)

    Object.defineProperty(clipEl, 'scrollWidth', { value: 240, configurable: true })
    clipEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    expect(bubble?.hidden).toBe(false)
    expect(bubble?.textContent).toBe('短名称')

    hintDirective.unmounted(clipEl)
    expect(bubble?.hidden).toBe(true)
    clipEl.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    // 卸载后 __hintDirective 已清空，但自身有 .clip 且溢出仍走原生委托兜底；移除 DOM 验证不再依赖实例监听器
    clipEl.remove()
  })
})
