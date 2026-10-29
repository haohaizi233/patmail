import type { CachedFileInfo } from '../api/stream-cache'

export type BrowserBlob = 'archive' | number
export interface BrowserDownloadTask {
  taskId: string
  owner: string
  fileName: string
  manifest: Record<string, unknown>
  state: 'running' | 'paused' | 'sealed' | 'done'
  zipCreatedAt: string
  updatedAt: number
  completedBytes?: number
  failedCount?: number
  activeTargetId?: string
}
export interface BrowserDownloadStore {
  create(task: BrowserDownloadTask): Promise<void>
  get(taskId: string): Promise<BrowserDownloadTask | null>
  update(taskId: string, patch: Partial<Pick<BrowserDownloadTask, 'state' | 'updatedAt' | 'completedBytes' | 'activeTargetId' | 'failedCount'>>): Promise<void>
  info(taskId: string, blob: BrowserBlob): Promise<CachedFileInfo>
  reset(taskId: string, blob: BrowserBlob, metadata: Partial<CachedFileInfo>): Promise<void>
  append(taskId: string, blob: BrowserBlob, offset: number, bytes: Uint8Array): Promise<void>
  finishBlob(taskId: string, blob: BrowserBlob, metadata?: Partial<CachedFileInfo>): Promise<void>
  read(taskId: string, blob: BrowserBlob, offset: number, limit?: number): Promise<Uint8Array>
  saveNames(taskId: string, offset: number, names: string[]): Promise<void>
  names(taskId: string): Promise<Record<string, string[]>>
  skipped?(taskId: string): Promise<number>
  complete(taskId: string, bytes: number): Promise<void>
  discard(taskId: string): Promise<void>
}
export const BROWSER_FILE_CHANNEL = 'PATMAIL_BROWSER_FILE'
export interface BrowserFileRequest {
  channel: typeof BROWSER_FILE_CHANNEL
  targetId: string
  taskId: string
  owner: string
  action: 'open' | 'write' | 'finish' | 'pause'
  offset?: number
  data?: string
  fileName?: string
}
export type BrowserFileReply = { ok: true } | { ok: false; error: string; code?: 'HOST_GONE' }
