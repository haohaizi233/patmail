import { isQueryGuid } from '../query/query-validator'
import { downloadRecipe } from '../mail/download-name'
import { isRecord, readClientInfo } from './response-guards'
import { apiError, type ApiResult } from './types'

/** 下载文件名模板行。保存和删除的响应都带回这个账号的完整 TempNameList。 */
export interface FileTempNameRow {
  id: string
  tempName: string
  newFilename: string
  fileNameType: string
}

export interface FileTempNameList {
  templates: FileTempNameRow[]
}

export interface FileTempNameInput {
  tempName: string
  newFilename: string
  fileNameType: string
}

/**
 * 保存下载文件名模板。Call 名里的 `Tepm` 是原站页面原文（FileSearch.js 的 FileManager.SaveFile）。
 * 配方沿用下载名称的段校验：`new_filename` 与 `file_name_type` 逐段用分号对应。
 */
export function fileTempSaveParams(input: FileTempNameInput): ApiResult<URLSearchParams> {
  const tempName = input.tempName.trim()
  if (!tempName || tempName.length > 80) return apiError('INVALID_QUERY', '下载名称模板名称无效。')
  const recipe = downloadRecipe(input.newFilename, input.fileNameType)
  if (!recipe) return apiError('INVALID_QUERY', '下载名称配方无效。')
  const params = new URLSearchParams()
  params.set('Call', 'SaveFileTepmName')
  params.set('new_filename', recipe.newFilename)
  params.set('temp_name', tempName)
  params.set('file_name_type', recipe.fileNameType)
  params.set('log_pagename', 'FileSearch.aspx')
  return { ok: true, data: params }
}

/** 删除下载文件名模板。temp_id 是 TempNameList 行的 id（FileSearch.js 的 FileManager.DelTemp）。 */
export function fileTempDeleteParams(tempId: string): ApiResult<URLSearchParams> {
  const id = tempId.trim()
  if (!isQueryGuid(id)) return apiError('INVALID_QUERY', '下载名称模板 ID 无效。')
  const params = new URLSearchParams()
  params.set('Call', 'DeleteTemp')
  params.set('temp_id', id)
  params.set('log_pagename', 'FileSearch.aspx')
  return { ok: true, data: params }
}

function readTempRow(row: unknown): FileTempNameRow | null {
  if (!isRecord(row)) return null
  const id = typeof row.id === 'string' ? row.id.trim() : ''
  const tempName = typeof row.temp_name === 'string' ? row.temp_name.trim() : ''
  const newFilename = typeof row.new_filename === 'string' ? row.new_filename : ''
  const fileNameType = typeof row.file_name_type === 'string' ? row.file_name_type : ''
  if (!isQueryGuid(id) || !tempName || tempName.length > 80) return null
  if (!newFilename || newFilename.length > 2000 || !fileNameType || fileNameType.length > 500) return null
  return { id, tempName, newFilename, fileNameType }
}

/**
 * 保存、删除共用的响应解析：ClientInfo.Result 为 false 时原站只给 Message，
 * 页面直接弹这段文字。成功时 TempNameList 是写完之后的完整列表，可以整体换掉下拉。
 */
export function readFileTempNameList(data: unknown): ApiResult<FileTempNameList> {
  if (!isRecord(data)) return apiError('INVALID_RESPONSE', '下载名称模板响应不是对象。')
  const client = readClientInfo(data.ClientInfo)
  if (!client.ok) return client
  if (client.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  if (client.data.Result !== true) {
    const message = typeof client.data.Message === 'string' ? client.data.Message.trim() : ''
    return apiError('BUSINESS_ERROR', message || '原网站没有写入下载名称模板。')
  }
  const raw = data.TempNameList
  // 原站没有模板时这个键是 null 或缺失，按空列表处理。
  if (raw === null || raw === undefined) return { ok: true, data: { templates: [] } }
  if (!Array.isArray(raw) || raw.length > 500) return apiError('INVALID_RESPONSE', '下载名称模板列表格式不对。')
  const templates: FileTempNameRow[] = []
  for (const row of raw) {
    const item = readTempRow(row)
    if (item) templates.push(item)
  }
  return { ok: true, data: { templates } }
}
