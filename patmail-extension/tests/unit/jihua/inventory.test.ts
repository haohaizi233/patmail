import { describe, expect, it, vi } from 'vitest'
import type { JihuaTask, LocalDirectoryHandle, LocalFileHandle, SourceRoot } from '../../../src/jihua/types'
import { createJihuaTask, mergeInventory, parseFileName, scanDirectory } from '../../../src/jihua/inventory'

function file(name: string): LocalFileHandle {
  return {
    kind: 'file',
    name,
    getFile: vi.fn(async () => { throw new Error('scan must not read file bytes') }),
  }
}

function directory(name: string, entries: Array<LocalDirectoryHandle | LocalFileHandle>): LocalDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries
    },
  }
}

function root(entries: Array<LocalDirectoryHandle | LocalFileHandle>): SourceRoot {
  return { id: 'root-1', name: 'source', handle: directory('source', entries) }
}

describe('Jihua filename parsing', () => {
  it('parses a real EASY filename with a normalized application number and a known suffix', () => {
    expect(parseFileName('CN2021.11140279.X-案件-第一次审查意见通知书.pdf')).toMatchObject({
      applicationNo: '202111140279X',
      caseName: '案件',
      description: '第一次审查意见通知书',
      extension: 'pdf',
      materialKey: 'REVIEW_NOTICE',
      error: '',
    })
  })

  it('preserves hyphens in the case name and recognizes the longer material suffix', () => {
    expect(parseFileName('2018109915521-辰星-一期-提案名称-技术交底书-修改版.docx')).toMatchObject({
      applicationNo: '2018109915521',
      caseName: '辰星-一期',
      description: '提案名称-技术交底书-修改版',
      materialKey: 'MODIFY_TECHNICAL_DISCLOSURE',
      extension: 'docx',
      error: '',
    })
  })

  it('parses the live-proven source aliases without losing hyphens in case names', () => {
    const cases = [
      ['递交文件合并档', 'PATENT_REQUEST'],
      ['费用减缴审批通知书', 'FEE_REDUCTION_APPROVAL_NOTICE'],
      ['手续合格通知书（著录项目变更）', 'COMPLIANCE_NOTICE'],
      ['实用新型专利证书(签章)', 'STATUS_RIGHT'],
      ['专利申请受理通知书(签章)', 'ACPT_NOTICE'],
      ['发明专利申请公布及进入实质审查阶段通知书', 'EXA_STAGE_NOTICE'],
    ] as const

    for (const [description, materialKey] of cases) {
      expect(parseFileName(`2018109915521-辰星-一期-${description}.pdf`)).toMatchObject({
        applicationNo: '2018109915521',
        caseName: '辰星-一期',
        description,
        materialKey,
        error: '',
      })
    }
  })

  it('falls back to the final hyphen for unknown descriptions and returns an error', () => {
    expect(parseFileName('2018109915521-辰星-一期-未登记材料.pdf')).toMatchObject({
      caseName: '辰星-一期',
      description: '未登记材料',
      materialKey: '',
    })
    expect(parseFileName('readme.pdf').error).toBeTruthy()
    expect(parseFileName('2018109915521-案件-第N次审查意见通知书.pdf').materialKey).toBe('REVIEW_NOTICE')
    expect(parseFileName('12345678X-案件-申请文件.pdf')).toMatchObject({
      applicationNo: '12345678X',
      materialKey: 'APPLY_FILE',
    })
    expect(parseFileName('12345678X-案件-申请文件.pdf').error).toMatch(/9位.*不支持自动传文/)
    expect(parseFileName('2018109915-案件-申请文件.pdf').error).toContain('申请号格式无效')
  })
})

