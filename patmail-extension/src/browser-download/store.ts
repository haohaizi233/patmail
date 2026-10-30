import type { CachedFileInfo } from '../api/stream-cache'
import type { BrowserBlob, BrowserDownloadStore, BrowserDownloadTask } from './types'

const DB = 'patmail-browser-downloads'
const STORES = ['tasks', 'manifests', 'blobs', 'chunks', 'names']
const BLOCK = 256 * 1024
const TTL = 7 * 86400000
type TaskRecord = Omit<BrowserDownloadTask, 'manifest'> & { generation: string }
interface BlobRecord extends CachedFileInfo { taskId: string; blob: string; revision: string; epoch: string }
interface ChunkRecord { taskId: string; blob: string; offset: number; bytes: Uint8Array<ArrayBuffer>; digest: string }
interface NameRecord { taskId: string; offset: number; names: string[] }
const emptyInfo = (): CachedFileInfo => ({ receivedBytes: 0, complete: false })
const integer = (value: number) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid cache offset or size') }
function blobKey(blob: BrowserBlob): string {
  if (blob === 'archive') return blob
  integer(blob)
  return String(blob)
}
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error) })
}
/** IDB 的 get/getAll 等签名返回 any；统一在边界收窄成明确记录类型，避免 any 流进业务逻辑。 */
function typedRequest<T>(req: IDBRequest): Promise<T> {
  return request(req as IDBRequest<T>)
}
async function digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
}
function metadata(value: Partial<CachedFileInfo>): Partial<CachedFileInfo> {
  if (value.totalBytes != null) integer(value.totalBytes)
  if (value.skipReason !== undefined && (typeof value.skipReason !== 'string' || !value.skipReason.trim() || value.skipReason.length > 1000)) throw new Error('Invalid skip reason')
  if (value.sourceNotice !== undefined && (typeof value.sourceNotice !== 'string' || value.sourceNotice.length > 1000)) throw new Error('Invalid source notice')
  return { ...(value.totalBytes !== undefined ? { totalBytes: value.totalBytes } : {}),
    ...(value.etag !== undefined ? { etag: value.etag } : {}),
    ...(value.lastModified !== undefined ? { lastModified: value.lastModified } : {}),
    ...(value.skipReason !== undefined ? { skipReason: value.skipReason } : {}),
    ...(value.sourceNotice !== undefined ? { sourceNotice: value.sourceNotice } : {}) }
}

