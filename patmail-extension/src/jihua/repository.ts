import type { JihuaRepository, JihuaRow, JihuaTask, JihuaTaskSummary, LocalFileHandle, SourceRoot } from './types'
import { repairPersistedMaterialAliases } from './inventory'

const DATABASE_NAME = 'patmail-jihua-inventory'
const DATABASE_VERSION = 1
const TASKS_STORE = 'tasks'
const FILES_STORE = 'files'
const ROOTS_STORE = 'roots'
const LATEST_TASK_KEY = 'latest'
const HISTORY_TASK_PREFIX = 'task:'
const DATABASE_OPEN_TIMEOUT_MS = 8_000
const TRANSACTION_TIMEOUT_MS = 8_000

interface StoredFile { id: string; handle: LocalFileHandle }

function requiredIndexDbFactory(factory?: IDBFactory): IDBFactory {
  const resolved = factory ?? globalThis.indexedDB
  if (!resolved) throw new Error('IndexedDB is unavailable')
  return resolved
}

function transactionError(transaction: IDBTransaction): Error {
  return transaction.error ?? new Error('IndexedDB transaction failed')
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

export function createJihuaRepository(factory?: IDBFactory): JihuaRepository {
  const idb = requiredIndexDbFactory(factory)
  let databasePromise: Promise<IDBDatabase> | undefined

  const openDatabase = (): Promise<IDBDatabase> => {
    if (databasePromise) return databasePromise
    databasePromise = new Promise((resolve, reject) => {
      let settled = false
      const timeout: { current?: ReturnType<typeof setTimeout> } = {}
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        if (timeout.current) clearTimeout(timeout.current)
        databasePromise = undefined
        reject(error)
      }
      let request: IDBOpenDBRequest
      try {
        request = idb.open(DATABASE_NAME, DATABASE_VERSION)
      } catch (error) {
        fail(asError(error))
        return
      }
      timeout.current = setTimeout(() => fail(new Error(`Opening the Jihua IndexedDB database timed out after ${DATABASE_OPEN_TIMEOUT_MS}ms`)), DATABASE_OPEN_TIMEOUT_MS)
      request.onupgradeneeded = () => {
        const database = request.result
        if (!database.objectStoreNames.contains(TASKS_STORE)) database.createObjectStore(TASKS_STORE)
        if (!database.objectStoreNames.contains(FILES_STORE)) database.createObjectStore(FILES_STORE, { keyPath: 'id' })
        if (!database.objectStoreNames.contains(ROOTS_STORE)) database.createObjectStore(ROOTS_STORE, { keyPath: 'id' })
      }
      request.onsuccess = () => {
        if (settled) {
          request.result.close()
          return
        }
        settled = true
        if (timeout.current) clearTimeout(timeout.current)
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
      request.onerror = () => fail(request.error ?? new Error('Opening the Jihua IndexedDB database failed'))
      request.onblocked = () => { /* Wait briefly for the blocking connection to close, then fail on timeout. */ }
    })
    return databasePromise
  }

  const runTransaction = async <T>(
    storeNames: string | string[],
    mode: IDBTransactionMode,
    operation: (transaction: IDBTransaction, setResult: (value: T) => void, fail: (error: Error) => void) => void,
  ): Promise<T> => {
    const database = await openDatabase()
    return new Promise<T>((resolve, reject) => {
      let result!: T
      let settled = false
      let timeout: ReturnType<typeof setTimeout> | undefined
      let transaction: IDBTransaction
      try {
        transaction = mode === 'readwrite'
          ? database.transaction(storeNames, mode, { durability: 'strict' })
          : database.transaction(storeNames, mode)
      } catch (error) {
        reject(asError(error))
        return
      }
      const fail = (error: Error) => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        reject(error)
        try { transaction.abort() } catch { /* The transaction may already be inactive. */ }
      }
      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        if (timeout) clearTimeout(timeout)
        resolve(result)
      }
      transaction.onabort = () => fail(transactionError(transaction))
      transaction.onerror = () => fail(transactionError(transaction))
      try {
        timeout = setTimeout(() => fail(new Error(`Jihua IndexedDB transaction timed out after ${TRANSACTION_TIMEOUT_MS}ms`)), TRANSACTION_TIMEOUT_MS)
        operation(transaction, value => { result = value }, fail)
      } catch (error) {
        try { transaction.abort() } catch { /* The transaction may already be inactive. */ }
        fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }

  return {
    async save(task: JihuaTask): Promise<void> {
      await runTransaction<void>(TASKS_STORE, 'readwrite', (transaction, _setResult, fail) => {
        const store = transaction.objectStore(TASKS_STORE)
        const latestRequest = store.get(LATEST_TASK_KEY)
        latestRequest.onsuccess = () => {
          const latest = latestRequest.result as JihuaTask | undefined
          if (!latest || latest.id === task.id) {
            try { store.put(task, LATEST_TASK_KEY) } catch (error) { fail(asError(error)) }
            return
          }

          const archivedKey = `${HISTORY_TASK_PREFIX}${task.id}`
          const archivedRequest = store.get(archivedKey)
          archivedRequest.onsuccess = () => {
            if (!archivedRequest.result) {
              fail(new Error(`Cannot save stale Jihua task ${task.id}; it is neither current nor archived`))
              return
            }
            try { store.put(task, archivedKey) } catch (error) { fail(asError(error)) }
          }
        }
      })
    },
    async load(): Promise<JihuaTask | null> {
      return runTransaction<JihuaTask | null>(TASKS_STORE, 'readonly', (transaction, setResult) => {
        const request = transaction.objectStore(TASKS_STORE).get(LATEST_TASK_KEY)
        request.onsuccess = () => {
          const task = request.result as JihuaTask | undefined
          setResult(task ? repairPersistedMaterialAliases(task) : null)
        }
      })
    },
    async archiveAndCreate(expectedId: string | null, next: JihuaTask): Promise<void> {
      await runTransaction<void>(TASKS_STORE, 'readwrite', (transaction, _setResult, fail) => {
        const store = transaction.objectStore(TASKS_STORE)
        const latestRequest = store.get(LATEST_TASK_KEY)
        latestRequest.onsuccess = () => {
          const current = latestRequest.result as JihuaTask | undefined
          if ((current?.id ?? null) !== expectedId) {
            fail(new Error(`Jihua task changed before replacement; expected ${expectedId ?? 'no active task'}`))
            return
          }
          try {
            if (current) store.put(current, `${HISTORY_TASK_PREFIX}${current.id}`)
            store.put(next, LATEST_TASK_KEY)
          } catch (error) { fail(asError(error)) }
        }
      })
    },
    async listHistory(): Promise<JihuaTaskSummary[]> {
      return runTransaction<JihuaTaskSummary[]>(TASKS_STORE, 'readonly', (transaction, setResult) => {
        const summaries: JihuaTaskSummary[] = []
        const request = transaction.objectStore(TASKS_STORE).openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            summaries.sort((left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || left.id.localeCompare(right.id))
            setResult(summaries.slice(0, 50))
            return
          }
          if (typeof cursor.key === 'string' && cursor.key.startsWith(HISTORY_TASK_PREFIX)) {
            const task = cursor.value as JihuaTask
            const rows = Array.isArray(task?.rows) ? task.rows : []
            summaries.push({
              id: task.id,
              createdAt: task.createdAt,
              updatedAt: task.updatedAt,
              status: task.status,
              rowCount: rows.length,
              unconfirmedCount: rows.filter(row => row.intent?.sent && !row.receipt).length,
            })
          }
          cursor.continue()
        }
      })
    },
    async findArchivedUploads(rows: readonly JihuaRow[]): Promise<JihuaRow[]> {
      if (!rows.length) return []
      return runTransaction<JihuaRow[]>(TASKS_STORE, 'readonly', (transaction, setResult) => {
        interface Candidate { row: JihuaRow; taskUpdatedAt: number; taskCreatedAt: number }
        const requestedById = new Map<string, JihuaRow[]>()
        for (const row of rows) {
          const matches = requestedById.get(row.id) ?? []
          matches.push(row)
          requestedById.set(row.id, matches)
        }
        const bestByRequestedRow = new Map<JihuaRow, Candidate>()
        const isNewerCandidate = (candidate: Candidate, existing: Candidate): boolean => {
          const candidateUnknown = candidate.row.intent?.sent === true && !candidate.row.receipt
          const existingUnknown = existing.row.intent?.sent === true && !existing.row.receipt
          if (candidateUnknown !== existingUnknown) return candidateUnknown
          if (candidate.row.updatedAt !== existing.row.updatedAt) return candidate.row.updatedAt > existing.row.updatedAt
          if (candidate.taskUpdatedAt !== existing.taskUpdatedAt) return candidate.taskUpdatedAt > existing.taskUpdatedAt
          if (candidate.taskCreatedAt !== existing.taskCreatedAt) return candidate.taskCreatedAt > existing.taskCreatedAt
          return candidate.row.id.localeCompare(existing.row.id) > 0
        }
        const request = transaction.objectStore(TASKS_STORE).openCursor()
        request.onsuccess = () => {
          const cursor = request.result
          if (!cursor) {
            setResult(rows.flatMap(row => {
              const candidate = bestByRequestedRow.get(row)
              return candidate ? [candidate.row] : []
            }))
            return
          }
          if (typeof cursor.key === 'string' && cursor.key.startsWith(HISTORY_TASK_PREFIX)) {
            const task = cursor.value as JihuaTask
            const archivedRows = Array.isArray(task?.rows) ? task.rows : []
            for (const archived of archivedRows) {
              if (archived.intent?.sent !== true) continue
              const candidate: Candidate = { row: archived, taskUpdatedAt: task.updatedAt, taskCreatedAt: task.createdAt }
              for (const requested of requestedById.get(archived.id) ?? []) {
                if (archived.rootId !== requested.rootId
                  || archived.relativePath !== requested.relativePath
                  || archived.fileName !== requested.fileName
                  || archived.applicationNo !== requested.applicationNo
                  || archived.materialKey !== requested.materialKey) continue
                const existing = bestByRequestedRow.get(requested)
                if (!existing || isNewerCandidate(candidate, existing)) bestByRequestedRow.set(requested, candidate)
              }
            }
          }
          cursor.continue()
        }
      })
    },
    async restoreTask(id: string, expectedId: string | null): Promise<JihuaTask> {
      return runTransaction<JihuaTask>(TASKS_STORE, 'readwrite', (transaction, setResult, fail) => {
        const store = transaction.objectStore(TASKS_STORE)
        const latestRequest = store.get(LATEST_TASK_KEY)
        const historyKey = `${HISTORY_TASK_PREFIX}${id}`
        const historyRequest = store.get(historyKey)
        let currentLoaded = false
        let historyLoaded = false
        let current: JihuaTask | undefined
        let historical: JihuaTask | undefined

        const commitRestore = () => {
          if (!currentLoaded || !historyLoaded) return
          if ((current?.id ?? null) !== expectedId) {
            fail(new Error(`Jihua task changed before restore; expected ${expectedId ?? 'no active task'}`))
            return
          }
          if (!historical) {
            fail(new Error(`Jihua task history ${id} was not found`))
            return
          }
          if (current?.id === id) {
            fail(new Error(`Jihua task ${id} is already active`))
            return
          }

          const restored = repairPersistedMaterialAliases(historical)
          if (restored.status === 'cancelled') restored.status = 'paused'
          try {
            if (current) store.put(current, `${HISTORY_TASK_PREFIX}${current.id}`)
            store.put(restored, LATEST_TASK_KEY)
            store.delete(historyKey)
            setResult(restored)
          } catch (error) { fail(asError(error)) }
        }

        latestRequest.onsuccess = () => {
          current = latestRequest.result as JihuaTask | undefined
          currentLoaded = true
          commitRestore()
        }
        historyRequest.onsuccess = () => {
          historical = historyRequest.result as JihuaTask | undefined
          historyLoaded = true
          commitRestore()
        }
      })
    },
    async putFile(id: string, handle: LocalFileHandle): Promise<void> {
      await runTransaction<void>(FILES_STORE, 'readwrite', transaction => {
        const record: StoredFile = { id, handle }
        transaction.objectStore(FILES_STORE).put(record)
      })
    },
    async getFile(id: string): Promise<LocalFileHandle | undefined> {
      return runTransaction<LocalFileHandle | undefined>(FILES_STORE, 'readonly', (transaction, setResult) => {
        const request = transaction.objectStore(FILES_STORE).get(id)
        request.onsuccess = () => setResult((request.result as StoredFile | undefined)?.handle)
      })
    },
    async putRoot(root: SourceRoot): Promise<void> {
      await runTransaction<void>(ROOTS_STORE, 'readwrite', transaction => {
        transaction.objectStore(ROOTS_STORE).put(root)
      })
    },
    async getRoots(): Promise<SourceRoot[]> {
      return runTransaction<SourceRoot[]>(ROOTS_STORE, 'readonly', (transaction, setResult) => {
        const request = transaction.objectStore(ROOTS_STORE).getAll()
        request.onsuccess = () => setResult(request.result as SourceRoot[])
      })
    },
    async clear(): Promise<void> {
      await runTransaction<void>([TASKS_STORE, FILES_STORE, ROOTS_STORE], 'readwrite', transaction => {
        transaction.objectStore(TASKS_STORE).clear()
        transaction.objectStore(FILES_STORE).clear()
        transaction.objectStore(ROOTS_STORE).clear()
      })
    },
  }
}
