import { describe, expect, it } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import type { JihuaRow, JihuaTask, LocalFileHandle, SourceRoot } from '../../../src/jihua/types'
import { createJihuaRepository } from '../../../src/jihua/repository'

function createTask(id: string): JihuaTask {
  return {
    id, createdAt: 1, updatedAt: 2, status: 'ready', roots: [], rows: [],
    scannedFiles: 0, excludedFiles: 0, errors: [],
  }
}

function makeFactory(): IDBFactory {
  return new IDBFactory()
}

function legacyRow(id: string, description: string, overrides: Partial<JihuaRow> = {}): JihuaRow {
  return {
    id,
    rootId: 'root-1',
    relativePath: `${id}.pdf`,
    fileName: `${id}.pdf`,
    extension: 'pdf',
    applicationNo: '2021100850612',
    caseName: '辰星-一期',
    description,
    materialKey: '',
    selected: false,
    status: 'unmatched',
    error: '材料类型未登记',
    attempts: 0,
    updatedAt: 123,
    ...overrides,
  }
}

function uploadStateRow(overrides: Partial<JihuaRow> = {}): JihuaRow {
  return legacyRow('["root-1","docs/case.pdf"]', '申请文件', {
    rootId: 'root-1', relativePath: 'docs/case.pdf', fileName: 'case.pdf',
    applicationNo: '2021100850612', materialKey: 'PATENT_REQUEST', status: 'failed',
    intent: { requestId: 'request-1', sessionKey: 'session-1', tabId: 1, documentId: 'document-1', sent: true,
      materialKey: 'PATENT_REQUEST', applicationNo: '2021100850612' },
    ...overrides,
  })
}

async function readStoredTask(factory: IDBFactory): Promise<JihuaTask | undefined> {
  return new Promise((resolve, reject) => {
    const openRequest = factory.open('patmail-jihua-inventory', 1)
    openRequest.onerror = () => reject(openRequest.error ?? new Error('Opening the test database failed'))
    openRequest.onsuccess = () => {
      const database = openRequest.result
      const transaction = database.transaction('tasks', 'readonly')
      const request = transaction.objectStore('tasks').get('latest')
      let storedTask: JihuaTask | undefined
      request.onsuccess = () => { storedTask = request.result as JihuaTask | undefined }
      request.onerror = () => reject(request.error ?? new Error('Reading the persisted task failed'))
      transaction.oncomplete = () => {
        database.close()
        resolve(storedTask)
      }
      transaction.onerror = () => {
        database.close()
        reject(transaction.error ?? new Error('Reading the persisted task failed'))
      }
    }
  })
}

