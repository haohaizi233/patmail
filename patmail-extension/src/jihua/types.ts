/** Name-only inventory. File bytes are requested exclusively by the upload runner. */
export interface LocalFileHandle {
  kind: 'file'
  name: string
  getFile(): Promise<File>
  isSameEntry?(other: unknown): Promise<boolean>
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
}
export interface LocalDirectoryHandle {
  kind: 'directory'
  name: string
  values(): AsyncIterable<LocalFileHandle | LocalDirectoryHandle>
  isSameEntry?(other: unknown): Promise<boolean>
  queryPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: 'read' }): Promise<PermissionState>
}
export interface SourceRoot { id: string; name: string; handle: LocalDirectoryHandle }
export interface Material {
  key: string
  label: string
  appendixType: string
  field: string
  ofcType?: string
  limit: number
  group?: 'fast' | 'general' | 'review'
  types?: PatentType[]
}
export type PatentType = 'INVENTION' | 'UTILITY'
export type RowStatus = 'pending' | 'checking' | 'uploading' | 'associating' | 'verifying' | 'success' | 'failed' | 'already' | 'unmatched' | 'excluded'
export interface TargetRecord { id: string; type: PatentType; applicationNo: string; name?: string }
export interface Attachment { ID: string; APPENDIX_NAME?: string; APPENDIX_URL?: string; [key: string]: unknown }
export interface UploadReceipt { attachments: Attachment[]; ofcRecognized?: boolean; warning?: string }
export interface UploadIntent { requestId: string; sessionKey: string; tabId: number; documentId: string; sent: boolean; materialKey?: string; applicationNo?: string }
export interface JihuaRow {
  id: string
  rootId: string
  relativePath: string
  fileName: string
  extension: string
  applicationNo: string
  caseName: string
  description: string
  materialKey: string
  selected: boolean
  status: RowStatus
  error: string
  attempts: number
  updatedAt: number
  record?: TargetRecord
  intent?: UploadIntent
  receipt?: UploadReceipt
}
export interface JihuaSession { key: string; tabId: number; documentId: string; title: string }
export interface JihuaTask {
  id: string
  createdAt: number
  updatedAt: number
  status: 'ready' | 'running' | 'pausing' | 'paused' | 'completed' | 'failed' | 'cancelled'
  roots: Array<{ id: string; name: string }>
  rows: JihuaRow[]
  scannedFiles: number
  excludedFiles: number
  errors: string[]
  pauseReason?: string
  recovery?: { attempt: number; maxAttempts: number; retryAt: number; reason: string }
  writeFailureStreak?: { upload: number; association: number; circuitOpen?: boolean }
  session?: JihuaSession
}
export interface JihuaTaskSummary {
  id: string
  createdAt: number
  updatedAt: number
  status: JihuaTask['status']
  rowCount: number
  unconfirmedCount: number
}
export interface Detail { form: Record<string, unknown>; attachments: Record<string, Attachment[]> }
export type RemoteReceipt = { state: 'missing' | 'pending' | 'done' | 'failed'; value?: unknown; error?: string }
export interface JihuaTransport {
  readonly session: JihuaSession
  checkSession(this: void): Promise<void>
  stopWaiting?(this: void): void
  request(this: void, path: string, method?: 'GET' | 'POST', body?: unknown, requestId?: string): Promise<unknown>
  upload(this: void, file: File, material: Material, requestId: string, beforeSend: () => Promise<void>): Promise<unknown>
  receipt(this: void, requestId: string): Promise<RemoteReceipt>
  /** Retire a settled page receipt only after its IDs/outcome have been durably checkpointed. */
  acknowledge?(this: void, requestId: string): Promise<void>
}
export interface JihuaRepository {
  save(task: JihuaTask): Promise<void>
  load(): Promise<JihuaTask | null>
  archiveAndCreate(expectedId: string | null, next: JihuaTask): Promise<void>
  listHistory(): Promise<JihuaTaskSummary[]>
  findArchivedUploads(rows: readonly JihuaRow[]): Promise<JihuaRow[]>
  restoreTask(id: string, expectedId: string | null): Promise<JihuaTask>
  putFile(id: string, handle: LocalFileHandle): Promise<void>
  getFile(id: string): Promise<LocalFileHandle | undefined>
  putRoot(root: SourceRoot): Promise<void>
  getRoots(): Promise<SourceRoot[]>
  clear(): Promise<void>
}
