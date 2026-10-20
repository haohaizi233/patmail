<script setup lang="ts">
import { computed } from 'vue'
import { documentBlocks } from '../docs/markdown'
import MermaidDiagram from './MermaidDiagram.vue'

const props = defineProps<{ source: string }>()
const emit = defineEmits<{ navigate: [file: string] }>()
const blocks = computed(() => documentBlocks(props.source))
function follow(event: MouseEvent): void {
  const link = (event.target as Element | null)?.closest('a[data-doc-file]')
  if (!link) return
  event.preventDefault()
  emit('navigate', link.getAttribute('data-doc-file') ?? '')
}
</script>

<template>
  <div class="docs-md" @click="follow">
    <template v-for="(block, index) in blocks" :key="index">
      <div v-if="block.kind === 'html'" v-html="block.html"></div>
      <MermaidDiagram v-else :source="block.source" :title="block.title" />
    </template>
  </div>
</template>