describe('Jihua IndexedDB repository', () => {
  it('persists a single latest task, file handles, and roots in separate stores', async () => {
    const repository = createJihuaRepository(makeFactory())
    const fileHandle = { kind: 'file', name: 'case.pdf' } as LocalFileHandle
    const rootHandle = { kind: 'directory', name: 'source' } as SourceRoot['handle']
    const source: SourceRoot = { id: 'root-1', name: 'source', handle: rootHandle }

    await repository.save(createTask('older'))
    await repository.archiveAndCreate('older', createTask('latest'))
    await repository.putFile('row-1', fileHandle)
    await repository.putRoot(source)

    expect((await repository.load())?.id).toBe('latest')
    expect(await repository.getFile('row-1')).toMatchObject({ kind: 'file', name: 'case.pdf' })
    expect(await repository.getRoots()).toMatchObject([{ id: 'root-1', name: 'source', handle: { kind: 'directory', name: 'source' } }])
  })

  it('repairs exact legacy alias errors while preserving other causes and row state', async () => {
    const factory = makeFactory()
    const repository = createJihuaRepository(factory)
    const receipt = { attachments: [{ ID: 'attachment-1' }] }
    const runnerError = '文件描述没有匹配到该台账支持的材料，请手动选择目标材料。'
    const intent = {
      requestId: 'request-1', sessionKey: 'session-1', tabId: 7, documentId: 'document-1',
      sent: true, materialKey: 'STATUS_RIGHT', applicationNo: '2021100850612',
    }
    const targetRecord = { id: 'record-1', type: 'INVENTION' as const, applicationNo: '2021100850612' }
    const safeRow = legacyRow('safe-row', '递交文件合并档', { updatedAt: 222, attempts: 3 })
    const invalidApplicationRow = legacyRow('invalid-application', '费用减缴审批通知书', {
      applicationNo: 'invalid',
      selected: true,
      error: '申请号格式无效；材料类型未登记',
    })
    const missingCaseRow = legacyRow('missing-case', '手续合格通知书（著录项目变更）', {
      caseName: '',
      error: '案件名称缺失；材料类型未登记',
    })
    const runnerErrorRow = legacyRow('runner-error', '费用减缴审批通知书', { error: runnerError })
    const additionalCauseRow = legacyRow('additional-cause', '递交文件合并档', {
      error: `${runnerError}；来源尚未校验`,
    })
    const sentIntentRow = legacyRow('sent-intent', '实用新型专利证书', {
      error: runnerError,
      intent,
      updatedAt: 444,
    })
    const receiptRow = legacyRow('receipt-row', '实用新型专利证书(签章)', {
      error: runnerError,
      receipt,
      selected: true,
      updatedAt: 555,
    })
    const nearMatchRow = legacyRow('near-match', '递交文件合并档', {
      error: runnerError.slice(0, -1),
    })
    const successRow = legacyRow('success-row', '实用新型专利证书（签章）', {
      selected: false,
      status: 'success',
      error: runnerError,
      intent,
      receipt,
      record: targetRecord,
      updatedAt: 333,
    })
    const alreadyRow = legacyRow('already-row', '实用新型专利证书', {
      selected: true,
      status: 'already',
      error: '材料类型未登记',
      receipt,
    })
    const manuallyMappedRow = legacyRow('manual-row', '递交文件合并档', {
      materialKey: 'APPLY_FILE',
      status: 'failed',
      selected: false,
      error: '人工指定材料仍需复核',
    })
    const task: JihuaTask = {
      ...createTask('legacy-task'),
      rows: [
        safeRow, invalidApplicationRow, missingCaseRow, runnerErrorRow, additionalCauseRow,
        sentIntentRow, receiptRow, nearMatchRow, successRow, alreadyRow, manuallyMappedRow,
      ],
    }
    const extendedSafeRow = { ...safeRow, retainedMetadata: { source: 'legacy' } }
    task.rows[0] = extendedSafeRow

    await repository.save(task)

    const migrated = await repository.load()
    const loadedAgain = await repository.load()
    expect(migrated).not.toBeNull()
    expect(loadedAgain).toEqual(migrated)
    expect(migrated?.rows).toMatchObject([
      {
        id: 'safe-row', materialKey: 'PATENT_REQUEST', selected: false, status: 'pending', error: '',
        attempts: 3, updatedAt: 222,
      },
      {
        id: 'invalid-application', materialKey: 'FEE_REDUCTION_APPROVAL_NOTICE', selected: true,
        status: 'unmatched', error: '申请号格式无效',
      },
      {
        id: 'missing-case', materialKey: 'COMPLIANCE_NOTICE', status: 'unmatched', error: '案件名称缺失',
      },
      {
        id: 'runner-error', materialKey: 'FEE_REDUCTION_APPROVAL_NOTICE', selected: false,
        status: 'pending', error: '',
      },
      {
        id: 'additional-cause', materialKey: 'PATENT_REQUEST', status: 'unmatched', error: '来源尚未校验',
      },
      {
        id: 'sent-intent', materialKey: 'STATUS_RIGHT', status: 'unmatched', error: '', intent, updatedAt: 444,
      },
      {
        id: 'receipt-row', materialKey: 'STATUS_RIGHT', status: 'unmatched', error: '', receipt,
        selected: true, updatedAt: 555,
      },
      {
        id: 'near-match', materialKey: 'PATENT_REQUEST', status: 'unmatched', error: runnerError.slice(0, -1),
      },
      {
        id: 'success-row', materialKey: '', selected: false, status: 'success', error: runnerError,
        intent, receipt, record: targetRecord, updatedAt: 333,
      },
      {
        id: 'already-row', materialKey: '', selected: true, status: 'already', error: '材料类型未登记', receipt,
      },
      {
        id: 'manual-row', materialKey: 'APPLY_FILE', selected: false, status: 'failed',
        error: '人工指定材料仍需复核',
      },
    ])
    expect((migrated?.rows[0] as JihuaRow & { retainedMetadata?: unknown }).retainedMetadata)
      .toEqual({ source: 'legacy' })
    expect(await readStoredTask(factory)).toEqual(task)
  })

  it('leaves rows in a completed task untouched by alias recovery', async () => {
    const repository = createJihuaRepository(makeFactory())
    const task: JihuaTask = {
      ...createTask('completed-task'),
      status: 'completed',
      rows: [legacyRow('completed-row', '递交文件合并档', {
        error: '文件描述没有匹配到该台账支持的材料，请手动选择目标材料。',
      })],
    }

    await repository.save(task)

    expect(await repository.load()).toEqual(task)
  })

  it('rejects a failed task write and keeps the prior task atomically', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('stable'))
    const uncloneable = createTask('stable') as JihuaTask & { callback: () => void }
    uncloneable.callback = () => undefined

    await expect(repository.save(uncloneable)).rejects.toBeTruthy()
    expect((await repository.load())?.id).toBe('stable')
  })

  it('clears the task and all persisted file and root references for a new task', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('old'))
    await repository.putFile('row-1', { kind: 'file', name: 'case.pdf' } as LocalFileHandle)
    await repository.putRoot({
      id: 'root-1', name: 'source', handle: { kind: 'directory', name: 'source' } as SourceRoot['handle'],
    })

    await repository.clear()

    expect(await repository.load()).toBeNull()
    expect(await repository.getFile('row-1')).toBeUndefined()
    expect(await repository.getRoots()).toEqual([])
  })

  it('archives uncertain rows without dropping receipts, file handles, or root handles', async () => {
    const repository = createJihuaRepository(makeFactory())
    const fileHandle = { kind: 'file', name: 'uncertain.pdf' } as LocalFileHandle
    const rootHandle = { kind: 'directory', name: 'source' } as SourceRoot['handle']
    const receipt = { attachments: [{ ID: 'attachment-1' }] }
    const intent = {
      requestId: 'request-uncertain', sessionKey: 'session-1', tabId: 3, documentId: 'document-1',
      sent: true, materialKey: 'PATENT_REQUEST', applicationNo: '2021100850612',
    }
    const uncertain: JihuaTask = {
      ...createTask('uncertain'),
      status: 'failed',
      roots: [{ id: 'root-1', name: 'source' }],
      rows: [
        legacyRow('row-1', '申请文件', { selected: true, intent, status: 'failed' }),
        legacyRow('row-receipt', '授权委托书', { selected: true, intent, receipt, status: 'success' }),
      ],
    }
    await repository.save(uncertain)
    await repository.putFile('row-1', fileHandle)
    await repository.putRoot({ id: 'root-1', name: 'source', handle: rootHandle })

    await repository.archiveAndCreate('uncertain', createTask('fresh'))

    expect(await repository.load()).toMatchObject({ id: 'fresh', rows: [] })
    expect(await repository.getFile('row-1')).toMatchObject({ kind: 'file', name: 'uncertain.pdf' })
    expect(await repository.getRoots()).toEqual([{ id: 'root-1', name: 'source', handle: rootHandle }])
    expect(await repository.listHistory()).toEqual([{
      id: 'uncertain', createdAt: 1, updatedAt: 2, status: 'failed', rowCount: 2, unconfirmedCount: 1,
    }])
    expect(await repository.restoreTask('uncertain', 'fresh')).toMatchObject({
      id: 'uncertain', rows: [
        { id: 'row-1', selected: true, status: 'failed', intent },
        { id: 'row-receipt', selected: true, status: 'success', intent, receipt },
      ],
    })
  })

  it('restores a cancelled task as paused and moves the current task into history', async () => {
    const repository = createJihuaRepository(makeFactory())
    const receipt = { attachments: [{ ID: 'saved-attachment' }] }
    const intent = { requestId: 'saved-request', sessionKey: 's', tabId: 4, documentId: 'd', sent: true }
    const cancelled = {
      ...createTask('cancelled'), status: 'cancelled',
      rows: [legacyRow('row-cancelled', '授权委托书', { status: 'success', selected: true, intent, receipt })],
    } as JihuaTask
    await repository.save(cancelled)
    await repository.archiveAndCreate('cancelled', createTask('current'))

    const restored = await repository.restoreTask('cancelled', 'current')

    expect(restored).toMatchObject({
      id: 'cancelled', status: 'paused',
      rows: [{ id: 'row-cancelled', status: 'success', selected: true, intent, receipt }],
    })
    expect(await repository.load()).toEqual(restored)
    expect(await repository.listHistory()).toEqual([{
      id: 'current', createdAt: 1, updatedAt: 2, status: 'ready', rowCount: 0, unconfirmedCount: 0,
    }])
  })

  it('limits history to the 50 most recently updated task summaries', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save({ ...createTask('task-0'), updatedAt: 0 })
    for (let index = 1; index <= 52; index += 1) {
      await repository.archiveAndCreate(`task-${index - 1}`, { ...createTask(`task-${index}`), updatedAt: index })
    }

    const history = await repository.listHistory()

    expect(history).toHaveLength(50)
    expect(history[0]?.id).toBe('task-51')
    expect(history[49]?.id).toBe('task-2')
    expect(history.some(item => item.id === 'task-52')).toBe(false)
    expect(history.every(item => Object.keys(item).sort().join(',') === 'createdAt,id,rowCount,status,unconfirmedCount,updatedAt')).toBe(true)
    expect(await repository.load()).toMatchObject({ id: 'task-52' })
    expect(await repository.restoreTask('task-0', 'task-52')).toMatchObject({ id: 'task-0' })
  })

  it('fences stale writers to their existing archive and rejects unknown stale task ids', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('older'))
    await repository.archiveAndCreate('older', createTask('newer'))

    await repository.save({ ...createTask('older'), updatedAt: 99, errors: ['late snapshot'] })

    expect(await repository.load()).toMatchObject({ id: 'newer', errors: [] })
    await expect(repository.save(createTask('unknown-stale'))).rejects.toBeTruthy()
    expect(await repository.load()).toMatchObject({ id: 'newer' })
    expect(await repository.restoreTask('older', 'newer')).toMatchObject({ id: 'older', updatedAt: 99, errors: ['late snapshot'] })
  })

  it('rejects task replacement when the expected latest id changed', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('current'))

    await expect(repository.archiveAndCreate('someone-else', createTask('next'))).rejects.toBeTruthy()

    expect(await repository.load()).toMatchObject({ id: 'current' })
    expect(await repository.listHistory()).toEqual([])
  })

  it('rolls back the archive when the replacement task cannot be cloned', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('stable'))
    const uncloneable = { ...createTask('cannot-save'), callback: () => undefined } as JihuaTask

    await expect(repository.archiveAndCreate('stable', uncloneable)).rejects.toBeTruthy()

    expect(await repository.load()).toMatchObject({ id: 'stable' })
    expect(await repository.listHistory()).toEqual([])
  })

  it('rejects restoring history if the active task no longer matches the expected id', async () => {
    const repository = createJihuaRepository(makeFactory())
    await repository.save(createTask('historical'))
    await repository.archiveAndCreate('historical', createTask('current'))

    await expect(repository.restoreTask('historical', 'stale-current')).rejects.toBeTruthy()

    expect(await repository.load()).toMatchObject({ id: 'current' })
    expect(await repository.listHistory()).toEqual([{
      id: 'historical', createdAt: 1, updatedAt: 2, status: 'ready', rowCount: 0, unconfirmedCount: 0,
    }])
  })

  it('finds archived upload state only when file and business identity fields all match', async () => {
    const repository = createJihuaRepository(makeFactory())
    const archivedRow = uploadStateRow()
    const currentLatestRow = uploadStateRow({ intent: { ...archivedRow.intent!, requestId: 'current-only' } })
    await repository.save({ ...createTask('archived'), rows: [archivedRow] })
    await repository.archiveAndCreate('archived', { ...createTask('current'), rows: [currentLatestRow] })
    const scannedRows = [
      uploadStateRow({ selected: true, intent: undefined, receipt: undefined, status: 'pending' }),
      uploadStateRow({ fileName: 'renamed.pdf' }),
      uploadStateRow({ rootId: 'other-root' }),
      uploadStateRow({ relativePath: 'other/case.pdf' }),
      uploadStateRow({ applicationNo: '2021100850613' }),
      uploadStateRow({ materialKey: 'APPLY_FILE' }),
    ]

    const found = await repository.findArchivedUploads(scannedRows)

    expect(found).toEqual([archivedRow])
    expect(found[0]?.intent?.requestId).not.toBe('current-only')
  })

  it('prefers an unconfirmed sent intent over a newer archived receipt', async () => {
    const repository = createJihuaRepository(makeFactory())
    const unknown = uploadStateRow({ updatedAt: 10, intent: { ...uploadStateRow().intent!, requestId: 'unknown-old' } })
    const receipt = { attachments: [{ ID: 'known-attachment' }] }
    const known = uploadStateRow({ updatedAt: 100, intent: { ...uploadStateRow().intent!, requestId: 'known-new' }, receipt })
    await repository.save({ ...createTask('unknown-task'), updatedAt: 10, rows: [unknown] })
    await repository.archiveAndCreate('unknown-task', { ...createTask('known-task'), updatedAt: 100, rows: [known] })
    await repository.archiveAndCreate('known-task', { ...createTask('current'), updatedAt: 200 })

    const [found] = await repository.findArchivedUploads([uploadStateRow({ intent: undefined, receipt: undefined })])

    expect(found?.intent?.requestId).toBe('unknown-old')
    expect(found?.receipt).toBeUndefined()
  })

  it('preserves sent upload receipts and selects the newest matching archived snapshot', async () => {
    const repository = createJihuaRepository(makeFactory())
    const older = uploadStateRow({
      updatedAt: 10,
      intent: { ...uploadStateRow().intent!, requestId: 'receipt-old' },
      receipt: { attachments: [{ ID: 'old-attachment' }] },
    })
    const newest = uploadStateRow({
      updatedAt: 20,
      selected: true,
      intent: { ...uploadStateRow().intent!, requestId: 'receipt-new' },
      receipt: { attachments: [{ ID: 'new-attachment' }] },
      record: { id: 'record-1', type: 'INVENTION', applicationNo: '2021100850612' },
    })
    await repository.save({ ...createTask('older-receipt'), updatedAt: 10, rows: [older] })
    await repository.archiveAndCreate('older-receipt', { ...createTask('newest-receipt'), updatedAt: 20, rows: [newest] })
    await repository.archiveAndCreate('newest-receipt', { ...createTask('current'), updatedAt: 30 })

    const [found] = await repository.findArchivedUploads([uploadStateRow({ selected: false, intent: undefined, receipt: undefined })])

    expect(found).toEqual(newest)
    expect(found?.receipt?.attachments).toEqual([{ ID: 'new-attachment' }])
    expect(found?.record).toEqual({ id: 'record-1', type: 'INVENTION', applicationNo: '2021100850612' })
  })
})
