import { ref } from 'vue'
import {
  isWorkflowViewTab,
  resolveWorkflowView,
  sanitizeSelectedSteps,
  sanitizeWorkflowViews,
  type WorkflowViewTab
} from '../pages/workflow-desk-state'

const STORAGE_KEY = 'patmail.workflow.last-position.v1'
const MAX_ENTRIES = 100
const MAX_KEY_LENGTH = 80

function isSafeKey(key: string): boolean {
  return Boolean(key) && key.length <= MAX_KEY_LENGTH && key !== '__proto__' && key !== 'constructor' && key !== 'prototype'
}

function getStorage(): Storage | undefined {
  try {
    const candidate = globalThis.localStorage
    if (
      candidate
      && typeof candidate.getItem === 'function'
      && typeof candidate.setItem === 'function'
      && typeof candidate.removeItem === 'function'
    ) {
      return candidate
    }
  } catch {
    // 忽略受限存储上下文中的异常
  }
  return undefined
}

function readStorage(): { views: Record<string, WorkflowViewTab>; steps: Record<string, string> } {
  try {
    const raw = getStorage()?.getItem(STORAGE_KEY)
    if (!raw) return { views: {}, steps: {} }
    const parsed = JSON.parse(raw) as { views?: unknown; steps?: unknown } | null
    if (!parsed || typeof parsed !== 'object') return { views: {}, steps: {} }
    return {
      views: sanitizeWorkflowViews(parsed.views),
      steps: sanitizeSelectedSteps(parsed.steps)
    }
  } catch {
    return { views: {}, steps: {} }
  }
}

function upsertBounded<T>(record: Record<string, T>, key: string, value: T): Record<string, T> {
  const next = { ...record }
  if (Object.prototype.hasOwnProperty.call(next, key)) {
    delete next[key]
  } else {
    const keys = Object.keys(next)
    if (keys.length >= MAX_ENTRIES && keys[0]) {
      delete next[keys[0]]
    }
  }
  next[key] = value
  return next
}

const initial = readStorage()
const rememberedViews = ref<Record<string, WorkflowViewTab>>(initial.views)
const rememberedSteps = ref<Record<string, string>>(initial.steps)
const scrollPositions = new Map<string, Partial<Record<WorkflowViewTab, number>>>()

function writeStorage(): void {
  try {
    getStorage()?.setItem(STORAGE_KEY, JSON.stringify({
      views: rememberedViews.value,
      steps: rememberedSteps.value
    }))
  } catch {
    // 忽略受限存储上下文中的异常
  }
}

export function resetWorkflowViewMemoryForTest(clearStorage = true): void {
  scrollPositions.clear()
  if (clearStorage) {
    rememberedViews.value = {}
    rememberedSteps.value = {}
    try {
      getStorage()?.removeItem(STORAGE_KEY)
    } catch {
      // 忽略受限存储上下文中的异常
    }
    return
  }
  const hydrated = readStorage()
  rememberedViews.value = hydrated.views
  rememberedSteps.value = hydrated.steps
}

