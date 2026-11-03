<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import PageHead from '../../shell/components/PageHead.vue'
import DocsMarkdown from './DocsMarkdown.vue'

const props = defineProps<{ title: string; description: string; guide: string; art?: string }>()
const view = defineModel<'guide' | 'use'>('view', { default: 'guide' })
const emit = defineEmits<{ back: [] }>()
const id = useId()
const guideSeen = ref(view.value === 'guide')
const guideSource = computed(() => props.guide.replace(/^# [^\r\n]+\r?\n/, ''))
watch(view, value => { if (value === 'guide') guideSeen.value = true })

function navigateTabs(event: KeyboardEvent): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const next = event.key === 'Home' ? 'guide'
    : event.key === 'End' ? 'use'
    : view.value === 'guide' ? 'use' : 'guide'
  view.value = next
  const list = (event.currentTarget as HTMLElement).closest('[role="tablist"]')
  list?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
}
</script>

<template>
  <PageHead :title="title" :desc="description" :art="art">
    <button type="button" class="ghost" @click="emit('back')">回到工作流</button>
  </PageHead>
  <div class="tabs workflow-view-tabs" role="tablist" :aria-label="`${title}视图`">
    <button
      :id="`${id}-guide-tab`" type="button" role="tab" data-view="guide"
      :class="{ on: view === 'guide' }" :aria-selected="view === 'guide'"
      :aria-controls="`${id}-guide-panel`" :tabindex="view === 'guide' ? 0 : -1"
      @click="view = 'guide'" @keydown="navigateTabs"
    >流程说明</button>
    <button
      :id="`${id}-use-tab`" type="button" role="tab" data-view="use"
      :class="{ on: view === 'use' }" :aria-selected="view === 'use'"
      :aria-controls="`${id}-use-panel`" :tabindex="view === 'use' ? 0 : -1"
      @click="view = 'use'" @keydown="navigateTabs"
    >开始使用</button>
  </div>
  <section
    v-show="view === 'guide'" :id="`${id}-guide-panel`" class="card workflow-guide"
    role="tabpanel" :aria-labelledby="`${id}-guide-tab`" tabindex="0"
  >
    <DocsMarkdown v-if="guideSeen" :source="guideSource" />
  </section>
  <section
    v-show="view === 'use'" :id="`${id}-use-panel`" class="workflow-use"
    role="tabpanel" :aria-labelledby="`${id}-use-tab`" tabindex="0"
  >
    <slot />
  </section>
</template>

<style scoped>
.workflow-view-tabs { margin-bottom: 16px; }
.workflow-view-tabs button { cursor: pointer; }
.workflow-guide, .workflow-use { min-width: 0; }
.workflow-guide { overflow-x: auto; }
.workflow-guide :deep(.docs-md) { margin-inline: auto; }
</style>
