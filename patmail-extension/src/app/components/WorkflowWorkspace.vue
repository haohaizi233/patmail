<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, provide, ref, useId, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import DocsMarkdown from './DocsMarkdown.vue'
import { useWorkflowViewMemory } from '../composables/useWorkflowViewMemory'
import type { WorkflowViewTab } from '../pages/workflow-desk-state'

const props = withDefaults(defineProps<{
  workflowId?: string
  title: string
  description?: string
  guide?: string
  art?: string
  showSteps?: boolean
  showGuide?: boolean
  showUse?: boolean
  lazyUse?: boolean
  active?: boolean
  tabsClass?: string
}>(), {
  workflowId: '',
  description: '',
  guide: '',
  art: undefined,
  showSteps: false,
  showGuide: undefined,
  showUse: true,
  lazyUse: false,
  active: true,
  tabsClass: ''
})

const view = defineModel<WorkflowViewTab>('view', { default: 'guide' })
const emit = defineEmits<{ back: [] }>()

const id = useId()
const headExtraId = `${id}-head-extra`
provide('workflowHeadExtraId', headExtraId)

const { rememberView, saveScroll, restoreScroll } = useWorkflowViewMemory()

const guideSource = computed(() => props.guide.replace(/^# [^\r\n]+\r?\n/, ''))
const hasGuide = computed(() => props.showGuide ?? Boolean(guideSource.value))
const availableTabs = computed<Array<{ id: WorkflowViewTab; label: string }>>(() => {
  const tabs: Array<{ id: WorkflowViewTab; label: string }> = []
  if (props.showSteps) tabs.push({ id: 'steps', label: '步骤流程' })
  if (hasGuide.value) tabs.push({ id: 'guide', label: '流程说明' })
  if (props.showUse) tabs.push({ id: 'use', label: '开始使用' })
  return tabs
})

const guideSeen = ref(props.active && view.value === 'guide')
const useSeen = ref(!props.lazyUse || (props.active && view.value === 'use'))

watch(
  [() => props.active, () => props.workflowId, view, availableTabs] as const,
  ([active, workflowId, currentView, tabs], oldValue) => {
    const [prevActive, prevId, prevView] = oldValue ?? [false, '', currentView]
    if (prevActive && prevId && prevView && (!active || prevId !== workflowId || prevView !== currentView)) {
      saveScroll(prevId, prevView)
    }
    if (!active) return
    const normalized = tabs.some(tab => tab.id === currentView)
      ? currentView
      : (tabs[0]?.id ?? currentView)
    if (normalized !== currentView) {
      view.value = normalized
    }
    if (prevId !== workflowId) {
      guideSeen.value = normalized === 'guide'
      if (props.lazyUse) useSeen.value = normalized === 'use'
    } else {
      if (normalized === 'guide') guideSeen.value = true
      if (normalized === 'use') useSeen.value = true
    }
    if (workflowId) {
      rememberView(workflowId, normalized)
      if (!prevActive || prevId !== workflowId || prevView !== normalized) {
        void nextTick(() => restoreScroll(workflowId, normalized))
      }
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  if (props.active && props.workflowId) {
    saveScroll(props.workflowId, view.value)
  }
})

function selectTab(next: WorkflowViewTab): void {
  if (next === view.value) return
  if (props.workflowId && props.active) {
    saveScroll(props.workflowId, view.value)
  }
  view.value = next
  if (props.workflowId && props.active) {
    rememberView(props.workflowId, next)
  }
}

function navigateTabs(event: KeyboardEvent): void {
  const tabs = availableTabs.value
  if (!tabs.length || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const currentIndex = Math.max(0, tabs.findIndex(tab => tab.id === view.value))
  const nextIndex = event.key === 'Home'
    ? 0
    : event.key === 'End'
      ? tabs.length - 1
      : event.key === 'ArrowRight'
        ? (currentIndex + 1) % tabs.length
        : (currentIndex - 1 + tabs.length) % tabs.length
  const next = tabs[nextIndex]?.id
  if (!next) return
  selectTab(next)
  const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  list?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
}
</script>

<template>
  <slot name="header">
    <PageHead :title="title" :desc="description" :art="art">
      <button type="button" class="workflow-back-btn" @click="emit('back')">回到工作流</button>
      <div :id="headExtraId" class="workflow-head-extra" />
    </PageHead>
  </slot>
  <div v-if="availableTabs.length > 1" class="tabs workflow-view-tabs" :class="tabsClass" role="tablist" :aria-label="`${title}视图`">
    <button
      v-for="tab in availableTabs"
      :id="`${id}-${tab.id}-tab`"
      :key="tab.id"
      type="button"
      role="tab"
      :data-view="tab.id"
      :class="{ on: view === tab.id }"
      :aria-selected="view === tab.id"
      :aria-controls="`${id}-${tab.id}-panel`"
      :tabindex="view === tab.id ? 0 : -1"
      @click="selectTab(tab.id)"
      @keydown="navigateTabs"
    >{{ tab.label }}</button>
  </div>
  <div class="workflow-panels">
    <section
      v-if="showSteps"
      :id="`${id}-steps-panel`"
      class="workflow-steps"
      :class="{ 'is-hidden-pane': view !== 'steps' }"
      :inert="view !== 'steps'"
      :aria-hidden="view !== 'steps' ? 'true' : undefined"
      role="tabpanel"
      :aria-labelledby="availableTabs.length > 1 ? `${id}-steps-tab` : undefined"
      tabindex="0"
    >
      <slot name="steps" />
    </section>
    <section
      v-if="hasGuide"
      :id="`${id}-guide-panel`"
      class="card workflow-guide"
      :class="{ 'is-hidden-pane': view !== 'guide' }"
      :inert="view !== 'guide'"
      :aria-hidden="view !== 'guide' ? 'true' : undefined"
      role="tabpanel"
      :aria-labelledby="availableTabs.length > 1 ? `${id}-guide-tab` : undefined"
      tabindex="0"
    >
      <DocsMarkdown v-if="guideSeen" :source="guideSource" />
    </section>
    <section
      v-if="showUse"
      :id="`${id}-use-panel`"
      class="workflow-use"
      :class="{ 'is-hidden-pane': view !== 'use' }"
      :inert="view !== 'use'"
      :aria-hidden="view !== 'use' ? 'true' : undefined"
      role="tabpanel"
      :aria-labelledby="availableTabs.length > 1 ? `${id}-use-tab` : undefined"
      tabindex="0"
    >
      <slot v-if="useSeen" />
    </section>
  </div>
</template>

<style scoped>
.workflow-view-tabs { margin-bottom: 16px; }
.workflow-view-tabs button { cursor: pointer; }
.workflow-panels { position: relative; min-width: 0; }
.workflow-steps, .workflow-guide, .workflow-use { min-width: 0; }
.workflow-guide { overflow-x: auto; }
.workflow-guide :deep(.docs-md) { margin-inline: auto; }
.workflow-head-extra { margin-left: auto; flex: 0 1 auto; min-width: 0; display: flex; align-items: center; }
.workflow-head-extra:empty { display: none; }
</style>
