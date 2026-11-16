import type { HagueRow } from './workflow'
import type { DraftBatchProgress } from './draft-batch'
import type { DraftCheckpoint } from './draft-contract'

export const HAGUE_WORKSPACE_SCOPE = 'local|hague-workspace-v1'
export interface ActiveDraftBatch { jobs: Array<{ path: string; caseRunId: string }>; parallel: boolean }
interface AssetRef { key: string; name: string; type: string; size: number; lastModified: number; path: string }
type StoredRow = Omit<HagueRow, 'folder'> & { folder: Omit<HagueRow['folder'], 'documents' | 'images'> & { documents: AssetRef[]; images: AssetRef[] } }
export interface HagueWorkspace {
  version: 1; materialId: string; rows: StoredRow[]; selected: number; concurrency: number
  transport: 'http' | 'page'; exportFormat: 'pdf' | 'zip'; batch: DraftBatchProgress
  current: DraftCheckpoint | null; activeBatch?: ActiveDraftBatch; approvedTab?: number
}
const DATABASE = 'patmail-hague-materials-v1'
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('材料存储不可用'))
  })
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error('材料落盘失败'))
  })
}
export function workspaceRows(rows: readonly HagueRow[], materialId: string): StoredRow[] {
  let index = 0
  const asset = (file: File): AssetRef => ({ key: `${materialId}:${index++}`, name: file.name, type: file.type, size: file.size, lastModified: file.lastModified, path: file.webkitRelativePath })
  return rows.map(row => ({ ...row, folder: { ...row.folder, documents: row.folder.documents.map(asset), images: row.folder.images.map(asset) } }))
}
/** Commit the bytes before publishing a WAL manifest that refers to them. */
export async function saveWorkspaceMaterials(rows: readonly HagueRow[], materialId: string): Promise<void> {
  const db = await database()
  try {
    const transaction = db.transaction('files', 'readwrite'), done = transactionDone(transaction)
    let index = 0
    for (const row of rows) for (const file of [...row.folder.documents, ...row.folder.images]) transaction.objectStore('files').put(file, `${materialId}:${index++}`)
    await done
  } finally { db.close() }
}
/** Invoke only after the replacement manifest has committed, under the run lock. */
export async function pruneWorkspaceMaterials(materialId:string):Promise<void>{
  const db=await database()
  try{
    const transaction=db.transaction('files','readwrite'),done=transactionDone(transaction)
    const cursor=transaction.objectStore('files').openKeyCursor()
    cursor.onsuccess=()=>{const entry=cursor.result;if(!entry)return;if(typeof entry.key==='string'&&!entry.key.startsWith(`${materialId}:`))transaction.objectStore('files').delete(entry.key);entry.continue()}
    await done
  }finally{db.close()}
}
export async function restoreWorkspaceRows(snapshot: HagueWorkspace): Promise<HagueRow[]> {
  if (snapshot.version !== 1 || !Array.isArray(snapshot.rows) || !snapshot.materialId) throw new Error('工作台恢复记录无效，请重新导入材料。')
  const db = await database()
  try {
    const transaction = db.transaction('files', 'readonly'), done = transactionDone(transaction)
    const read = (ref: AssetRef): Promise<File> => new Promise((resolve, reject) => {
      if (!ref.key.startsWith(`${snapshot.materialId}:`)) { reject(new Error('材料清单不匹配，未继续原批次。')); return }
      const request = transaction.objectStore('files').get(ref.key)
      request.onerror = () => reject(request.error ?? new Error('材料读取失败'))
      request.onsuccess = () => {
        const blob: unknown = request.result
        if (!(blob instanceof Blob) || blob.size !== ref.size) { reject(new Error(`恢复材料缺失：${ref.name}。请重新导入，未自动创建草稿。`)); return }
        const file = new File([blob], ref.name, { type: ref.type, lastModified: ref.lastModified })
        Object.defineProperty(file, 'webkitRelativePath', { value: ref.path })
        resolve(file)
      }
    })
    const restored = await Promise.all(snapshot.rows.map(async row => ({ ...row, folder: { ...row.folder, documents: await Promise.all(row.folder.documents.map(read)), images: await Promise.all(row.folder.images.map(read)) } })))
    await done
    return restored
  } finally { db.close() }
}
/** Only a checkpoint from this exact batch generation can advance its job. */
export function checkpointForBatch(checkpoint: DraftCheckpoint | undefined, caseRunId: string): DraftCheckpoint | undefined {
  return checkpoint?.caseRunId === caseRunId ? checkpoint : undefined
}
export async function withHagueBatchLock(work: () => Promise<void>, unavailable: () => void): Promise<void> {
  if (!navigator.locks) throw new Error('浏览器不支持工作流运行锁，未开始自动写入。')
  await navigator.locks.request('patmail:hague-draft-batch', { ifAvailable: true }, async lock => {
    if (!lock) { unavailable(); return }
    await work()
  })
}
