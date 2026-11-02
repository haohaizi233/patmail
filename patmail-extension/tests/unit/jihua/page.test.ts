import { createApp, nextTick, type App } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JihuaUploadPage from '../../../src/app/pages/JihuaUploadPage.vue'
import type { DialogOptions } from '../../../src/app/dialog'
import type { InventoryResult, ScanDirectoryOptions } from '../../../src/jihua/inventory'
import type { JihuaTask, JihuaTransport, LocalDirectoryHandle, LocalFileHandle, Material, SourceRoot } from '../../../src/jihua/types'

const rig = vi.hoisted(() => ({
  task: null as JihuaTask | null,
  roots: [] as SourceRoot[],
  history: new Map<string, JihuaTask>(),
  runRunner: vi.fn(async () => {}),
  cancelRunner: vi.fn(),
  repository: {
    load: vi.fn(async () => rig.task),
    save: vi.fn(async (task: JihuaTask) => { rig.task = task }),
    putRoot: vi.fn(async (root: SourceRoot) => { rig.roots.push(root) }),
    getRoots: vi.fn(async () => rig.roots),
    putFile: vi.fn(async (_id: string, _handle: LocalFileHandle) => {}),
    getFile: vi.fn(async (_id: string): Promise<LocalFileHandle | undefined> => undefined),
    clear: vi.fn(async () => { rig.task = null; rig.roots = [] }),
    archiveAndCreate: vi.fn(async (_expectedId: string | null, next: JihuaTask) => {
      if (rig.task) rig.history.set(rig.task.id, rig.task)
      rig.task = next
    }),
    listHistory: vi.fn(async () => [...rig.history.values()].map(task => ({
      id: task.id, createdAt: task.createdAt, updatedAt: task.updatedAt, status: task.status,
      rowCount: task.rows.length, unconfirmedCount: task.rows.filter(row => row.intent?.sent && !row.receipt).length
    }))),
    findArchivedUploads: vi.fn(async (_rows: JihuaTask['rows']): Promise<JihuaTask['rows']> => []),
    restoreTask: vi.fn(async (id: string, _expectedId: string | null) => {
      const previous = rig.history.get(id)!
      if (rig.task) rig.history.set(rig.task.id, rig.task)
      rig.history.delete(id)
      rig.task = { ...previous, status: previous.status === 'cancelled' ? 'paused' : previous.status }
      return rig.task
    })
  },
  scanDirectory: vi.fn(async (_root: SourceRoot, _options?: ScanDirectoryOptions): Promise<InventoryResult> => { throw new Error('unexpected scan') }),
  mergeInventory: vi.fn((_task: JihuaTask, _result: InventoryResult, _root: SourceRoot): JihuaTask => { throw new Error('unexpected merge') }),
  createJihuaTask: vi.fn((): JihuaTask => { throw new Error('unexpected task creation') }),
  listJihuaTabs: vi.fn(async (): Promise<Array<{ id: number; title: string }>> => []),
  connectJihuaTab: vi.fn(async (_tabId: number): Promise<JihuaTransport> => { throw new Error('unexpected connect') }),
  confirmDialog: vi.fn(async (_options: DialogOptions) => true),
  events: [] as string[]
}))

vi.mock('../../../src/jihua/repository', () => ({ createJihuaRepository: () => rig.repository }))
vi.mock('../../../src/jihua/inventory', () => ({
  scanDirectory: rig.scanDirectory,
  mergeInventory: rig.mergeInventory,
  createJihuaTask: rig.createJihuaTask
}))
vi.mock('../../../src/jihua/materials', () => ({
  MATERIALS: [{ key: 'APPLY_FILE', label: '申请文件', types: ['INVENTION'], limit: 10 }],
  materialByKey: (key: string) => key === 'APPLY_FILE'
    ? { key: 'APPLY_FILE', label: '申请文件', types: ['INVENTION'], limit: 10 }
    : undefined,
  materialForType: (material: unknown) => material
}))
vi.mock('../../../src/jihua/transport', () => ({
  listJihuaTabs: rig.listJihuaTabs,
  connectJihuaTab: rig.connectJihuaTab
}))
vi.mock('../../../src/shell/components/PageHead.vue', () => ({
  default: { props: ['title', 'desc', 'art'], template: '<header class="test-page-head"><h1>{{ title }}</h1><slot /></header>' }
}))
vi.mock('../../../src/shell/assets', () => ({ bg: (name: string) => `/assets/${name}` }))
vi.mock('../../../src/jihua/runner', () => ({
  JihuaRunner: class {
    run = rig.runRunner
    cancel = rig.cancelRunner
    pause = vi.fn()
    constructor() {}
  }
}))
vi.mock('../../../src/app/dialog', () => ({ confirmDialog: rig.confirmDialog }))

