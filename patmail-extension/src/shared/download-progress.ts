import { DOWNLOAD_MAX_ITEMS } from '../api/file-download'
import { isRecord } from './guards'

export const DOWNLOAD_PROGRESS_CHANNEL = 'patmail-download-progress'
export const DOWNLOAD_RESULT_CHANNEL = 'patmail-download-result'
export interface FileDownloadProgress {
  /** naming/packing 用文件数计进度；downloading 用字节数（receivedBytes/totalBytes），done/total 固定 0/1。 */
  phase: 'naming' | 'packing' | 'saving' | 'downloading'
  done: number
  total: number
  elapsedMs?: number
  receivedBytes?: number
  /** 只有浏览器下载阶段有：响应头声明的总字节，拿不到就留空。 */
  totalBytes?: number
  /** 只有浏览器下载阶段有：inProgress 是流式进度，complete/interrupted 是终态，最终结果据此定成败。 */
  state?: 'inProgress' | 'complete' | 'interrupted'
}
export function isDownloadProgress(value: unknown): value is FileDownloadProgress {
  return isRecord(value) && (value.phase === 'naming' || value.phase === 'packing' || value.phase === 'saving' || value.phase === 'downloading') &&
    typeof value.done === 'number' && Number.isSafeInteger(value.done) && value.done >= 0 &&
    typeof value.total === 'number' && Number.isSafeInteger(value.total) && value.total > 0 &&
    value.total <= DOWNLOAD_MAX_ITEMS && value.done <= value.total &&
    [value.elapsedMs, value.receivedBytes, value.totalBytes].every(item => item === undefined || (typeof item === 'number' && Number.isSafeInteger(item) && item >= 0)) &&
    (value.state === undefined || value.state === 'inProgress' || value.state === 'complete' || value.state === 'interrupted')
}
