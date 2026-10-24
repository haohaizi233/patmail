import { createApp, h, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import FilingExportPanel from '../src/app/components/FilingExportPanel.vue'
import { MessageType, type ContentResponse, type MessageBridge } from '../src/shared/message'

/** 组件挂载测试：把「查询按钮点得动」钉住。上次就栽在可选布尔 prop 不传被 Vue 转成 false，查询静默不发。 */

const userId = '227BFA59-A8A7-4EC6-928D-50FB5C29F960'

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function fakeBridge(calls: unknown[]): MessageBridge {
  return {
    request: async (message): Promise<ContentResponse> => {
      calls.push(message)
      if (message.type === MessageType.SearchFiling) {
        return {
          type: MessageType.SearchFilingResult,
          payload: { ok: true, data: { items: [], total: 0, pageIndex: 1, pageSize: 20, totalPages: 0 } }
        }
      }
      return { type: MessageType.Error, payload: { message: '这个测试不接这个请求。' } }
    }
  }
}

function mountPanel(bridge: MessageBridge, throughProp: boolean): { host: HTMLElement; app: App } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({
    render: () => h(FilingExportPanel, { bridge: throughProp ? bridge : undefined, userId })
  })
  app.directive('hint', {})
  if (!throughProp) app.provide('bridge', bridge)
  app.mount(host)
  return { host, app }
}

function buttonOf(host: HTMLElement, label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.trim() === label)
  if (!button) throw new Error(`没有「${label}」按钮。`)
  return button
}

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

/** 走通「查询 → 勾选 → 导出」整条链：查询结果一行，流程历史一次退回，部门按人去重读一次。 */
function exportBridge(calls: unknown[]): MessageBridge {
  const row = {
    filingId: '6739422c-a570-48a4-900a-f3a4ea2da689', caseId: '', procId: '', caseVolume: 'PA261111285CND',
    caseName: '', customerName: '', customerCode: '', applyType: '', ctrlProc: '', intDueDate: '',
    filingDate: '2026-10-22', caseType: '', branchDept: '', createUser: '', createTime: '',
    flowStatus: '', flowDirection: 'IO', appNo: '', customerVolume: '', appDate: '', caseStatus: '审定'
  }
  const flow = [
    { nodeName: '同案人意见审核', auditUserId: userId, auditUserName: '余佳希', auditType: '退回', auditTime: '', remark: '没有盖章' },
    { nodeName: '启动流程', auditUserId: userId, auditUserName: '刘斌斌', auditType: '提交', auditTime: '', remark: '' }
  ]
  return {
    request: async (message): Promise<ContentResponse> => {
      calls.push(message)
      const type = (message as { type?: string }).type
      if (type === MessageType.SearchFiling) {
        return { type: MessageType.SearchFilingResult, payload: { ok: true, data: { items: [row], total: 1, pageIndex: 1, pageSize: 20, totalPages: 1 } } }
      }
      if (type === MessageType.ReadFilingFlow) {
        return { type: MessageType.ReadFilingFlowResult, payload: { ok: true, data: flow } }
      }
      if (type === MessageType.ReadUserInfo) {
        return { type: MessageType.ReadUserInfoResult, payload: { ok: true, data: { userId, cnName: '刘斌斌', deptFullName: '电学三部', email: '', tel: '' } } }
      }
      return { type: MessageType.Error, payload: { message: '这个测试不接这个请求。' } }
    }
  }
}