/** ACKs resolve only after a strict-durability transaction commits. Crypto is always outside transactions. */
export function createBrowserDownloadStore(factory: IDBFactory = indexedDB): BrowserDownloadStore {
  let database: Promise<IDBDatabase> | undefined
  function open(): Promise<IDBDatabase> {
    database ??= new Promise((resolve, reject) => {
      const req = factory.open(DB, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        db.createObjectStore('tasks', { keyPath: 'taskId' })
        db.createObjectStore('manifests')
        for (const name of ['blobs', 'chunks', 'names']) {
          const store = db.createObjectStore(name, { keyPath: name === 'chunks' ? ['taskId', 'blob', 'offset'] : name === 'blobs' ? ['taskId', 'blob'] : ['taskId', 'offset'] })
          store.createIndex('taskId', 'taskId')
        }
      }
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result) }
      req.onerror = () => reject(req.error)
      req.onblocked = () => reject(new Error('Download cache database upgrade blocked'))
    })
    return database
  }
  async function transaction<T>(mode: IDBTransactionMode, run: (tx: IDBTransaction) => Promise<T>): Promise<T> {
    const db = await open()
    const tx = db.transaction(STORES, mode, mode === 'readwrite' ? { durability: 'strict' } : undefined)
    let failure: unknown
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('Cache transaction aborted'))
      tx.onerror = () => { /* onabort is the authoritative failure event */ }
    })
    // Attach immediately, including when the body itself rejects before awaiting completion.
    void done.catch(() => {})
    try { const value = await run(tx); await done; return value }
    catch (error) { failure = error; try { tx.abort() } catch { /* already aborted */ } await done.catch(() => {}); throw error }
  }
  async function task(tx: IDBTransaction, taskId: string): Promise<TaskRecord> {
    const value = await typedRequest<TaskRecord | undefined>(tx.objectStore('tasks').get(taskId))
    if (!value) throw new Error('Download task does not exist')
    return value
  }
  function writable(value: TaskRecord): void { if (value.state === 'done') throw new Error('Download task already completed') }
  async function touch(tx: IDBTransaction, value: TaskRecord): Promise<void> {
    await request(tx.objectStore('tasks').put({ ...value, updatedAt: Date.now() }))
  }
  async function erase(tx: IDBTransaction, taskId: string, keepReceipt = false): Promise<void> {
    for (const name of ['blobs', 'chunks', 'names']) {
      await new Promise<void>((resolve, reject) => {
        const cursor = tx.objectStore(name).index('taskId').openCursor(IDBKeyRange.only(taskId))
        cursor.onerror = () => reject(cursor.error)
        cursor.onsuccess = () => { const row = cursor.result; if (!row) return resolve(); row.delete(); row.continue() }
      })
    }
    if (!keepReceipt) {
      await request(tx.objectStore('manifests').delete(taskId))
      await request(tx.objectStore('tasks').delete(taskId))
    }
  }
  async function collect(tx: IDBTransaction): Promise<void> {
    const all = await typedRequest<TaskRecord[]>(tx.objectStore('tasks').getAll())
    for (const value of all) if ((value.state === 'paused' || value.state === 'done') && value.updatedAt < Date.now() - TTL) await erase(tx, value.taskId)
  }
  async function blobInfo(tx: IDBTransaction, taskId: string, blob: string): Promise<BlobRecord | undefined> {
    return typedRequest<BlobRecord | undefined>(tx.objectStore('blobs').get([taskId, blob]))
  }
  async function rows(tx: IDBTransaction, taskId: string, blob: string, offset: number, end: number): Promise<ChunkRecord[]> {
    // Include the block containing offset; chunks can have arbitrary start offsets.
    const store = tx.objectStore('chunks')
    const before = await request(store.openCursor(IDBKeyRange.bound([taskId, blob, 0], [taskId, blob, offset]), 'prev'))
    const start = before ? (before.value as ChunkRecord).offset : offset
    return typedRequest<ChunkRecord[]>(store.getAll(IDBKeyRange.bound([taskId, blob, start], [taskId, blob, end], false, true)))
  }
  async function verified(rows: ChunkRecord[], offset: number, length: number): Promise<Uint8Array<ArrayBuffer>> {
    const result = new Uint8Array(length)
    let next = offset
    for (const row of rows) {
      if (await digest(row.bytes) !== row.digest) throw new Error('Download cache checksum mismatch')
      const start = Math.max(next, row.offset), end = Math.min(offset + length, row.offset + row.bytes.length)
      if (start > next) throw new Error('Download cache has a gap')
      if (end > start) { result.set(row.bytes.subarray(start - row.offset, end - row.offset), start - offset); next = end }
    }
    if (next !== offset + length) throw new Error('Download cache is incomplete')
    return result
  }
  const store: BrowserDownloadStore = {
    async create(value) {
      if (!value.taskId || !value.owner) throw new Error('Missing task identity')
      const frozen = structuredClone(value)
      await transaction('readwrite', async tx => {
        await collect(tx)
        if (await request(tx.objectStore('tasks').get(frozen.taskId))) throw new Error('Download task already exists')
        const { manifest, ...record } = frozen
        await request(tx.objectStore('manifests').add(manifest, frozen.taskId))
        await request(tx.objectStore('tasks').add({ ...record, generation: crypto.randomUUID() }))
      })
    },
    async get(taskId) {
      return transaction('readwrite', async tx => {
        await collect(tx)
        const value = await typedRequest<TaskRecord | undefined>(tx.objectStore('tasks').get(taskId))
        if (!value) return null
        const { generation: _generation, ...record } = value
        return { ...record, manifest: await typedRequest<BrowserDownloadTask['manifest']>(tx.objectStore('manifests').get(taskId)) }
      })
    },
    async update(taskId, patch) {
      const targetChanged = Object.prototype.hasOwnProperty.call(patch, 'activeTargetId')
      const targetId = patch.activeTargetId
      if (targetChanged && targetId !== undefined && (typeof targetId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId))) throw new Error('Invalid active target UUID')
      await transaction('readwrite', async tx => {
        const current = await task(tx, taskId)
        writable(current)
        if (patch.state === 'done') throw new Error('Use complete to commit a done receipt')
        const next = { ...current, updatedAt: patch.updatedAt ?? Date.now(),
          ...(patch.state !== undefined ? { state: patch.state } : {}),
          ...(patch.completedBytes !== undefined ? { completedBytes: patch.completedBytes } : {}),
          ...(patch.failedCount !== undefined ? { failedCount: patch.failedCount } : {}),
          ...(patch.deduplicatedCount !== undefined ? { deduplicatedCount: patch.deduplicatedCount } : {}),
          ...(targetChanged ? { activeTargetId: targetId } : {}) }
        if (next.completedBytes !== undefined) integer(next.completedBytes)
        if (next.failedCount !== undefined) integer(next.failedCount)
        if (next.deduplicatedCount !== undefined) integer(next.deduplicatedCount)
        await request(tx.objectStore('tasks').put(next))
      })
    },
    async info(taskId, blob) {
      const key = blobKey(blob)
      return transaction('readonly', async tx => {
        await task(tx, taskId)
        const value = await blobInfo(tx, taskId, key)
        return value ? { receivedBytes: value.receivedBytes, complete: value.complete, ...metadata(value) } : emptyInfo()
      })
    },
    async reset(taskId, blob, extra) {
      const key = blobKey(blob), meta = metadata(extra)
      await transaction('readwrite', async tx => {
        const current = await task(tx, taskId); writable(current)
        if (current.state === 'sealed') throw new Error('Archive is sealed')
        const chunks = tx.objectStore('chunks')
        await request(chunks.delete(IDBKeyRange.bound([taskId, key, 0], [taskId, key, Number.MAX_SAFE_INTEGER])))
        await request(tx.objectStore('blobs').put({ taskId, blob: key, ...meta, ...emptyInfo(), revision: crypto.randomUUID(), epoch: crypto.randomUUID() }))
        await touch(tx, current)
      })
    },
    async append(taskId, blob, offset, input) {
      integer(offset)
      const key = blobKey(blob), bytes = new Uint8Array(input)
      integer(offset + bytes.length)
      let generation: string | undefined, epoch: string | undefined
      for (;;) {
        const snapshot = await transaction('readonly', async tx => {
          const current = await task(tx, taskId); writable(current)
          const info = await blobInfo(tx, taskId, key)
          const currentEpoch = info?.epoch ?? `initial-${current.generation}`
          generation ??= current.generation; epoch ??= currentEpoch
          if (generation !== current.generation || epoch !== currentEpoch) throw new Error('Cache task or blob was replaced during write')
          const received = info?.receivedBytes ?? 0
          if (offset > received) throw new Error('Non-contiguous cache write')
          if ((info?.complete || current.state === 'sealed') && offset + bytes.length > received) throw new Error('Blob is complete')
          const overlap = Math.min(bytes.length, received - offset)
          return { info, received, overlap, rows: overlap ? await rows(tx, taskId, key, offset, offset + overlap) : [] }
        })
        const prefix = await verified(snapshot.rows, offset, snapshot.overlap)
        if (prefix.some((byte, index) => byte !== bytes[index])) throw new Error('Download cache overlap conflict')
        const additions: ChunkRecord[] = []
        for (let index = snapshot.overlap; index < bytes.length; index += BLOCK) {
          const part = bytes.slice(index, index + BLOCK)
          additions.push({ taskId, blob: key, offset: offset + index, bytes: part, digest: await digest(part) })
        }
        const committed = await transaction('readwrite', async tx => {
          const current = await task(tx, taskId); writable(current)
          const latest = await blobInfo(tx, taskId, key)
          if (current.generation !== generation || (latest?.epoch ?? `initial-${current.generation}`) !== epoch) throw new Error('Cache task or blob was replaced during write')
          if (latest?.revision !== snapshot.info?.revision) return false
          if (current.state === 'sealed' && additions.length) throw new Error('Archive is sealed')
          const receivedBytes = Math.max(snapshot.received, offset + bytes.length)
          if (latest?.totalBytes != null && receivedBytes > latest.totalBytes) throw new Error('Blob exceeds expected size')
          for (const part of additions) await request(tx.objectStore('chunks').add(part))
          await request(tx.objectStore('blobs').put({ ...emptyInfo(), ...latest, taskId, blob: key, receivedBytes, revision: crypto.randomUUID(), epoch }))
          await touch(tx, current)
          return true
        })
        if (committed) return
      }
    },
    async finishBlob(taskId, blob, extra = {}) {
      const key = blobKey(blob), meta = metadata(extra)
      await transaction('readwrite', async tx => {
        const current = await task(tx, taskId); writable(current)
        const value = { ...emptyInfo(), epoch: `initial-${current.generation}`, ...await blobInfo(tx, taskId, key), ...meta }
        if (value.totalBytes != null && value.totalBytes !== value.receivedBytes) throw new Error('Blob size does not match expected total')
        await request(tx.objectStore('blobs').put({ ...value, totalBytes: value.receivedBytes, complete: true, taskId, blob: key, revision: crypto.randomUUID() }))
        await touch(tx, current)
      })
    },
    async read(taskId, blob, offset, limit = BLOCK) {
      integer(offset); integer(limit)
      const key = blobKey(blob)
      const snapshot = await transaction('readonly', async tx => {
        await task(tx, taskId)
        const info = await blobInfo(tx, taskId, key)
        const length = Math.min(limit, Math.max(0, (info?.receivedBytes ?? 0) - offset))
        return { length, chunks: length ? await rows(tx, taskId, key, offset, offset + length) : [] }
      })
      return verified(snapshot.chunks, offset, snapshot.length)
    },
    async saveNames(taskId, offset, names) {
      integer(offset)
      const values = [...names]
      await transaction('readwrite', async tx => {
        const current = await task(tx, taskId); writable(current)
        const records = tx.objectStore('names')
        const existing = await typedRequest<NameRecord | undefined>(records.get([taskId, offset]))
        if (existing && JSON.stringify(existing.names) !== JSON.stringify(values)) throw new Error('Download names batch conflict')
        const batches = await typedRequest<NameRecord[]>(records.index('taskId').getAll(taskId))
        for (const batch of batches) {
          const start = Math.max(offset, batch.offset), end = Math.min(offset + values.length, batch.offset + batch.names.length)
          for (let index = start; index < end; index++) if (values[index - offset] !== batch.names[index - batch.offset]) throw new Error('Download names overlap conflict')
        }
        await request(records.put({ taskId, offset, names: values }))
        await touch(tx, current)
      })
    },
    async names(taskId) {
      return transaction('readonly', async tx => {
        await task(tx, taskId)
        const values = await typedRequest<NameRecord[]>(tx.objectStore('names').index('taskId').getAll(taskId))
        return Object.fromEntries(values.map(value => [String(value.offset), value.names]))
      })
    },
    async skipped(taskId) {
      return transaction('readonly', async tx => {
        await task(tx, taskId)
        const values = await typedRequest<BlobRecord[]>(tx.objectStore('blobs').index('taskId').getAll(taskId))
        return values.filter(value => value.blob !== 'archive' && value.complete && !!value.skipReason).length
      })
    },
    async complete(taskId, bytes) {
      integer(bytes)
      await transaction('readwrite', async tx => {
        const current = await task(tx, taskId)
        if (current.state === 'done') { if (current.completedBytes !== bytes) throw new Error('Completion receipt conflict'); return }
        const archive = await blobInfo(tx, taskId, 'archive')
        if (!archive?.complete || archive.receivedBytes !== bytes) throw new Error('Archive is not fully sealed')
        await request(tx.objectStore('tasks').put({ ...current, state: 'done', completedBytes: bytes, updatedAt: Date.now() }))
        await erase(tx, taskId, true)
      })
    },
    async discard(taskId) { await transaction('readwrite', tx => erase(tx, taskId)) },
  }
  return store
}
