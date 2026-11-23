import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { loadLimitMailLedger, readLimitMailLedger, watchLimitMailLedger } from '../../application/mail/mail-ledger-query'
import type { LimitMailMark } from '../../customer/limit-mail-submit'
import type { WorkflowCatalog } from '../../workflow/catalog'
import { loadWorkflowCatalog } from '../../workflow/catalog-store'
import { useWorkflowCatalog } from '../composables/useWorkflowCatalog'
import { useWorkspace } from '../composables/useWorkspace'
import { homeReport, type ReportSlice } from '../home-report'
import { useHomeCardRegistry } from './registry'
import type {
  HomeBoardCardDef,
  HomeCardContext,
  HomeCardDef,
  HomeCardVisibility,
  HomeMetricCardDef,
} from './types'

export const HOME_CARDS_STORAGE_KEY = 'patmail.homeCards.v1'

export interface ResolvedMetricCard {
  def: HomeMetricCardDef
  value: number | string
  subtitle: string
}

export interface ResolvedBoardCard {
  def: HomeBoardCardDef
  slices: ReportSlice[]
  total: number
  note: string
}

function normalizeVisibility(value: unknown): HomeCardVisibility {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const next: HomeCardVisibility = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'boolean') next[key] = item
  }
  return next
}

function formatClock(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function resolveHomeCards(
  cards: readonly HomeCardDef[],
  visibility: HomeCardVisibility,
  ctx: HomeCardContext,
): { metricCards: ResolvedMetricCard[]; boardCards: ResolvedBoardCard[] } {
  const metricCards: ResolvedMetricCard[] = []
  const boardCards: ResolvedBoardCard[] = []
  for (const card of cards) {
    const enabled = Object.prototype.hasOwnProperty.call(visibility, card.id)
      ? Boolean(visibility[card.id])
      : card.defaultEnabled
    if (!enabled) continue
    if (card.kind === 'metric') {
      metricCards.push({
        def: card,
        value: card.value(ctx),
        subtitle: card.subtitle(ctx),
      })
    } else {
      const slices = card.slices(ctx)
      const total = slices.reduce((sum, item) => sum + item.count, 0)
      boardCards.push({
        def: card,
        slices,
        total,
        note: card.note?.(ctx) ?? '',
      })
    }
  }
  return { metricCards, boardCards }
}

export function useHomeCards() {
  const { connection, customers, tasks, templates, fileManageRuns, call } = useWorkspace()
  const { catalog } = useWorkflowCatalog()
  const syncedCatalog = ref<WorkflowCatalog | null>(null)
  const activeCatalog = computed(() => syncedCatalog.value ?? catalog.value)
  watch(catalog, () => {
    syncedCatalog.value = null
  })

  const registry = useHomeCardRegistry()
  const ledger = ref<LimitMailMark[]>(readLimitMailLedger())
  const visibility = ref<HomeCardVisibility>({})
  const refreshing = ref(false)
  const lastUpdatedAt = ref<Date>(new Date())

  const report = computed(() =>
    homeReport({
      customers: customers.value,
      tasks: tasks.value,
      ledger: ledger.value,
      workflows: activeCatalog.value.workflows.map(item => ({ id: item.id, label: item.label })),
    }),
  )

  const context = computed<HomeCardContext>(() => ({
    report: report.value,
    customers: customers.value,
    tasks: tasks.value,
    templates: templates.value,
    fileManageRuns: fileManageRuns.value,
    ledger: ledger.value,
    workflows: activeCatalog.value.workflows,
  }))

  const resolved = computed(() => resolveHomeCards(registry.value, visibility.value, context.value))
  const metricCards = computed(() => resolved.value.metricCards)
  const boardCards = computed(() => resolved.value.boardCards)

  const lastUpdatedText = computed(() => {
    if (refreshing.value) return '正在同步…'
    return `更新于 ${formatClock(lastUpdatedAt.value)}`
  })

  watch([customers, tasks, templates, fileManageRuns, ledger, () => activeCatalog.value.workflows], () => {
    lastUpdatedAt.value = new Date()
  })

  function isEnabled(card: HomeCardDef): boolean {
    return Object.prototype.hasOwnProperty.call(visibility.value, card.id)
      ? Boolean(visibility.value[card.id])
      : card.defaultEnabled
  }

  function persistVisibility(next: HomeCardVisibility): void {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return
    void chrome.storage.local.set({ [HOME_CARDS_STORAGE_KEY]: next }).catch(() => {})
  }

  function toggleCard(card: HomeCardDef): void {
    const next: HomeCardVisibility = { ...visibility.value, [card.id]: !isEnabled(card) }
    visibility.value = next
    persistVisibility(next)
  }

  function resetVisibility(): void {
    visibility.value = {}
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local.remove(HOME_CARDS_STORAGE_KEY).catch(() => {})
    }
  }

  async function refresh(): Promise<void> {
    if (refreshing.value) return
    refreshing.value = true
    try {
      const jobs: Array<Promise<unknown>> = [
        loadLimitMailLedger().then(marks => {
          ledger.value = marks
        }),
        loadWorkflowCatalog().then(next => {
          syncedCatalog.value = next
        }),
      ]
      if (connection.value.sessionStatus === 'authenticated') {
        jobs.push(call({ action: 'load' }))
      }
      await Promise.allSettled(jobs)
      lastUpdatedAt.value = new Date()
    } finally {
      refreshing.value = false
    }
  }

  let stopLedger = (): void => {}
  const onStorageChanged = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !(HOME_CARDS_STORAGE_KEY in changes)) return
    visibility.value = normalizeVisibility(changes[HOME_CARDS_STORAGE_KEY]?.newValue)
  }

  onMounted(() => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      void chrome.storage.local
        .get(HOME_CARDS_STORAGE_KEY)
        .then(stored => {
          visibility.value = normalizeVisibility(stored[HOME_CARDS_STORAGE_KEY])
        })
        .catch(() => {})
    }
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(onStorageChanged)
    }
    void loadLimitMailLedger().then(marks => {
      ledger.value = marks
    })
    stopLedger = watchLimitMailLedger(() => {
      void loadLimitMailLedger().then(marks => {
        ledger.value = marks
      })
    })
    if (connection.value.sessionStatus === 'authenticated') {
      void refresh()
    }
  })

  onUnmounted(() => {
    stopLedger()
    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(onStorageChanged)
    }
  })

  return {
    allCards: registry,
    metricCards,
    boardCards,
    isEnabled,
    toggleCard,
    resetVisibility,
    refreshing,
    lastUpdatedText,
    refresh,
  }
}
