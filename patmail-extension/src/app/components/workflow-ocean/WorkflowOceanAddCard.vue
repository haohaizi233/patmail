<script setup lang="ts">
import WorkflowOceanIcon from './WorkflowOceanIcon.vue'

const emit = defineEmits<{
  open: []
}>()
</script>

<template>
  <button
    type="button"
    class="sea-card sea-add ocean-add-card ocean-tone-prism"
    data-testid="workflow-ocean-add-card"
    @click="emit('open')"
  >
    <span class="ocean-add-portal" aria-hidden="true">
      <span class="ocean-add-ring ocean-add-ring-outer" />
      <span class="ocean-add-ring" />
      <WorkflowOceanIcon icon="ocean-add" />
    </span>
    <b>从知识海洋加一条</b>
    <small>自由挑选常用步骤，按业务顺序编排你的专属工作流。</small>
  </button>
</template>