let app: App | undefined
let host: HTMLDivElement | undefined

function mount(): void {
  app = createApp(JihuaUploadPage)
  host = document.body.appendChild(document.createElement('div'))
  app.mount(host)
}

async function settle(): Promise<void> {
  for (let index = 0; index < 40; index++) {
    await Promise.resolve()
    await nextTick()
  }
}

function button(label: string): HTMLButtonElement | undefined {
  return [...(host?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find(item => item.textContent?.trim() === label)
}

function taskWithRows(rows: JihuaTask['rows']): JihuaTask {
  const now = Date.now()
  return {
    id: 'task-1', createdAt: now, updatedAt: now, status: 'paused', roots: [], rows,
    scannedFiles: rows.length, excludedFiles: 0, errors: []
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('CSS', { escape: (value: string) => value })
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  rig.task = null
  rig.roots = []
  rig.history.clear()
  rig.runRunner.mockReset().mockResolvedValue(undefined)
  rig.cancelRunner.mockReset()
  rig.events = []
  rig.repository.load.mockImplementation(async () => rig.task)
  rig.repository.findArchivedUploads.mockResolvedValue([])
  rig.repository.save.mockImplementation(async task => { rig.events.push('save'); rig.task = task })
  rig.repository.putRoot.mockImplementation(async root => { rig.events.push('root'); rig.roots.push(root) })
  rig.repository.getRoots.mockImplementation(async () => rig.roots)
  rig.repository.putFile.mockImplementation(async () => { rig.events.push('file') })
  rig.repository.clear.mockImplementation(async () => { rig.task = null; rig.roots = [] })
  rig.scanDirectory.mockReset()
  rig.mergeInventory.mockReset()
  rig.createJihuaTask.mockReset()
  rig.listJihuaTabs.mockReset().mockResolvedValue([])
  rig.connectJihuaTab.mockReset()
  rig.confirmDialog.mockReset().mockResolvedValue(true)
  vi.stubGlobal('showDirectoryPicker', undefined)
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: { request: vi.fn(async (_name: string, _options: unknown, callback: (lock: object) => unknown) => callback({ name: 'fixture' })) }
  })
})

afterEach(() => {
  app?.unmount()
  app = undefined
  host?.remove()
  host = undefined
  vi.unstubAllGlobals()
})

