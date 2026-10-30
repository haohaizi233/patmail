import type { SelectedPatentFile } from './types'
import { stripApplicationNoDot } from './download-name'

function timestamp(value = ''): number {
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = Date.parse(text)
    return Number.isFinite(parsed) ? parsed : -Infinity
  }
  const match = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text)
  if (!match) return -Infinity
  const [, y, m, d, h = '0', min = '0', s = '0'] = match
  const time = Date.UTC(+y, +m - 1, +d, +h, +min, +s), date = new Date(time)
  return date.getUTCFullYear() === +y && date.getUTCMonth() === +m - 1 && date.getUTCDate() === +d && +h < 24 && +min < 60 && +s < 60 ? time : -Infinity
}

export function caseScope(file: SelectedPatentFile): string {
  const scope = file.caseId?.trim() ? ['case', file.caseId.trim()] : file.caseVolume?.trim()
    ? ['volume', file.customerName.trim(), file.caseVolume.trim()] : file.applicationNo?.trim()
      ? ['application', file.customerName.trim(), file.applicationNo.replace(/[.\s]/g, '').toUpperCase()] : ['file', file.fileId]
  return JSON.stringify(scope)
}

/** 与ZIP条目共用的基础名称；冲突数字后缀由下载器在去重完成后添加。 */
export function sanitizedDownloadName(name: string): string {
  return name.replace(/[\\/<>:"|?*\x00-\x1f]+/g, '_').replace(/^[. ]+|[. ]+$/g, '') || '文件'
}

export function finalDownloadNameKey(value: string, strip = false): string {
  const name = sanitizedDownloadName(strip ? stripApplicationNoDot(value) : value).toLowerCase()
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  return stem + (/^\.docx?$/.test(ext) ? '.word' : ext)
}

export function newestFirstSelected(files: Record<string, SelectedPatentFile>): SelectedPatentFile[] {
  return Object.values(files).sort((a, b) => {
    const aTime = timestamp(a.uploadTime), bTime = timestamp(b.uploadTime)
    if (aTime !== bTime) return aTime > bTime ? -1 : 1
    return a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0
  })
}

/** 仅使用已解析的最终DIY名称裁剪勾选；未知名称和无案件身份的行各自保留。 */
export function deduplicateNamedFiles(
  files: Record<string, SelectedPatentFile>, names: Record<string, string>, stripAppNoDot: boolean
): Record<string, SelectedPatentFile> {
  const seen = new Set<string>(), ids = new Set<string>()
  for (const file of newestFirstSelected(files)) {
    const name = names[file.fileId]
    if (typeof name !== 'string' || !name.trim()) {
      ids.add(file.fileId)
      continue
    }
    const key = JSON.stringify([caseScope(file), finalDownloadNameKey(name, stripAppNoDot)])
    if (!seen.has(key)) {
      seen.add(key)
      ids.add(file.fileId)
    }
  }
  return Object.fromEntries(Object.entries(files).filter(([, file]) => ids.has(file.fileId)))
}

/** 兼容旧调用；新界面应传入已解析的DIY名称。 */
export function deduplicateSelectedFiles(files: Record<string, SelectedPatentFile>): Record<string, SelectedPatentFile> {
  return deduplicateNamedFiles(files, Object.fromEntries(Object.values(files).map(file => [file.fileId, file.fileName])), false)
}
