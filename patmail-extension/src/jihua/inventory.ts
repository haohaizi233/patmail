import { MATERIALS, SOURCE_MATERIAL_ALIASES, matchMaterial, matchMaterialAlias, normalizeApplicationNo } from './materials'
import type { JihuaRow, JihuaTask, LocalDirectoryHandle, LocalFileHandle, SourceRoot } from './types'

const SUPPORTED_EXTENSIONS = new Set(['pdf', 'doc', 'docx'])
const DEFAULT_EXTENSIONS = ['pdf', 'doc', 'docx']
const APPLICATION_NO = /^\d{12}[0-9X]$/
const LEGACY_APPLICATION_NO = /^\d{8}[0-9X]$/
const ABSENT_FROM_SCAN_ERROR = '本次扫描未纳入，已取消选择；保留历史回执'
const OBSOLETE_ALIAS_ERRORS = new Set([
  '材料类型未登记',
  '文件描述没有匹配到该台账支持的材料，请手动选择目标材料。',
])

export interface ParsedFileName {
  applicationNo: string
  caseName: string
  description: string
  extension: string
  materialKey: string
  error: string
}

export interface InventoryResult {
  rows: JihuaRow[]
  files: Map<string, LocalFileHandle>
  scannedFiles: number
  excludedFiles: number
  errors: string[]
}

