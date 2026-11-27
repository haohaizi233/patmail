<script setup lang="ts">
import WorkflowOceanIcon from './WorkflowOceanIcon.vue'
import type { WorkflowOceanCardView } from './workflow-ocean.types'

defineProps<{
  card: WorkflowOceanCardView
}>()

const emit = defineEmits<{
  open: [card: WorkflowOceanCardView]
  use: [card: WorkflowOceanCardView]
  guide: [card: WorkflowOceanCardView]
  copy: [card: WorkflowOceanCardView]
  remove: [card: WorkflowOceanCardView]
}>()
</script>

<template>
  <article
    class="sea-card ocean-card"
    :class="[`ocean-tone-${card.tone}`, card.cardClass]"
    :data-workflow-id="card.id"
  >
    <div class="ocean-card-stage" aria-hidden="true">
      <div class="ocean-card-glass" />
      <div class="ocean-card-sheen" />
    </div>
    <button type="button" class="sea-open" @click="emit('open', card)">
      <div class="ocean-card-head">
        <span class="ocean-icon-wrap ocean-card-visual" aria-hidden="true">
          <WorkflowOceanIcon :icon="card.icon" />
        </span>
        <div class="ocean-card-title-group">
          <div class="ocean-card-title-row">
            <b>{{ card.title }}</b>
            <span class="sea-badge">{{ card.badge }}</span>
          </div>
        </div>
      </div>
      <small v-hint.clip>{{ card.summary }}</small>
      <em>{{ card.meta }}</em>
    </button>
    <div class="sea-actions">
      <button v-if="card.canUse" type="button" class="sea-action-primary" @click="emit('use', card)">开始使用</button>
      <button v-if="card.canGuide" type="button" class="sea-remove" @click="emit('guide', card)">流程说明</button>
      <button v-if="card.canCopy" type="button" class="sea-remove" @click="emit('copy', card)">复制副本</button>
      <button v-if="card.canRemove" type="button" class="sea-remove" @click="emit('remove', card)">拿掉</button>
    </div>
  </article>
</template>