describe('Jihua upload workbench', () => {
  it('scans names only and persists root and file handles before saving the task', async () => {
    const getFile = vi.fn(async () => new File(['must not read during scan'], 'private.pdf'))
    const fileHandle: LocalFileHandle = {
      kind: 'file', name: '2024012345-案件-申请文件.pdf',
      getFile
    }
    const directory: LocalDirectoryHandle = {
      kind: 'directory', name: '材料',
      async *values() { yield fileHandle }
    }
    const row: JihuaTask['rows'][number] = {
      id: '["root-1","2024012345-案件-申请文件.pdf"]', rootId: 'root-1', relativePath: fileHandle.name,
      fileName: fileHandle.name, extension: 'pdf', applicationNo: '2024012345', caseName: '案件', description: '申请文件',
      materialKey: 'APPLY_FILE', selected: false, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
    }
    const newTask = taskWithRows([])
    rig.createJihuaTask.mockReturnValue(newTask)
    rig.scanDirectory.mockResolvedValue({ rows: [row], files: new Map([[row.id, fileHandle]]), scannedFiles: 1, excludedFiles: 0, errors: [] })
    const archivedIntent = { requestId: 'retained-upload', sessionKey: 'owner', tabId: 1, documentId: 'doc-1', sent: true }
    rig.repository.findArchivedUploads.mockResolvedValue([{ ...row, selected: true, intent: archivedIntent }])
    rig.mergeInventory.mockImplementation((task: JihuaTask, result: { rows: JihuaTask['rows'] }, root: { id: string; name: string }) => ({
      ...task, roots: [{ id: root.id, name: root.name }], rows: result.rows, status: 'ready'
    }))
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => directory))

    mount()
    await settle()
    button('添加文件夹')?.click()
    await settle()

    expect(rig.scanDirectory).toHaveBeenCalledOnce()
    expect(getFile).not.toHaveBeenCalled()
    expect(rig.events).toEqual(['root', 'file', 'save'])
    expect(rig.task?.rows).toHaveLength(1)
    expect(rig.repository.findArchivedUploads).toHaveBeenCalledOnce()
    expect(rig.task?.rows[0]?.intent).toEqual(archivedIntent)
    expect(rig.task?.rows[0]?.selected).toBe(false)
  })

  it('persists local row edits before merging a rescan and drops overrides for files absent from that scan', async () => {
    const fileHandle: LocalFileHandle = { kind: 'file', name: '2024012345-案件-申请文件.pdf', getFile: vi.fn(async () => new File([], 'unused.pdf')) }
    const directory: LocalDirectoryHandle = {
      kind: 'directory', name: 'source', async *values() { yield fileHandle },
      isSameEntry: vi.fn(async () => true)
    }
    const row = {
      id: 'row-present', rootId: 'root-1', relativePath: fileHandle.name, fileName: fileHandle.name, extension: 'pdf',
      applicationNo: '2024012345', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE', selected: false,
      status: 'pending' as const, error: '', attempts: 0, updatedAt: Date.now()
    }
    const absent = { ...row, id: 'row-absent', relativePath: 'old/2024012346-另一案件-申请文件.pdf', fileName: '2024012346-另一案件-申请文件.pdf', applicationNo: '2024012346' }
    rig.task = { ...taskWithRows([row, absent]), roots: [{ id: 'root-1', name: 'source' }] }
    rig.roots = [{ id: 'root-1', name: 'source', handle: directory }]
    rig.scanDirectory.mockResolvedValue({ rows: [row], files: new Map([[row.id, fileHandle]]), scannedFiles: 1, excludedFiles: 0, errors: [] })
    rig.mergeInventory.mockImplementation((base: JihuaTask, result: { rows: JihuaTask['rows'] }, root: { id: string; name: string }) => ({
      ...base,
      roots: [{ id: root.id, name: root.name }],
      rows: base.rows.map(old => {
        const fresh = result.rows.find(item => item.id === old.id)
        return fresh ? { ...old, ...fresh, selected: old.selected, materialKey: old.materialKey } : old
      })
    }))
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => directory))

    mount()
    await settle()
    const checkboxes = host?.querySelectorAll<HTMLInputElement>('.jh-file-row input[type="checkbox"]')
    checkboxes?.[0]?.click()
    checkboxes?.[1]?.click()
    await settle()
    host?.querySelector<HTMLButtonElement>('.jh-file-row .theme-select-trigger')?.click()
    await settle()
    const clearMaterial = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
      .find(option => option.textContent?.trim() === '选择材料')
    clearMaterial?.click()
    await settle()
    button('添加文件夹')?.click()
    await settle()

    expect(rig.mergeInventory).toHaveBeenCalledOnce()
    expect(rig.mergeInventory.mock.calls[0]?.[0].rows[0]?.selected).toBe(true)
    expect(rig.task?.rows.find(item => item.id === 'row-present')?.selected).toBe(true)
    expect(rig.task?.rows.find(item => item.id === 'row-present')?.materialKey).toBe('')
    expect(rig.task?.rows.find(item => item.id === 'row-absent')?.selected).toBe(false)
  })

  it('limits the file table to 50 stable rows per page', async () => {
    const rows: JihuaTask['rows'] = Array.from({ length: 63 }, (_, index) => ({
      id: `row-${index}`, rootId: 'root-1', relativePath: `folder/${index}.pdf`, fileName: `${index}.pdf`, extension: 'pdf',
      applicationNo: '2024012345', caseName: '示例案件', description: '申请文件', materialKey: 'APPLY_FILE',
      selected: false, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
    }))
    rig.task = taskWithRows(rows)

    mount()
    await settle()

    expect(host?.querySelectorAll('.jh-file-row')).toHaveLength(50)
    button('下一页')?.click()
    await settle()
    expect(host?.querySelectorAll('.jh-file-row')).toHaveLength(13)
    expect(host?.textContent).toContain('第 2 / 2 页')
  })

  it('uses the shared kawaii selectors and the workflow-local page title', async () => {
    rig.task = taskWithRows([{
      id: 'row-theme', rootId: 'root-1', relativePath: 'docs/2024012345-案件-申请文件.pdf', fileName: '2024012345-案件-申请文件.pdf',
      extension: 'pdf', applicationNo: '2024012345', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE',
      selected: false, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
    }])

    mount()
    await settle()

    expect(host?.querySelector('.test-page-head h1')?.textContent).toBe('计划实验室-文件导入')
    expect(host?.querySelector('.jh-back')?.textContent).toBe('回到工作流')
    expect(host?.querySelectorAll('select')).toHaveLength(0)
    expect(host?.querySelectorAll('.theme-select-trigger')).toHaveLength(4)
  })

  it('allows selecting an unrecognized row and explains its individual unmatched result', async () => {
    rig.task = taskWithRows([{
      id: 'row-unmatched', rootId: 'root-1', relativePath: 'docs/unknown.pdf', fileName: 'unknown.pdf', extension: 'pdf',
      applicationNo: '', caseName: '', description: '', materialKey: '', selected: false, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
    }])

    mount()
    await settle()
    const checkbox = host?.querySelector<HTMLInputElement>('.jh-file-row input[type="checkbox"]')
    expect(checkbox?.disabled).toBe(false)
    checkbox?.click()
    await settle()

    expect(host?.textContent).toContain('将单独标记为“没匹配到”')
  })

  it('keeps upload available for valid selected rows while warning about selected unmatched rows', async () => {
    const rows: JihuaTask['rows'] = [
      {
        id: 'row-valid', rootId: 'root-1', relativePath: 'docs/2024012345-案件-申请文件.pdf', fileName: '2024012345-案件-申请文件.pdf',
        extension: 'pdf', applicationNo: '2024012345', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE',
        selected: true, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
      },
      {
        id: 'row-unmatched', rootId: 'root-1', relativePath: 'docs/unknown.pdf', fileName: 'unknown.pdf', extension: 'pdf',
        applicationNo: '', caseName: '', description: '', materialKey: '', selected: true, status: 'pending', error: '申请号缺失', attempts: 0, updatedAt: Date.now()
      }
    ]
    rig.task = { ...taskWithRows(rows), status: 'ready', roots: [{ id: 'root-1', name: 'source' }] }
    rig.roots = [{ id: 'root-1', name: 'source', handle: { kind: 'directory', name: 'source', async *values(): AsyncGenerator<LocalFileHandle | LocalDirectoryHandle> {} } }]
    rig.listJihuaTabs.mockResolvedValue([{ id: 9, title: '季华平台' }])
    rig.connectJihuaTab.mockResolvedValue({
      session: { key: 'session-1', tabId: 9, documentId: 'doc-1', title: '季华平台' },
      checkSession: vi.fn(async () => {}),
      request: vi.fn(async () => ({})),
      upload: vi.fn(async (_file: File, _material: Material, _requestId: string, _beforeSend: () => Promise<void>) => ({})),
      receipt: vi.fn(async () => ({ state: 'missing' as const }))
    })

    mount()
    await settle()
    button('连接并检测登录')?.click()
    await settle()

    expect(host?.textContent).toContain('将单独标记为“没匹配到”')
    expect(host?.querySelector<HTMLButtonElement>('.jh-run-actions .solid')?.disabled).toBe(false)
  })

  it('exports folder, live selection, chosen material, status, errors, and receipt IDs in protected CSV', async () => {
    const row = {
      id: 'row-csv', rootId: 'root-1', relativePath: '=HYPERLINK("bad")/2024012345-案件-申请文件.pdf',
      fileName: '2024012345-案件-申请文件.pdf', extension: 'pdf', applicationNo: '2024012345', caseName: '案件',
      description: '申请文件', materialKey: 'APPLY_FILE', selected: false, status: 'failed' as const, error: '上传失败', attempts: 1,
      updatedAt: Date.now(), receipt: { attachments: [{ ID: 'attachment-7' }] }
    }
    rig.task = { ...taskWithRows([row]), roots: [{ id: 'root-1', name: 'source folder' }] }
    let exported: Blob | undefined
    vi.stubGlobal('URL', {
      createObjectURL: (blob: Blob) => { exported = blob; return 'blob:fixture' },
      revokeObjectURL: vi.fn()
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    mount()
    await settle()
    host?.querySelector<HTMLInputElement>('.jh-file-row input[type="checkbox"]')?.click()
    await settle()
    button('导出 CSV')?.click()
    await settle()

    const csvBytes = await new Promise<ArrayBuffer>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.readAsArrayBuffer(exported!)
    })
    const csv = new TextDecoder('utf-8', { ignoreBOM: true }).decode(csvBytes)
    expect(csv).toContain('\uFEFF"来源文件夹","相对路径","选中"')
    expect(csv).toContain('"source folder"')
    expect(csv).toContain('"是"')
    expect(csv).toContain('"申请文件"')
    expect(csv).toContain("'=HYPERLINK")
    expect(csv).toContain('"上传失败"')
    expect(csv).toContain('"attachment-7"')
  })

  it('requires explicit manual confirmation before clearing an unresolved upload intent', async () => {
    const unresolved = {
      id: 'row-unknown', rootId: 'root-1', relativePath: 'docs/uncertain.pdf', fileName: 'uncertain.pdf', extension: 'pdf',
      applicationNo: '2024012345', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE', selected: true,
      status: 'failed' as const, error: '回执等待中', attempts: 1, updatedAt: Date.now(),
      intent: { requestId: 'request-uncertain', sessionKey: 'session-1', tabId: 2, documentId: 'doc-1', sent: true }
    }
    const untouched = {
      id: 'row-untouched', rootId: 'root-1', relativePath: 'docs/other.pdf', fileName: 'other.pdf', extension: 'pdf',
      applicationNo: '2024012346', caseName: '另一案件', description: '申请文件', materialKey: 'APPLY_FILE', selected: false,
      status: 'pending' as const, error: '', attempts: 0, updatedAt: Date.now()
    }
    rig.task = taskWithRows([unresolved, untouched])

    mount()
    await settle()
    button('核实后重试')?.click()
    await settle()

    expect(rig.confirmDialog).toHaveBeenCalledOnce()
    const options = (rig.confirmDialog.mock.calls[0] as unknown as [Record<string, unknown>])[0]
    expect(options.message).toContain('可能产生重复附件')
    expect(options.confirmLabel).toBe('我已核实并接受重复风险')
    expect(rig.task?.rows[0]?.intent).toBeUndefined()
    expect(rig.task?.rows[0]?.status).toBe('pending')
    expect(rig.task?.rows[0]?.error).toContain('人工核实')
    expect(rig.task?.rows[1]).toMatchObject({ id: 'row-untouched', status: 'pending', selected: false })
  })

  it('archives unresolved intents and handles when starting a new task instead of trapping the workbench', async () => {
    rig.task = taskWithRows([{
      id: 'row-unknown', rootId: 'root-1', relativePath: 'docs/2024012345-案件-申请文件.pdf',
      fileName: '2024012345-案件-申请文件.pdf', extension: 'pdf', applicationNo: '2024012345', caseName: '案件',
      description: '申请文件', materialKey: 'APPLY_FILE', selected: true, status: 'failed', error: '回执等待中', attempts: 1,
      updatedAt: Date.now(), intent: { requestId: 'request-uncertain', sessionKey: 'session-1', tabId: 2, documentId: 'doc-1', sent: true }
    }, {
      id: 'row-receipt', rootId: 'root-1', relativePath: 'docs/receipt.pdf', fileName: 'receipt.pdf', extension: 'pdf',
      applicationNo: '2024012345', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE', selected: true,
      status: 'success', error: '', attempts: 1, updatedAt: Date.now(), receipt: { attachments: [{ ID: 'attached' }] }
    }])

    mount()
    await settle()
    expect(host?.querySelector<HTMLButtonElement>('.jh-file-row .theme-select-trigger')?.disabled).toBe(true)
    expect(host?.querySelectorAll<HTMLButtonElement>('.jh-file-row .theme-select-trigger')[1]?.disabled).toBe(true)
    expect(host?.querySelector<HTMLButtonElement>('.jh-row-recovery')?.disabled).toBe(false)
    const previous = rig.task
    rig.createJihuaTask.mockReturnValue({ ...taskWithRows([]), id: 'new-task', status: 'ready' })
    button('新建任务')?.click()
    await settle()

    expect(rig.repository.clear).not.toHaveBeenCalled()
    expect(rig.confirmDialog).toHaveBeenCalledOnce()
    expect(rig.confirmDialog.mock.calls[0]?.[0]).toMatchObject({ title: '保留当前任务并新建', confirmLabel: '保留并新建' })
    expect(rig.repository.archiveAndCreate).toHaveBeenCalledWith('task-1', expect.objectContaining({ id: 'new-task' }))
    expect(rig.task?.id).toBe('new-task')
    expect(rig.history.get(previous.id)?.rows).toMatchObject([
      { id: 'row-unknown', intent: { requestId: 'request-uncertain', sent: true } },
      { id: 'row-receipt', receipt: { attachments: [{ ID: 'attached' }] } }
    ])
    expect(host?.textContent).toContain('原任务已完整保留在历史中')
    expect(host?.querySelector('.jh-history-select .theme-select-trigger')?.textContent).toBeTruthy()
    host?.querySelector<HTMLButtonElement>('.jh-history-select .theme-select-trigger')?.click()
    await settle()
    ;[...document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent?.includes('待核对'))?.click()
    await settle()
    button('恢复任务')?.click()
    await settle()
    expect(rig.task?.id).toBe(previous.id)
    expect(rig.task?.rows[0]?.intent?.requestId).toBe('request-uncertain')
    expect(rig.history.has('new-task')).toBe(true)
  })

  it('recovers a stale running checkpoint and exposes cancel and new task controls', async () => {
    rig.task = { ...taskWithRows([]), status: 'running' }
    mount()
    await settle()
    expect(rig.task.status).toBe('paused')
    expect(button('新建任务')?.disabled).toBe(false)
    expect(button('取消任务')?.disabled).toBe(false)
    button('取消任务')?.click()
    await settle()
    expect(rig.task.status).toBe('cancelled')
    expect(button('新建任务')?.disabled).toBe(false)
    expect(button('刷新任务')?.disabled).toBe(false)
  })

  it('cancels a hung name scan and ignores its late completion before creating a new task', async () => {
    rig.task = taskWithRows([])
    const directory: LocalDirectoryHandle = { kind: 'directory', name: 'source', async *values() {} }
    vi.stubGlobal('showDirectoryPicker', vi.fn(async () => directory))
    let completeScan!: (value: InventoryResult) => void
    rig.scanDirectory.mockImplementation(() => new Promise(resolve => { completeScan = resolve }))
    rig.createJihuaTask.mockReturnValue({ ...taskWithRows([]), id: 'new-task', status: 'ready' })
    mount()
    await settle()
    button('添加文件夹')?.click()
    await settle()
    expect(rig.scanDirectory).toHaveBeenCalledOnce()
    expect(button('取消任务')?.disabled).toBe(false)
    button('取消任务')?.click()
    await settle()
    expect(rig.task.status).toBe('cancelled')
    expect(rig.scanDirectory.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    button('新建任务')?.click()
    await settle()
    expect(rig.task.id).toBe('new-task')
    completeScan({ rows: [], files: new Map(), scannedFiles: 99, excludedFiles: 0, errors: [] })
    await settle()
    expect(rig.task.id).toBe('new-task')
    expect(rig.mergeInventory).not.toHaveBeenCalled()
    expect(rig.repository.putFile).not.toHaveBeenCalled()
  })

  it('can abandon a stalled platform connection without locking task creation', async () => {
    rig.task = taskWithRows([])
    rig.listJihuaTabs.mockResolvedValue([{ id: 9, title: '季华平台' }])
    rig.connectJihuaTab.mockImplementation(() => new Promise(() => {}))
    rig.createJihuaTask.mockReturnValue({ ...taskWithRows([]), id: 'new-task', status: 'ready' })
    mount()
    await settle()
    button('连接并检测登录')?.click()
    await settle()
    expect(button('新建任务')?.disabled).toBe(false)
    button('新建任务')?.click()
    await settle()
    expect(rig.task.id).toBe('new-task')
    expect(button('添加文件夹')?.disabled).toBe(false)
  })

  it('allows cancelling an upload even after pause was requested and retains its uncertain intent', async () => {
    const row: JihuaTask['rows'][number] = {
      id: 'row-run', rootId: 'root-1', relativePath: 'notice.pdf', fileName: 'notice.pdf', extension: 'pdf',
      applicationNo: '2021100850612', caseName: '案件', description: '申请文件', materialKey: 'APPLY_FILE',
      selected: true, status: 'pending', error: '', attempts: 0, updatedAt: Date.now()
    }
    rig.task = { ...taskWithRows([row]), status: 'ready', roots: [{ id: 'root-1', name: 'source' }] }
    rig.roots = [{ id: 'root-1', name: 'source', handle: {
      kind: 'directory', name: 'source', queryPermission: async () => 'granted', async *values() {}
    } }]
    rig.listJihuaTabs.mockResolvedValue([{ id: 9, title: '季华平台' }])
    const stopWaiting = vi.fn()
    rig.connectJihuaTab.mockResolvedValue({
      session: { key: 'session-1', tabId: 9, documentId: 'doc-1', title: '季华平台' },
      checkSession: vi.fn(async () => {}), request: vi.fn(async () => ({})), upload: vi.fn(async () => ({})),
      receipt: vi.fn(async () => ({ state: 'missing' as const })), stopWaiting
    })
    let finishRun!: () => void
    rig.runRunner.mockImplementation(() => {
      row.intent = { requestId: 'sent-upload', sessionKey: 'session-1', tabId: 9, documentId: 'doc-1', sent: true }
      row.status = 'uploading'
      return new Promise(resolve => { finishRun = resolve })
    })
    rig.cancelRunner.mockImplementation(() => finishRun())
    mount()
    await settle()
    button('连接并检测登录')?.click()
    await settle()
    button('开始上传')?.click()
    await settle()
    expect(rig.runRunner).toHaveBeenCalledOnce()
    button('暂停上传')?.click()
    await settle()
    expect(button('取消任务')?.disabled).toBe(false)
    expect(button('新建任务')?.disabled).toBe(false)
    button('取消任务')?.click()
    await settle()
    expect(rig.cancelRunner).toHaveBeenCalledOnce()
    expect(stopWaiting).toHaveBeenCalledOnce()
    expect(rig.task.status).toBe('cancelled')
    expect(rig.task.rows[0]?.intent?.requestId).toBe('sent-upload')
    expect(button('新建任务')?.disabled).toBe(false)
  })
})