export interface ScanDirectoryOptions {
  extensions?: string[]
  onProgress?: (count: number) => void
  signal?: AbortSignal
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function abortError(): DOMException {
  return new DOMException('The inventory scan was aborted', 'AbortError')
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError()
}

function stableRowId(rootId: string, relativePath: string): string {
  return JSON.stringify([rootId, relativePath])
}

function resolveKnownSuffix(value: string): { caseName: string; description: string } | undefined {
  const suffixes = new Set<string>()
  for (const material of MATERIALS) suffixes.add(material.label)
  for (const alias of SOURCE_MATERIAL_ALIASES) suffixes.add(alias)

  const normalizedValue = value.replace(/[（]/g, '(').replace(/[）]/g, ')')
  for (const description of [...suffixes].sort((left, right) => right.length - left.length)) {
    const normalizedDescription = description.replace(/[（]/g, '(').replace(/[）]/g, ')')
    const suffix = `-${normalizedDescription}`
    if (normalizedValue.endsWith(suffix)) {
      return {
        caseName: value.slice(0, value.length - description.length - 1),
        description: value.slice(value.length - description.length),
      }
    }
    if (normalizedValue === normalizedDescription) return { caseName: '', description: value }
  }

  const dynamicReview = normalizedValue.match(/-(第(?:\d+|[Nn]|[一二三四五六七八九十百零〇两]+)次审查意见通知书)$/)
  if (dynamicReview) {
    const description = dynamicReview[1]
    return {
      caseName: value.slice(0, value.length - description.length - 1),
      description: value.slice(value.length - description.length),
    }
  }
  return undefined
}

export function parseFileName(name: string): ParsedFileName {
  const extension = extensionOf(name)
  const dot = name.lastIndexOf('.')
  const baseName = dot > 0 ? name.slice(0, dot) : (dot === 0 ? '' : name)
  const separator = baseName.indexOf('-')
  const errors: string[] = []

  if (separator <= 0) {
    return {
      applicationNo: '', caseName: '', description: '', extension, materialKey: '',
      error: '文件名应包含申请号、案件名称和材料描述',
    }
  }

  const rawApplicationNo = baseName.slice(0, separator)
  const applicationNo = normalizeApplicationNo(rawApplicationNo)
  if (!APPLICATION_NO.test(applicationNo)) {
    errors.push(LEGACY_APPLICATION_NO.test(applicationNo)
      ? '9位旧式申请号目前不支持自动传文（仅支持13位中国专利申请号）'
      : '申请号格式无效；目前自动传文仅支持13位中国专利申请号')
  }

  const remainder = baseName.slice(separator + 1)
  let caseName = ''
  let description = ''
  const knownSuffix = resolveKnownSuffix(remainder)
  if (knownSuffix) {
    ({ caseName, description } = knownSuffix)
  } else {
    const lastSeparator = remainder.lastIndexOf('-')
    if (lastSeparator > 0) {
      caseName = remainder.slice(0, lastSeparator)
      description = remainder.slice(lastSeparator + 1)
    } else {
      description = remainder
    }
  }

  if (!caseName.trim()) errors.push('案件名称缺失')
  if (!description.trim()) errors.push('材料描述缺失')
  const material = matchMaterial(description)
  if (!material) errors.push('材料类型未登记')

  return {
    applicationNo,
    caseName: caseName.trim(),
    description: description.trim(),
    extension,
    materialKey: material?.key ?? '',
    error: errors.join('；'),
  }
}

function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

export async function scanDirectory(
  root: SourceRoot,
  options: ScanDirectoryOptions = {},
): Promise<InventoryResult> {
  const allowedExtensions = new Set((options.extensions ?? DEFAULT_EXTENSIONS)
    .map(extension => extension.trim().replace(/^\./, '').toLowerCase())
    .filter(extension => SUPPORTED_EXTENSIONS.has(extension)))
  const rows: JihuaRow[] = []
  const files = new Map<string, LocalFileHandle>()
  const errors: string[] = []
  let scannedFiles = 0
  let excludedFiles = 0

  const visit = async (directory: LocalDirectoryHandle, parentPath: string): Promise<void> => {
    checkAborted(options.signal)
    try {
      for await (const entry of directory.values()) {
        checkAborted(options.signal)
        const relativePath = joinPath(parentPath, entry.name)
        if (entry.kind === 'directory') {
          await visit(entry, relativePath)
          continue
        }
        if (entry.kind !== 'file') {
          errors.push(`${relativePath}: unsupported file system entry`)
          continue
        }

        scannedFiles += 1
        const extension = extensionOf(entry.name)
        if (!allowedExtensions.has(extension)) {
          excludedFiles += 1
        } else {
          const parsed = parseFileName(entry.name)
          const id = stableRowId(root.id, relativePath)
          const row: JihuaRow = {
            id,
            rootId: root.id,
            relativePath,
            fileName: entry.name,
            extension: parsed.extension,
            applicationNo: parsed.applicationNo,
            caseName: parsed.caseName,
            description: parsed.description,
            materialKey: parsed.materialKey,
            selected: false,
            status: parsed.error ? 'unmatched' : 'pending',
            error: parsed.error,
            attempts: 0,
            updatedAt: Date.now(),
          }
          rows.push(row)
          files.set(id, entry)
          if (parsed.error) errors.push(`${relativePath}: ${parsed.error}`)
        }
        options.onProgress?.(scannedFiles)
        if (scannedFiles % 100 === 0) {
          await new Promise<void>(resolve => setTimeout(resolve, 0))
          checkAborted(options.signal)
        }
      }
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw abortError()
      errors.push(`${parentPath || directory.name}: ${formatError(error)}`)
    }
  }

  await visit(root.handle, '')
  return { rows, files, scannedFiles, excludedFiles, errors }
}

/** Repair only persisted alias rows that never received a material mapping. */
export function repairPersistedMaterialAliases(task: JihuaTask): JihuaTask {
  if (task.status === 'completed') return task

  let repaired = false
  const rows = task.rows.map(row => {
    if (row.materialKey || row.status === 'success' || row.status === 'already') return row
    const material = matchMaterialAlias(row.description)
    if (!material) return row

    const errorParts = typeof row.error === 'string' ? row.error.split('；').map(part => part.trim()) : []
    const remainingErrors = errorParts.filter(part => part && !OBSOLETE_ALIAS_ERRORS.has(part))
    const error = remainingErrors.join('；')
    const validApplicationNo = typeof row.applicationNo === 'string'
      && APPLICATION_NO.test(normalizeApplicationNo(row.applicationNo))
    const validCaseName = typeof row.caseName === 'string' && Boolean(row.caseName.trim())
    const canReturnToPending = row.status === 'unmatched'
      && validApplicationNo
      && validCaseName
      && !row.intent?.sent
      && !row.receipt
      && remainingErrors.length === 0

    repaired = true
    return {
      ...row,
      materialKey: material.key,
      ...(row.error !== error ? { error } : {}),
      ...(canReturnToPending ? { status: 'pending' as const } : {}),
    }
  })

  return repaired ? { ...task, rows } : task
}

export function mergeInventory(task: JihuaTask, scanresult: InventoryResult, root: SourceRoot): JihuaTask {
  const repairedTask = repairPersistedMaterialAliases(task)
  const rowsById = new Map(repairedTask.rows.map(row => [row.id, row]))
  const freshRowsById = new Map(scanresult.rows.map(row => [row.id, row]))
  const rows = repairedTask.rows.map(row => {
    const fresh = freshRowsById.get(row.id)
    if (!fresh) {
      if (row.rootId !== root.id) return row
      const error = row.error.includes(ABSENT_FROM_SCAN_ERROR)
        ? row.error
        : row.error ? `${row.error}；${ABSENT_FROM_SCAN_ERROR}` : ABSENT_FROM_SCAN_ERROR
      return { ...row, selected: false, error }
    }
    return {
      ...row,
      ...fresh,
      selected: row.selected,
      status: row.status,
      error: row.error,
      materialKey: row.materialKey,
      attempts: row.attempts,
      updatedAt: row.updatedAt,
      record: row.record,
      intent: row.intent,
      receipt: row.receipt,
    }
  })
  for (const row of scanresult.rows) {
    if (!rowsById.has(row.id)) rows.push(row)
  }

  interface RootInventoryEntry {
    id: string
    name: string
    inventory?: { scannedFiles: number; excludedFiles: number; errors: string[] }
  }
  const rootEntries = task.roots as RootInventoryEntry[]
  const rootsById = new Map(rootEntries.map(existing => [existing.id, existing]))
  rootsById.set(root.id, {
    id: root.id,
    name: root.name,
    inventory: {
      scannedFiles: scanresult.scannedFiles,
      excludedFiles: scanresult.excludedFiles,
      errors: scanresult.errors,
    },
  })
  const roots = [...rootsById.values()]
  const inventories = roots.map(entry => entry.inventory).filter((inventory): inventory is NonNullable<typeof inventory> => Boolean(inventory))
  return {
    ...repairedTask,
    updatedAt: Date.now(),
    roots,
    rows,
    scannedFiles: inventories.reduce((total, inventory) => total + inventory.scannedFiles, 0),
    excludedFiles: inventories.reduce((total, inventory) => total + inventory.excludedFiles, 0),
    errors: inventories.flatMap(inventory => inventory.errors),
  }
}

export function createJihuaTask(): JihuaTask {
  const now = Date.now()
  const id = globalThis.crypto?.randomUUID?.() ?? `jihua-${now}-${Math.random().toString(36).slice(2)}`
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: 'ready',
    roots: [],
    rows: [],
    scannedFiles: 0,
    excludedFiles: 0,
    errors: [],
  }
}