/** 共享的工作流页签、步骤与滚动位置记忆，统一供工作流封装层和入口页面复用。 */
export function useWorkflowViewMemory() {
  function rememberView(workflowId: string, view: WorkflowViewTab): void {
    const id = workflowId.trim()
    if (!isSafeKey(id) || !isWorkflowViewTab(view)) return
    if (Object.prototype.hasOwnProperty.call(rememberedViews.value, id) && rememberedViews.value[id] === view) return
    rememberedViews.value = upsertBounded(rememberedViews.value, id, view)
    writeStorage()
  }

  function rememberStep(workflowId: string, stepId: string): void {
    const id = workflowId.trim()
    const cleanStepId = stepId.trim()
    if (!isSafeKey(id) || !cleanStepId || cleanStepId.length > MAX_KEY_LENGTH) return
    if (Object.prototype.hasOwnProperty.call(rememberedSteps.value, id) && rememberedSteps.value[id] === cleanStepId) return
    rememberedSteps.value = upsertBounded(rememberedSteps.value, id, cleanStepId)
    writeStorage()
  }

  function forgetWorkflow(workflowId: string): void {
    const id = workflowId.trim()
    if (!isSafeKey(id)) return
    scrollPositions.delete(id)
    let changed = false
    if (Object.prototype.hasOwnProperty.call(rememberedViews.value, id)) {
      const next = { ...rememberedViews.value }
      delete next[id]
      rememberedViews.value = next
      changed = true
    }
    if (Object.prototype.hasOwnProperty.call(rememberedSteps.value, id)) {
      const next = { ...rememberedSteps.value }
      delete next[id]
      rememberedSteps.value = next
      changed = true
    }
    if (changed) writeStorage()
  }

  function resolveView(
    workflowId: string,
    options: { requested?: WorkflowViewTab; available: readonly WorkflowViewTab[]; fallback: WorkflowViewTab }
  ): WorkflowViewTab {
    return resolveWorkflowView({
      workflowId,
      requested: options.requested,
      remembered: rememberedViews.value,
      available: options.available,
      fallback: options.fallback
    })
  }

  function resolveStep(workflowId: string, stepIds: readonly string[]): string {
    if (!stepIds.length) return ''
    const id = workflowId.trim()
    if (isSafeKey(id) && Object.prototype.hasOwnProperty.call(rememberedSteps.value, id)) {
      const saved = rememberedSteps.value[id]
      if (saved && stepIds.includes(saved)) return saved
    }
    return stepIds[0] ?? ''
  }

  function mergeFromDesk(saved: { workflowViews?: Record<string, WorkflowViewTab>; selectedSteps?: Record<string, string> }): void {
    const deskViews = sanitizeWorkflowViews(saved.workflowViews)
    const deskSteps = sanitizeSelectedSteps(saved.selectedSteps)
    let viewsChanged = false
    let stepsChanged = false
    const nextViews = { ...rememberedViews.value }
    for (const [id, tab] of Object.entries(deskViews)) {
      if (Object.prototype.hasOwnProperty.call(nextViews, id)) continue
      if (Object.keys(nextViews).length >= MAX_ENTRIES) break
      nextViews[id] = tab
      viewsChanged = true
    }
    const nextSteps = { ...rememberedSteps.value }
    for (const [id, stepId] of Object.entries(deskSteps)) {
      if (Object.prototype.hasOwnProperty.call(nextSteps, id)) continue
      if (Object.keys(nextSteps).length >= MAX_ENTRIES) break
      nextSteps[id] = stepId
      stepsChanged = true
    }
    if (viewsChanged) rememberedViews.value = nextViews
    if (stepsChanged) rememberedSteps.value = nextSteps
    if (viewsChanged || stepsChanged) writeStorage()
  }

  function saveScroll(workflowId: string, view: WorkflowViewTab): void {
    const id = workflowId.trim()
    if (!isSafeKey(id) || !isWorkflowViewTab(view) || typeof document === 'undefined') return
    const scroller = document.querySelector<HTMLElement>('.workspace')
    if (!scroller) return
    const map = scrollPositions.get(id) ?? {}
    map[view] = scroller.scrollTop
    scrollPositions.set(id, map)
  }

  function restoreScroll(workflowId: string, view: WorkflowViewTab): void {
    const id = workflowId.trim()
    if (!isSafeKey(id) || !isWorkflowViewTab(view) || typeof document === 'undefined') return
    const scroller = document.querySelector<HTMLElement>('.workspace')
    if (!scroller) return
    const saved = scrollPositions.get(id)?.[view]
    scroller.scrollTop = typeof saved === 'number' ? saved : 0
  }

  return {
    rememberedViews,
    rememberedSteps,
    rememberView,
    rememberStep,
    forgetWorkflow,
    resolveView,
    resolveStep,
    mergeFromDesk,
    saveScroll,
    restoreScroll
  }
}