describe('递交查询面板的查询按钮', () => {
  beforeEach(() => {
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub
    document.body.innerHTML = ''
  })
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('通道从 prop 传进来时，查询按钮可用，点了就发查询', async () => {
    const calls: unknown[] = []
    const { host, app } = mountPanel(fakeBridge(calls), true)
    await nextTick()
    const search = buttonOf(host, '查询')
    expect(search.disabled).toBe(false)
    search.click()
    await nextTick()
    expect(calls.some(item => (item as { type?: string }).type === MessageType.SearchFiling)).toBe(true)
    app.unmount()
    host.remove()
  })

  it('通道只靠注入也能查，不传 prop 就哑掉', async () => {
    const calls: unknown[] = []
    const { host, app } = mountPanel(fakeBridge(calls), false)
    await nextTick()
    const search = buttonOf(host, '查询')
    expect(search.disabled).toBe(false)
    search.click()
    await nextTick()
    expect(calls.some(item => (item as { type?: string }).type === MessageType.SearchFiling)).toBe(true)
    app.unmount()
    host.remove()
  })

  it('没有通道时点查询给出提示，不再一声不吭', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const app = createApp({ render: () => h(FilingExportPanel, { userId }) })
    app.directive('hint', {})
    app.mount(host)
    await nextTick()
    buttonOf(host, '查询').click()
    await nextTick()
    expect(host.textContent).toContain('页面通信不可用')
    app.unmount()
    host.remove()
  })

  it('点「导出 Excel」取完数直接出文件，不用再点第二次', async () => {
    const calls: unknown[] = []
    const saved: string[] = []
    const globalUrl = URL as unknown as { createObjectURL?: unknown; revokeObjectURL?: unknown }
    globalUrl.createObjectURL = () => 'blob:patmail-test'
    globalUrl.revokeObjectURL = () => {}
    const anchorClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement): void {
      saved.push(this.download)
    }
    try {
      const { host, app } = mountPanel(exportBridge(calls), true)
      await settle()
      buttonOf(host, '查询').click()
      await settle()
      buttonOf(host, '全选本页').click()
      await nextTick()
      buttonOf(host, '导出 Excel').click()
      await settle()
      expect(calls.some(item => (item as { type?: string }).type === MessageType.ReadFilingFlow)).toBe(true)
      expect(saved.some(name => name.startsWith('递交管理-已完成导出-'))).toBe(true)
      app.unmount()
      host.remove()
    } finally {
      HTMLAnchorElement.prototype.click = anchorClick
    }
  })

  it('全选所有按页拉取，边拉边计数，不再一口气卡住界面', async () => {
    const calls: Array<{ type?: string; payload?: { query?: { pageIndex?: number; pageSize?: number } } }> = []
    const rowOf = (id: string) => ({
      filingId: id, caseId: '', procId: '', caseVolume: `PA-${id}`, caseName: '', customerName: '', customerCode: '',
      applyType: '', ctrlProc: '', intDueDate: '', filingDate: '2026-10-22', caseType: '', branchDept: '', createUser: '',
      createTime: '', flowStatus: '', flowDirection: 'IO', appNo: '', customerVolume: '', appDate: '2026-10-22', caseStatus: '审定'
    })
    const bridge: MessageBridge = {
      request: async (message): Promise<ContentResponse> => {
        calls.push(message as { type?: string })
        const type = (message as { type?: string }).type
        const query = (message as { payload?: { query?: { pageIndex?: number; pageSize?: number } } }).payload?.query
        if (type === MessageType.SearchFiling) {
          const page = query?.pageIndex ?? 1
          const size = query?.pageSize ?? 20
          const rows = Array.from({ length: page === 3 ? 50 : 100 }, (_, index) => rowOf(`f-${page}-${index}`))
          return { type: MessageType.SearchFilingResult, payload: { ok: true, data: { items: rows, total: 250, pageIndex: page, pageSize: size, totalPages: Math.ceil(250 / size) } } }
        }
        return { type: MessageType.Error, payload: { message: '这个测试不接这个请求。' } }
      }
    }
    const { host, app } = mountPanel(bridge, true)
    await settle()
    buttonOf(host, '查询').click()
    await settle()
    buttonOf(host, '全选所有').click()
    await settle()
    expect(host.textContent).toContain('已选 250 件')
    const pages = calls.filter(item => item.type === MessageType.SearchFiling && item.payload?.query?.pageSize === 100)
    expect(pages.map(item => item.payload?.query?.pageIndex).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([1, 2, 3])
    app.unmount()
    host.remove()
  })
})
