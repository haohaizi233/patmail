import { createApp, h, nextTick, ref, type App } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import WDatePicker from '../../../src/shell/components/WDatePicker.vue'

/** 日期框挂载测试：期限监控和文件查询两张表的日期格都换成了这个组件，日历回填和手输都要落成原站格式。 */

const mounted: Array<{ host: HTMLElement; app: App }> = []

afterEach(() => {
  while (mounted.length) {
    const item = mounted.pop()
    if (!item) break
    item.app.unmount()
    item.host.remove()
  }
})

function mountPicker(options: { format?: 'yyyy-MM-dd' | 'MM-dd'; min?: string; max?: string; value?: string } = {}): {
  host: HTMLElement
  state: { value: string }
} {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const state = ref(options.value ?? '')
  const app = createApp({
    render: () => h(WDatePicker, {
      modelValue: state.value,
      format: options.format,
      min: options.min,
      max: options.max,
      'onUpdate:modelValue': (value: string) => { state.value = value }
    })
  })
  app.mount(host)
  mounted.push({ host, app })
  return { host, state }
}

function inputOf(host: HTMLElement): HTMLInputElement {
  const input = host.querySelector('input')
  if (!input) throw new Error('日期框没有输入框。')
  return input
}

function footButton(label: string): HTMLElement {
  const button = Array.from(document.querySelectorAll<HTMLElement>('.wdate-foot a')).find(item => item.textContent?.trim() === label)
  if (!button) throw new Error(`日历脚上没有「${label}」。`)
  return button
}

async function settle(): Promise<void> {
  for (let i = 0; i < 4; i += 1) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 2))
  }
}

function pad(part: number): string {
  return String(part).padStart(2, '0')
}

function todayText(format: 'yyyy-MM-dd' | 'MM-dd'): string {
  const now = new Date()
  const month = pad(now.getMonth() + 1)
  const day = pad(now.getDate())
  return format === 'MM-dd' ? `${month}-${day}` : `${now.getFullYear()}-${month}-${day}`
}

async function typeText(host: HTMLElement, text: string): Promise<void> {
  const input = inputOf(host)
  input.value = text
  input.dispatchEvent(new Event('input'))
  await settle()
  input.dispatchEvent(new Event('blur'))
  await settle()
}

describe('日期选择器', () => {
  it('点「今天」按 yyyy-MM-dd 回填', async () => {
    const { host, state } = mountPicker()
    inputOf(host).click()
    await settle()
    footButton('今天').click()
    await settle()
    expect(state.value).toBe(todayText('yyyy-MM-dd'))
  })

  it('format="MM-dd" 时回填和手输都只留月日', async () => {
    const { host, state } = mountPicker({ format: 'MM-dd' })
    inputOf(host).click()
    await settle()
    footButton('今天').click()
    await settle()
    expect(state.value).toBe(todayText('MM-dd'))

    await typeText(host, '03-14')
    expect(state.value).toBe('03-14')
  })

  it('默认格式下手输月日会被清掉，错格式也一样', async () => {
    const { host, state } = mountPicker()
    await typeText(host, '03-14')
    expect(state.value).toBe('')
    await typeText(host, '2026-13-40')
    expect(state.value).toBe('')
  })

  it('起止互限：范围外的日子点不上', async () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const min = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`
    const { host, state } = mountPicker({ min })
    inputOf(host).click()
    await settle()
    footButton('今天').click()
    await settle()
    expect(state.value).toBe('')
    expect(document.querySelectorAll('.wdate-grid a.is-disabled').length).toBeGreaterThan(0)
  })
})
