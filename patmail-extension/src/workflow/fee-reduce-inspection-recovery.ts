import type { FeeReduceCaseInspectItem } from '../api/fee-reduce-types'
import type { createRecoveryClient } from '../recovery/client'
import { isRecord } from '../shared/guards'

type Journal = Pick<ReturnType<typeof createRecoveryClient>, 'get' | 'put' | 'forget'>

interface InspectionPlan {
  id: string
  startedAt: number
  volumes: string[]
  reviewVolumes: string[]
}

interface InspectionProgress {
  nextPage: number
  state: 'running' | 'done' | 'failed'
}

function readPlan(value: unknown): InspectionPlan | null {
  if (!isRecord(value) || typeof value.id !== 'string' || !Array.isArray(value.volumes) ||
      !value.volumes.length || !value.volumes.every((volume: unknown): volume is string => typeof volume === 'string')) return null
  const reviewVolumes = Array.isArray(value.reviewVolumes)
    ? value.reviewVolumes.filter((volume: unknown): volume is string => typeof volume === 'string') : []
  return { id: value.id, volumes: value.volumes, reviewVolumes, startedAt: typeof value.startedAt === 'number' ? value.startedAt : 0 }
}

function readItems(value: unknown): FeeReduceCaseInspectItem[] | null {
  if (!Array.isArray(value)) return null
  const states = new Set(['completed', 'ready', 'not_found', 'missing_proc', 'other_status', 'error'])
  const fields = ['caseVolume', 'caseId', 'caseName', 'appNo', 'procId', 'procName', 'procStatus', 'reason']
  return value.every((row: unknown): row is FeeReduceCaseInspectItem => isRecord(row) &&
    fields.every(field => typeof row[field] === 'string') && typeof row.state === 'string' && states.has(row.state)) ? value : null
}

/** A page is visible only after its result and the corresponding cursor have been committed. */
export function feeInspectionJournal(journal: Journal, scope: string) {
  const progressKey = (id: string) => `${scope}:${id}:progress`
  const pageKey = (id: string, page: number) => `${scope}:${id}:${page}`
  const get = (key: string) => journal.get('workflow-desk', key)
  const put = (key: string, value: unknown) => journal.put('workflow-desk', key, value)
  const forget = (key: string) => journal.forget('workflow-desk', key)

  async function readProgress(plan: InspectionPlan): Promise<InspectionProgress> {
    const stored = await get(progressKey(plan.id))
    if (isRecord(stored) && typeof stored.nextPage === 'number' && Number.isSafeInteger(stored.nextPage) &&
        stored.nextPage >= 0 && stored.nextPage <= plan.volumes.length &&
        (stored.state === 'running' || stored.state === 'done' || stored.state === 'failed')) {
      return { nextPage: stored.nextPage, state: stored.state }
    }
    return { nextPage: 0, state: 'running' }
  }

  return {
    async begin(volumes: string[], reviewVolumes: string[] = []) {
      const previous = readPlan(await get(scope))
      const plan = { id: crypto.randomUUID(), startedAt: Date.now(), volumes, reviewVolumes }
      await put(progressKey(plan.id), { nextPage: 0, state: 'running' })
      await put(scope, plan)
      return { plan, previous }
    },
    async append(plan: InspectionPlan, page: number, rows: FeeReduceCaseInspectItem[]) {
      await put(pageKey(plan.id, page), rows)
      await put(progressKey(plan.id), { nextPage: page + 1, state: 'running' })
    },
    finish(plan: InspectionPlan, nextPage: number, state: 'done' | 'failed') {
      return put(progressKey(plan.id), { nextPage, state })
    },
    async prune(plan: InspectionPlan) {
      const { nextPage } = await readProgress(plan)
      for (let page = 0; page < nextPage; page++) await forget(pageKey(plan.id, page))
      await forget(progressKey(plan.id))
    },
    async read() {
      const plan = readPlan(await get(scope))
      if (!plan) return null
      const progress = await readProgress(plan)
      const pages = await Promise.all(Array.from({ length: progress.nextPage }, (_, page) => get(pageKey(plan.id, page))))
      const rows: FeeReduceCaseInspectItem[] = []
      for (const page of pages) {
        const items = readItems(page)
        if (!items || rows.length + items.length > plan.volumes.length) break
        rows.push(...items)
      }
      const state = progress.state === 'done' && rows.length !== plan.volumes.length ? 'running' : progress.state
      return { ...plan, rows, state }
    }
  }
}
