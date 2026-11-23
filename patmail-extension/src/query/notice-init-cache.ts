import type {
  NoticeFileTypeNode,
  NoticeInitData,
  NoticeOptionItem
} from '../api/notice-types'
import type { TreeOption } from './option-tree'

export interface NoticeInitCacheSnapshot {
  initData: NoticeInitData
  userOptions: TreeOption[]
  savedAt: number
}

const STORAGE_KEY = 'patmail.noticeInitCache.v1'
const DEFAULT_TZS_START_DATE = '2023-01-01'
const memory = new Map<string, NoticeInitCacheSnapshot>()

function normalizeUserKey(userId: string): string {
  return userId.trim() || '__default__'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cleanString(value: unknown, limit = 300): string {
  if (typeof value !== 'string') return ''
  return value.trim().slice(0, limit)
}

function cleanOptions(raw: unknown): NoticeOptionItem[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: NoticeOptionItem[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const value = cleanString(item.value, 120)
    const label = cleanString(item.label, 240)
    if (!value || !label || seen.has(value)) continue
    seen.add(value)
    const parent = cleanString(item.parent, 120)
    let extra: Record<string, string> | undefined
    if (isRecord(item.extra)) {
      const cleanExtra: Record<string, string> = {}
      for (const [k, v] of Object.entries(item.extra)) {
        if (typeof v === 'string' && v.trim()) cleanExtra[k] = v.trim().slice(0, 120)
      }
      if (Object.keys(cleanExtra).length > 0) extra = cleanExtra
    }
    out.push({
      value,
      label,
      ...(parent ? { parent } : {}),
      ...(item.selectable === false ? { selectable: false } : {}),
      ...(extra ? { extra } : {})
    })
    if (out.length >= 2000) break
  }
  return out
}

function cleanFileTypes(raw: unknown): NoticeFileTypeNode[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: NoticeFileTypeNode[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const id = cleanString(item.id, 120)
    const name = cleanString(item.name, 240)
    if (!id || !name || seen.has(id)) continue
    seen.add(id)
    const parentId = cleanString(item.parentId, 120)
    const treeType = cleanString(item.treeType, 60)
    const code = cleanString(item.code, 60)
    out.push({
      id,
      name,
      parentId,
      ...(item.selectable === false ? { selectable: false } : {}),
      ...(treeType ? { treeType } : {}),
      ...(code ? { code } : {})
    })
    if (out.length >= 3000) break
  }
  return out
}

function cleanTreeOptions(raw: unknown): TreeOption[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const out: TreeOption[] = []
  for (const item of raw) {
    if (!isRecord(item)) continue
    const value = cleanString(item.value, 120)
    const label = cleanString(item.label, 240)
    if (!value || !label || seen.has(value)) continue
    seen.add(value)
    const parent = cleanString(item.parent, 120)
    out.push({
      value,
      label,
      ...(parent ? { parent } : {}),
      ...(item.selectable === false ? { selectable: false } : {})
    })
    if (out.length >= 3000) break
  }
  return out
}

function cleanCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function cloneSnapshot(snapshot: NoticeInitCacheSnapshot): NoticeInitCacheSnapshot {
  return {
    initData: {
      applyTypes: snapshot.initData.applyTypes.map(item => ({
        ...item,
        ...(item.extra ? { extra: { ...item.extra } } : {})
      })),
      agencies: snapshot.initData.agencies.map(item => ({
        ...item,
        ...(item.extra ? { extra: { ...item.extra } } : {})
      })),
      directions: snapshot.initData.directions.map(item => ({ ...item })),
      applyTags: snapshot.initData.applyTags.map(item => ({ ...item })),
      branches: snapshot.initData.branches.map(item => ({ ...item })),
      countries: snapshot.initData.countries.map(item => ({ ...item })),
      fileTypes: snapshot.initData.fileTypes.map(item => ({ ...item })),
      users: snapshot.initData.users.map(item => ({ ...item })),
      cpcAccounts: snapshot.initData.cpcAccounts.map(item => ({ ...item })),
      defaultTzsStartDate: snapshot.initData.defaultTzsStartDate,
      handCount: snapshot.initData.handCount,
      nolaiutoCount: snapshot.initData.nolaiutoCount,
      warnings: []
    },
    userOptions: snapshot.userOptions.map(item => ({ ...item })),
    savedAt: snapshot.savedAt
  }
}

function sanitizeSnapshot(raw: unknown): NoticeInitCacheSnapshot | null {
  if (!isRecord(raw) || !isRecord(raw.initData)) return null
  const initRaw = raw.initData
  const date = cleanString(initRaw.defaultTzsStartDate, 40) || DEFAULT_TZS_START_DATE
  const snapshot: NoticeInitCacheSnapshot = {
    initData: {
      applyTypes: cleanOptions(initRaw.applyTypes),
      agencies: cleanOptions(initRaw.agencies),
      directions: cleanOptions(initRaw.directions),
      applyTags: cleanOptions(initRaw.applyTags),
      branches: cleanOptions(initRaw.branches),
      countries: cleanOptions(initRaw.countries),
      fileTypes: cleanFileTypes(initRaw.fileTypes),
      users: cleanFileTypes(initRaw.users),
      cpcAccounts: cleanOptions(initRaw.cpcAccounts),
      defaultTzsStartDate: date,
      handCount: cleanCount(initRaw.handCount),
      nolaiutoCount: cleanCount(initRaw.nolaiutoCount),
      warnings: []
    },
    userOptions: cleanTreeOptions(raw.userOptions),
    savedAt: typeof raw.savedAt === 'number' && Number.isFinite(raw.savedAt) ? raw.savedAt : Date.now()
  }
  return snapshot
}

export function hasCachedNoticeOptions(data: NoticeInitData | null): boolean {
  if (!data) return false
  return (
    data.applyTypes.length > 0 ||
    data.agencies.length > 0 ||
    data.directions.length > 0 ||
    data.applyTags.length > 0 ||
    data.branches.length > 0 ||
    data.countries.length > 0 ||
    data.fileTypes.length > 0 ||
    data.users.length > 0 ||
    data.cpcAccounts.length > 0
  )
}

/** 合并新旧初始化字典：新字段非空时覆盖，拉取失败或为空时保留缓存兜底选项。 */
export function mergeNoticeInitData(
  previous: NoticeInitData | null,
  incoming: NoticeInitData,
  options: { preserveCounts?: boolean; silent?: boolean } = {}
): NoticeInitData {
  if (!previous) {
    return {
      ...incoming,
      warnings: options.silent && hasCachedNoticeOptions(incoming) ? [] : [...incoming.warnings]
    }
  }
  const pickList = <T>(nextList: readonly T[], prevList: readonly T[]): T[] =>
    nextList.length > 0 ? [...nextList] : [...prevList]

  const incomingDate = incoming.defaultTzsStartDate.trim()
  const prevDate = previous.defaultTzsStartDate.trim()
  const defaultTzsStartDate =
    incomingDate && (incomingDate !== DEFAULT_TZS_START_DATE || !prevDate)
      ? incomingDate
      : prevDate || DEFAULT_TZS_START_DATE

  const merged: NoticeInitData = {
    applyTypes: pickList(incoming.applyTypes, previous.applyTypes),
    agencies: pickList(incoming.agencies, previous.agencies),
    directions: pickList(incoming.directions, previous.directions),
    applyTags: pickList(incoming.applyTags, previous.applyTags),
    branches: pickList(incoming.branches, previous.branches),
    countries: pickList(incoming.countries, previous.countries),
    fileTypes: pickList(incoming.fileTypes, previous.fileTypes),
    users: pickList(incoming.users, previous.users),
    cpcAccounts: pickList(incoming.cpcAccounts, previous.cpcAccounts),
    defaultTzsStartDate,
    handCount: options.preserveCounts ? previous.handCount : incoming.handCount,
    nolaiutoCount: options.preserveCounts ? previous.nolaiutoCount : incoming.nolaiutoCount,
    warnings: []
  }

  if (!options.silent || !hasCachedNoticeOptions(merged)) {
    merged.warnings = [...incoming.warnings]
  }
  return merged
}

export function peekNoticeInitCache(userId: string): NoticeInitCacheSnapshot | null {
  const hit = memory.get(normalizeUserKey(userId))
  return hit ? cloneSnapshot(hit) : null
}

export async function readNoticeInitCache(userId: string): Promise<NoticeInitCacheSnapshot | null> {
  const key = normalizeUserKey(userId)
  const hit = memory.get(key)
  if (hit) return cloneSnapshot(hit)
  const area = globalThis.chrome?.storage?.local
  if (!area) return null
  try {
    const stored = await area.get(STORAGE_KEY)
    const bag = stored[STORAGE_KEY]
    if (!isRecord(bag)) return null
    const parsed = sanitizeSnapshot(bag[key])
    if (!parsed) return null
    memory.set(key, parsed)
    return cloneSnapshot(parsed)
  } catch {
    return null
  }
}

export async function saveNoticeInitCache(
  userId: string,
  snapshot: { initData: NoticeInitData; userOptions: TreeOption[] }
): Promise<void> {
  const key = normalizeUserKey(userId)
  const sanitized = sanitizeSnapshot({
    initData: { ...snapshot.initData, warnings: [] },
    userOptions: snapshot.userOptions,
    savedAt: Date.now()
  })
  if (!sanitized) return
  memory.set(key, sanitized)
  const area = globalThis.chrome?.storage?.local
  if (!area) return
  try {
    const stored = await area.get(STORAGE_KEY)
    const previous = stored[STORAGE_KEY]
    const bag = isRecord(previous) ? { ...previous } : {}
    bag[key] = cloneSnapshot(sanitized)
    await area.set({ [STORAGE_KEY]: bag })
  } catch {
    // 持久化写入失败时保留内存副本，不打断界面流程。
  }
}

export function resetNoticeInitCacheForTests(): void {
  memory.clear()
}
