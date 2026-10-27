import { apiError, type ApiResult } from '../api/types'
import { isRecord, readClientInfo } from '../api/response-guards'
import type { EasyTransport } from '../api/transport'
import { DOWNLOAD_MAX_ITEMS } from '../api/file-download'
import { isQueryGuid } from '../query/query-validator'

/** 文件查询里选中的下载名称。不进 GetSearchFiles，发文前交给 GetFileName。 */
export interface FileDownloadSelection {
  templateId?: string
  column?: string
  fixedText?: string
  /** 选中时从模板行抄下的配方。发文时优先用账号上的最新模板。 */
  newFilename?: string
  fileNameType?: string
  label?: string
}

export interface DownloadNameRecipe {
  newFilename: string
  fileNameType: string
}

export interface DownloadNamePart { column: string; fixedText: string }
export class DownloadNameValidationError extends Error {}

export function downloadNameParts(selection: FileDownloadSelection | null): DownloadNamePart[] {
  const recipe = selection?.newFilename && selection.fileNameType
    ? downloadRecipe(selection.newFilename, selection.fileNameType) : null
  if (!recipe) return [{ column: selection?.column ?? '', fixedText: selection?.fixedText ?? '' }]
  const names = recipe.newFilename.split(';')
  return recipe.fileNameType.split(';').map((kind, index) => ({
    column: kind === 'txt' ? 'fixtxt' : names[index], fixedText: kind === 'txt' ? names[index] : ''
  }))
}

/** 编辑过的配方不携带模板ID，避免下载时重新加载模板覆盖本次修改。 */
export function selectionFromNameParts(parts: DownloadNamePart[], label = ''): FileDownloadSelection | null {
  const names: string[] = []
  const types: string[] = []
  for (const [index, part] of parts.entries()) {
    if (!part.column) continue
    if (part.column === 'fixtxt' && !part.fixedText.trim()) {
      throw new DownloadNameValidationError(`第${index + 1}段固定字符不能为空。`)
    }
    names.push(part.column === 'fixtxt' ? part.fixedText.trim() : part.column)
    types.push(part.column === 'fixtxt' ? 'txt' : 'colname')
  }
  if (!names.length) return null
  const recipe = downloadRecipe(names.join(';'), types.join(';'))
  // 单段固定字符含分号不能混入配方分隔符。
  if (!recipe || parts.some(part => part.column === 'fixtxt' && part.fixedText.includes(';'))) {
    throw new DownloadNameValidationError('下载名称最多31段，每段最多80字，固定字符不能包含分号。')
  }
  return { ...recipe, label: label ? `${label.slice(0, 73)}（已修改）` : '自定义下载名称' }
}

