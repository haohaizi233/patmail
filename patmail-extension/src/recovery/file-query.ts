import type { FileSearchQuery } from '../api/file-search-params'
import type { FileSearchResult } from '../api/file-search-types'
import type { SelectedPatentFile } from '../mail'
import type { FileDownloadSelection } from '../mail/download-name'
export interface FileQueryTask {
  backend?: 'browser'
  id: string
  items: Array<{ fileId: string; fileNo: string; fileName: string }>
  selection: FileDownloadSelection | null
  stripAppNoDot: boolean
  archiveName: string
  status: 'paused' | 'running' | 'done'
  notice: string
}
export interface FileQuerySnapshot {
  version: 1
  owner: [string, string, string]
  query: FileSearchQuery | null
  result: FileSearchResult | null
  selected: Record<string, SelectedPatentFile>
  form: unknown
  downloadSelection: FileDownloadSelection | null
  stripAppNoDot: boolean
  pageSize: number
  templateName: string
  readPages: number[]
  activeTask: FileQueryTask | null
}
export function fileQueryOwner(origin: string, user: string, surface: string): [string, string, string] {
  return [new URL(origin).origin, user, surface]
}
export function fileQueryScope(origin: string, user: string, surface: string): string {
  return JSON.stringify(fileQueryOwner(origin, user, surface))
}
export function restoredFileQuery(value: unknown, origin: string, user: string, surface: string): FileQuerySnapshot | null {
  if (!value || typeof value !== 'object') return null
  const item = value as FileQuerySnapshot
  if (item.version !== 1 || JSON.stringify(item.owner) !== JSON.stringify(fileQueryOwner(origin, user, surface)) || !item.selected || typeof item.selected !== 'object') return null
  const copy = JSON.parse(JSON.stringify(item)) as FileQuerySnapshot
  if (copy.activeTask?.status === 'running') copy.activeTask.status = 'paused'
  return copy
}