describe('Jihua folder inventory', () => {
  it('recursively inventories only allowed extensions from names and stores their handles', async () => {
    const excluded = file('2018109915521-案件-申请文件.exe')
    const valid = file('2018109915521-案件-新申请文档.doc')
    const excludedGetFile = vi.spyOn(excluded, 'getFile')
    const validGetFile = vi.spyOn(valid, 'getFile')
    const result = await scanDirectory(root([
      directory('2026', [valid]),
      excluded,
      file('broken-name.pdf'),
    ]))

    expect(result.scannedFiles).toBe(3)
    expect(result.excludedFiles).toBe(1)
    expect(result.rows).toHaveLength(2)
    expect(result.rows.map(row => row.relativePath)).toEqual(['2026/2018109915521-案件-新申请文档.doc', 'broken-name.pdf'])
    expect(result.rows[0]).toMatchObject({ materialKey: 'APPLY_FILE', status: 'pending', error: '' })
    expect(result.rows[1]).toMatchObject({ materialKey: '', status: 'unmatched' })
    expect(result.rows[1].error).toBeTruthy()
    expect([...result.files.keys()]).toEqual(result.rows.map(row => row.id))
    expect(JSON.parse(result.rows[0].id)).toEqual(['root-1', result.rows[0].relativePath])
    expect(validGetFile).not.toHaveBeenCalled()
    expect(excludedGetFile).not.toHaveBeenCalled()
  })

  it('defaults to PDF and Word files and clamps custom filters to PDF and Word extensions', async () => {
    const names = ['pdf', 'doc', 'docx', 'nozip', 'xml', 'mal', 'zip']
    const defaultResult = await scanDirectory(root(names.map(extension => file(`2018109915521-案件-新申请文档.${extension}`))))
    const customResult = await scanDirectory(root([
      file('2018109915521-案件-新申请文档.pdf'),
      file('2018109915521-案件-新申请文档.docx'),
      file('2018109915521-案件-新申请文档.xml'),
      file('2018109915521-案件-新申请文档.mal'),
      file('2018109915521-案件-新申请文档.zip'),
    ]), { extensions: ['docx', 'xml', 'mal', '.zip'] })

    expect(defaultResult.rows.map(row => row.extension).sort()).toEqual(['doc', 'docx', 'pdf'])
    expect(defaultResult.excludedFiles).toBe(4)
    expect(customResult.rows.map(row => row.extension)).toEqual(['docx'])
    expect(customResult.excludedFiles).toBe(4)
  })

  it('uses collision-free root and relative-path IDs and yields to the event loop every 100 files', async () => {
    const entries = Array.from({ length: 100 }, (_, index) => file(`broken-${index}.pdf`))
    const otherRoot = root([file('2018109915521-案件-新申请文档.docx')])
    const progress = vi.fn()
    let timerRan = false
    setTimeout(() => { timerRan = true }, 0)
    const result = await scanDirectory(root(entries), { onProgress: progress })
    const firstId = result.rows[0].id
    const nextRootResult = await scanDirectory({ ...otherRoot, id: 'root:1' }, { extensions: ['.docx'] })

    expect(result.scannedFiles).toBe(100)
    expect(progress).toHaveBeenCalledWith(100)
    expect(timerRan).toBe(true)
    expect(firstId).not.toBe(nextRootResult.rows[0]?.id)
    expect(new Set(result.rows.map(row => row.id)).size).toBe(100)
  })

  it('stops promptly when the caller aborts the scan', async () => {
    const controller = new AbortController()
    const handle = directory('source', [file('2018109915521-案件-申请文件.pdf')])
    const values = handle.values.bind(handle)
    handle.values = async function* () {
      controller.abort()
      yield* values()
    }

    await expect(scanDirectory({ id: 'root', name: 'source', handle }, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
  })

  it('merges reimports idempotently while preserving row selection and workflow receipts', async () => {
    const source = root([file('2018109915521-案件-新申请文档.doc')])
    const scan = await scanDirectory(source)
    const row = scan.rows[0]
    const receipt = { attachments: [{ ID: 'attachment-1' }] }
    const task: JihuaTask = {
      id: 'task-1', createdAt: 1, updatedAt: 1, status: 'paused', roots: [],
      rows: [{ ...row, materialKey: 'PATENT_REQUEST', selected: true, status: 'success', receipt, attempts: 2 }],
      scannedFiles: 1, excludedFiles: 0, errors: [],
    }

    const merged = mergeInventory(task, scan, source)
    const mergedAgain = mergeInventory(merged, scan, source)

    expect(mergedAgain.rows).toHaveLength(1)
    expect(mergedAgain.rows[0]).toMatchObject({ selected: true, status: 'success', receipt, attempts: 2 })
    expect(mergedAgain.rows[0].materialKey).toBe('PATENT_REQUEST')
    expect(mergedAgain.roots[0]).toMatchObject({ id: 'root-1', name: 'source' })
    expect(mergedAgain.scannedFiles).toBe(1)
  })

  it('repairs a previously unmatched alias row during reimport without losing its identity or selection', async () => {
    const source = root([file('2018109915521-辰星-一期-费用减缴审批通知书.pdf')])
    const scan = await scanDirectory(source)
    const fresh = scan.rows[0]
    const task: JihuaTask = {
      ...createJihuaTask(),
      id: 'legacy-task',
      rows: [{
        ...fresh,
        id: fresh.id,
        materialKey: '',
        selected: false,
        status: 'unmatched',
        error: '文件描述没有匹配到该台账支持的材料，请手动选择目标材料。',
        attempts: 2,
        updatedAt: 77,
      }],
    }

    const merged = mergeInventory(task, scan, source)

    expect(merged.rows).toHaveLength(1)
    expect(merged.rows[0]).toMatchObject({
      id: fresh.id,
      materialKey: 'FEE_REDUCTION_APPROVAL_NOTICE',
      selected: false,
      status: 'pending',
      error: '',
      attempts: 2,
      updatedAt: 77,
    })
  })

  it('aggregates per-root counters and replaces counts on a root reimport', async () => {
    const firstRoot = root([file('2018109915521-案件-新申请文档.pdf')])
    const firstScan = await scanDirectory(firstRoot)
    const task = mergeInventory(createJihuaTask(), firstScan, firstRoot)
    const secondRoot = { ...root([
      file('2018109915521-案件-新申请文档.docx'),
      file('2018109915521-案件-新申请文档.xml'),
    ]), id: 'root-2' }
    const secondScan = await scanDirectory(secondRoot)

    const merged = mergeInventory(task, secondScan, secondRoot)
    const reimported = mergeInventory(merged, secondScan, secondRoot)

    expect(reimported.scannedFiles).toBe(3)
    expect(reimported.excludedFiles).toBe(1)
    expect(reimported.rows).toHaveLength(2)
  })

  it('deselects same-root rows absent from a rescan while preserving workflow history', async () => {
    const source = root([
      file('2018109915521-案件-A.pdf'),
      file('2018109915521-案件-B.docx'),
      file('2018109915521-案件-C.pdf'),
    ])
    const initialScan = await scanDirectory(source)
    const otherRoot = { ...root([file('2018109915521-另一个目录-D.pdf')]), id: 'root-2' }
    let task = mergeInventory(createJihuaTask(), initialScan, source)
    task = mergeInventory(task, await scanDirectory(otherRoot), otherRoot)
    const filteredOut = task.rows.find(row => row.fileName.endsWith('-B.docx'))!
    const deleted = task.rows.find(row => row.fileName.endsWith('-C.pdf'))!
    const otherRootRow = task.rows.find(row => row.rootId === 'root-2')!
    Object.assign(filteredOut, {
      selected: true,
      status: 'success',
      receipt: { attachments: [{ ID: 'receipt-b' }] },
    })
    Object.assign(deleted, { selected: true, status: 'failed', error: 'prior upload failure' })
    otherRootRow.selected = true

    const filteredScan = await scanDirectory(root([
      file('2018109915521-案件-A.pdf'),
      file('2018109915521-案件-B.docx'),
    ]), { extensions: ['pdf'] })
    const merged = mergeInventory(task, filteredScan, source)

    const afterFilter = merged.rows.find(row => row.id === filteredOut.id)!
    const afterDelete = merged.rows.find(row => row.id === deleted.id)!
    expect(afterFilter).toMatchObject({ selected: false, status: 'success', receipt: filteredOut.receipt })
    expect(afterFilter.error).toContain('本次扫描未纳入，已取消选择；保留历史回执')
    expect(afterDelete).toMatchObject({ selected: false, status: 'failed' })
    expect(afterDelete.receipt).toBeUndefined()
    expect(afterDelete.error).toContain('prior upload failure')
    expect(afterDelete.error).toContain('本次扫描未纳入，已取消选择；保留历史回执')
    expect(merged.rows.find(row => row.rootId === 'root-2')?.selected).toBe(true)
    expect(merged.rows).toHaveLength(4)
  })

  it('creates a fresh empty inventory task', () => {
    const task = createJihuaTask()

    expect(task).toMatchObject({
      status: 'ready', roots: [], rows: [], scannedFiles: 0, excludedFiles: 0, errors: [],
    })
    expect(task.id).toBeTruthy()
    expect(task.updatedAt).toBeGreaterThanOrEqual(task.createdAt)
  })
})