export interface DownloadNameOptions {
  /** 已完成的文件数；并发批次完成顺序不影响返回名称的顺序。 */
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

const COLUMN = /^[A-Za-z_][A-Za-z0-9_]{0,40}$/
/** 命名一批 40 个：100 个一批单批要跑几分钟，中途一断整批重来；40 个一批是单批耗时与往返次数的折中。 */
export const NAME_BATCH = 40
/** 命名并发 2 路：6 路打满同源 6 条连接时，GetUserModel 这类会话检测会被饿死 15 秒掐断，界面误判掉登录。 */
const NAME_CONCURRENCY = 2

function segments(value: string): string[] {
  return value.split(';')
}

export function downloadRecipe(newFilename: string, fileNameType: string): DownloadNameRecipe | null {
  const names = segments(newFilename.trim())
  const types = segments(fileNameType.trim())
  if (!names.length || names.length !== types.length || names.length > 31) return null
  if (names.some(name => !name || name.length > 80)) return null
  for (let index = 0; index < types.length; index += 1) {
    const kind = types[index]
    const name = names[index]
    if (kind === 'colname' && !COLUMN.test(name)) return null
    if (kind !== 'colname' && kind !== 'txt') return null
  }
  return { newFilename: names.join(';'), fileNameType: types.join(';') }
}

export function selectionFromControls(input: {
  templateId?: string
  column?: string
  fixedText?: string
  label?: string
  template?: { newFilename: string; fileNameType: string } | null
}): FileDownloadSelection | null {
  const templateId = input.templateId?.trim() ?? ''
  const column = input.column?.trim() ?? ''
  const fixedText = input.fixedText?.trim() ?? ''
  const label = input.label?.trim().slice(0, 80) ?? ''
  if (isQueryGuid(templateId)) {
    const recipe = input.template ? downloadRecipe(input.template.newFilename, input.template.fileNameType) : null
    return {
      templateId,
      ...(recipe ?? {}),
      ...(label ? { label } : {})
    }
  }
  if (!column) return null
  if (column === 'fixtxt') {
    if (!fixedText || fixedText.includes(';') || fixedText.length > 80) return null
    return { column: 'fixtxt', fixedText, newFilename: fixedText, fileNameType: 'txt', ...(label ? { label } : {}) }
  }
  if (!COLUMN.test(column)) return null
  return { column, newFilename: column, fileNameType: 'colname', ...(label ? { label } : {}) }
}

export function isFileDownloadSelection(value: unknown): value is FileDownloadSelection {
  if (!isRecord(value)) return false
  const keys = Object.keys(value)
  if (keys.some(key => !['templateId', 'column', 'fixedText', 'newFilename', 'fileNameType', 'label'].includes(key))) return false
  const templateId = value.templateId
  const column = value.column
  const fixedText = value.fixedText
  const label = value.label
  if (templateId !== undefined && (typeof templateId !== 'string' || !isQueryGuid(templateId))) return false
  if (column !== undefined && (typeof column !== 'string' || (column !== 'fixtxt' && !COLUMN.test(column)))) return false
  if (fixedText !== undefined && (typeof fixedText !== 'string' || !fixedText || fixedText.length > 80 || fixedText.includes(';'))) return false
  if (label !== undefined && (typeof label !== 'string' || !label.trim() || label.length > 80)) return false
  const named = value.newFilename
  const typed = value.fileNameType
  if ((named === undefined) !== (typed === undefined)) return false
  if (named !== undefined || typed !== undefined) {
    if (typeof named !== 'string' || typeof typed !== 'string' || !downloadRecipe(named, typed)) return false
  }
  if (!templateId && named === undefined && !column) return false
  if (column === 'fixtxt' && !fixedText && named === undefined) return false
  return true
}

export function downloadNameText(selection: FileDownloadSelection | null | undefined): string {
  const label = selection?.label?.trim()
  if (label) return label
  if (selection?.column === 'fixtxt') return selection.fixedText || '固定字符'
  if (selection?.column) return selection.column
  if (selection?.templateId) return '已选下载名称模板'
  return ''
}

/** 申请号带校验点（202610026334.9、202311613183.X）。下载文件名里把点去掉（2026100263349、202311613183X），扩展名和其他小数点不动。 */
const APPLICATION_NO_DOT = /(?<!\d)(\d{12}|\d{8})\.(?:(\d)(?!\d)|([Xx])(?![\dXx]))/g

export function stripApplicationNoDot(name: string): string {
  return name.replace(APPLICATION_NO_DOT, '$1$2$3')
}

export function recipeFromTempList(data: unknown, templateId: string): DownloadNameRecipe | null {
  if (!isRecord(data) || !Array.isArray(data.TempNameList)) return null
  for (const row of data.TempNameList) {
    if (!isRecord(row) || typeof row.id !== 'string' || row.id.toLowerCase() !== templateId.toLowerCase()) continue
    const filename = typeof row.new_filename === 'string' ? row.new_filename : ''
    const kind = typeof row.file_name_type === 'string' ? row.file_name_type : ''
    return downloadRecipe(filename, kind)
  }
  return null
}

function snapshotRecipe(selection: FileDownloadSelection): DownloadNameRecipe | null {
  if (!selection.newFilename || !selection.fileNameType) return null
  return downloadRecipe(selection.newFilename, selection.fileNameType)
}

export function buildGetFileNameParams(fileIds: string[], recipe: DownloadNameRecipe): URLSearchParams | null {
  if (!fileIds.length || fileIds.length > NAME_BATCH || fileIds.some(id => !isQueryGuid(id))) return null
  const params = new URLSearchParams()
  params.set('Call', 'GetFileName')
  params.set('file_ids', fileIds.join(';'))
  params.set('new_filename', recipe.newFilename)
  params.set('file_name_type', recipe.fileNameType)
  params.set('childpath', '')
  params.set('zip_name', '')
  params.set('zip_file_name_type', '')
  params.set('log_pagename', 'FileSearch.aspx')
  return params
}

/** 生成名与传入的文件 ID 一一对应。空段或超长名整批作废。 */
export function readGeneratedFileNames(data: unknown, count: number): string[] | null {
  if (!isRecord(data) || count < 1) return null
  const info = readClientInfo(data.ClientInfo)
  if (!info.ok || info.data.IsLogin === false || info.data.Status !== true || typeof data.file_names !== 'string') return null
  const names = data.file_names.split(';').map(name => name.trim())
  if (names.length !== count || names.some(name => !name || name.length > 180)) return null
  return names
}

async function recipeFor(transport: EasyTransport, selection: FileDownloadSelection, signal?: AbortSignal): Promise<ApiResult<DownloadNameRecipe>> {
  const saved = snapshotRecipe(selection)
  if (!selection.templateId) {
    return saved ? { ok: true, data: saved } : apiError('INVALID_QUERY', '下载名称没有配好，没有按这个名称发文。')
  }
  const params = new URLSearchParams()
  params.set('Call', 'GetFileTempNameList')
  params.set('log_pagename', 'FileSearch.aspx')
  const listed = await transport.post('fileTempList', params, signal)
  if (!listed.ok) {
    if (saved && listed.error.code !== 'SESSION_EXPIRED' && listed.error.code !== 'REQUEST_ABORTED') return { ok: true, data: saved }
    return listed
  }
  if (isRecord(listed.data)) {
    const info = readClientInfo(listed.data.ClientInfo)
    if (info.ok && info.data.IsLogin === false) return apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。')
  }
  const live = recipeFromTempList(listed.data, selection.templateId)
  if (live) return { ok: true, data: live }
  if (saved) return { ok: true, data: saved }
  return apiError('BUSINESS_ERROR', '这份下载名称模板不在当前账号里，没有按原文件名发文。')
}

/** 按下载名称模板生成发文用的文件名。查询结果里的附件原名留在调用方。 */
export async function resolveDownloadFileNames(
  transport: EasyTransport,
  fileIds: string[],
  selection: FileDownloadSelection,
  options: DownloadNameOptions = {}
): Promise<ApiResult<string[]>> {
  if (!fileIds.length || fileIds.length > DOWNLOAD_MAX_ITEMS || fileIds.some(id => !isQueryGuid(id))) {
    return apiError('INVALID_QUERY', '文件编号不能用来生成下载名称。')
  }
  if (options.signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
  options.onProgress?.(0, fileIds.length)
  const recipe = await recipeFor(transport, selection, options.signal)
  if (!recipe.ok) return recipe
  if (options.signal?.aborted) return apiError('REQUEST_ABORTED', '请求已取消。')
  const controller = new AbortController()
  let failure: ApiResult<never> | undefined
  const stop = (result: ApiResult<never>) => {
    failure ??= result
    controller.abort()
  }
  const abort = () => stop(apiError('REQUEST_ABORTED', '请求已取消。'))
  options.signal?.addEventListener('abort', abort, { once: true })
  const names: string[] = new Array(fileIds.length)
  let next = 0
  let completed = 0
  const worker = async () => {
    while (!failure && next < fileIds.length) {
      const index = next
      next += NAME_BATCH
      const batch = fileIds.slice(index, index + NAME_BATCH)
      const params = buildGetFileNameParams(batch, recipe.data)
      if (!params) {
        stop(apiError('INVALID_QUERY', '下载名称参数无效，没有发文。'))
        return
      }
      const response = await transport.post('getFileName', params, controller.signal)
      if (failure) return
      if (!response.ok) {
        stop(response)
        return
      }
      const info = isRecord(response.data) ? readClientInfo(response.data.ClientInfo) : null
      if (info?.ok && info.data.IsLogin === false) {
        stop(apiError('SESSION_EXPIRED', 'EASY 登录状态已失效。'))
        return
      }
      const generated = readGeneratedFileNames(response.data, batch.length)
      if (!generated) {
        stop(apiError('INVALID_RESPONSE', '下载名称没有生成完整的文件名，没有按原文件名发文。'))
        return
      }
      // 原站只给分号分隔的名称，没有 ID；必须按请求的原偏移落位。
      names.splice(index, generated.length, ...generated)
      completed += batch.length
      options.onProgress?.(completed, fileIds.length)
    }
  }
  try {
    await Promise.all(Array.from({ length: Math.min(NAME_CONCURRENCY, Math.ceil(fileIds.length / NAME_BATCH)) }, worker))
    return failure ?? { ok: true, data: names }
  } finally {
    options.signal?.removeEventListener('abort', abort)
  }
}
