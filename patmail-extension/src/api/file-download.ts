import { businessMessage, isRecord, readClientInfo } from './response-guards'
import { apiError, type ApiResult } from './types'

/** 一次打包的文件数护栏（不是产品上限，下载数量不设限）：file_no 和 file_name 一一对应。 */
export const DOWNLOAD_MAX_ITEMS = 10_000

/** 待下载文件：GetFileName 认 file_id，DownLoad 认 file_no，原名在没有下载名称时兜底。 */
export interface DownloadFileItem {
  fileId: string
  fileNo: string
  fileName: string
}

export interface DownloadHandle {
  fileGuid: string
  fileSize: number | null
  /** 原站报的打包失败提示（例如「您共1个文件下载失败」）。没有失败就不带。 */
  notice: string
}

export interface DownloadedArchive {
  /** 取包地址（FileHandler.ashx?guid=），交给浏览器下载，压缩包条目名已经改好。 */
  downloadUrl: string
  fileName: string
  fileCount: number
  notice: string
}

/** 照抄原站文件查询的 DownLoad 请求：zip_name 留空，包名由插件自己起。 */
export function buildDownloadParams(fileNos: string[], names: string[]): URLSearchParams | null {
  if (!fileNos.length || fileNos.length !== names.length || fileNos.length > DOWNLOAD_MAX_ITEMS) return null
  if (fileNos.some(no => !no || no.length > 40 || no.includes(';'))) return null
  if (names.some(name => !name || name.length > 180 || name.includes(';'))) return null
  const params = new URLSearchParams()
  params.set('Call', 'DownLoad')
  params.set('file_no', fileNos.join(';'))
  params.set('file_name', names.join(';'))
  params.set('zip_name', '')
  params.set('zip_pwd', '')
  params.set('down_type', '')
  params.set('model', 'FILE')
  params.set('childpath', '')
  params.set('log_pagename', 'FileSearch.aspx')
  return params
}

/** 原站成功时 ClientInfo.Result 也可能还是 false，认 file_guid；error_message 只在真有文件失败时带出。 */
export function readDownloadHandle(data: unknown): ApiResult<DownloadHandle> {
  if (!isRecord(data)) return apiError('INVALID_RESPONSE', '下载打包响应不是对象。')
  const client = readClientInfo(data.ClientInfo)
  if (!client.ok) return client
  if (client.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  const fileGuid = typeof data.file_guid === 'string' ? data.file_guid.trim() : ''
  if (!fileGuid) {
    return apiError('BUSINESS_ERROR', client.data.Status === false || client.data.Result === false
      ? businessMessage(client.data)
      : '下载打包没有返回文件编号，没有下载。')
  }
  const size = data.file_size
  const fileSize = typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size
    : typeof size === 'string' && /^\d+$/.test(size) ? Number(size)
    : null
  return { ok: true, data: { fileGuid, fileSize, notice: failureNotice(data) } }
}

function failureNotice(data: Record<string, unknown>): string {
  const message = typeof data.error_message === 'string' ? data.error_message.trim() : ''
  if (!message) return ''
  const failed = /共(\d+)个文件下载失败/.exec(message)
  if (failed) return Number(failed[1]) > 0 ? message.slice(0, 200) : ''
  return message.slice(0, 200)
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** 原站的包名是时间戳（1793001423.zip）。插件另存时用看得懂的名字。 */
export function downloadArchiveName(now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `下载文件-${stamp}.zip`
}
