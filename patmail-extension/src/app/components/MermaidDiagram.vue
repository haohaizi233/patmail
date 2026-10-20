<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { renderDiagram } from '../docs/mermaid'
import MermaidCanvas from './MermaidCanvas.vue'

const props = defineProps<{ source: string; title: string }>()
const svg = ref('')
const error = ref('')
const loading = ref(true)
const expanded = ref(false)
const dialog = ref<HTMLDialogElement | null>(null)
let token = 0
watch(() => props.source, async source => {
  const request = ++token
  loading.value = true
  error.value = ''
  svg.value = ''
  try {
    const rendered = await renderDiagram(source)
    if (request === token) svg.value = rendered
  } catch {
    if (request === token) error.value = '这张图暂时无法渲染，可展开原文查看 Mermaid。'
  } finally {
    if (request === token) loading.value = false
  }
}, { immediate: true })
async function expand(): Promise<void> {
  expanded.value = true
  await nextTick()
  dialog.value?.showModal()
}
function close(): void {
  dialog.value?.close()
  expanded.value = false
}
onBeforeUnmount(() => { ++token; dialog.value?.close() })
</script>

<template>
  <figure class="mermaid-figure" :aria-label="title">
    <figcaption><button type="button" :disabled="!svg" @click="expand">放大查看</button></figcaption>
    <p v-if="loading" class="docs-loading" role="status">正在绘制流程图…</p>
    <p v-else-if="error" class="mermaid-error" role="alert">{{ error }}</p>
    <MermaidCanvas v-else :svg="svg" />
    <details class="mermaid-source"><summary>Mermaid 原文</summary><pre><code>{{ source }}</code></pre></details>
  </figure>
  <Teleport to="body">
    <dialog v-if="expanded" ref="dialog" class="mermaid-dialog" :aria-label="title + ' · 放大查看'" @cancel.prevent="close" @close="expanded = false" @keydown.stop>
      <header class="mermaid-dialog-head"><h3>{{ title }}</h3><button type="button" aria-label="关闭放大图" autofocus @click="close">关闭 ×</button></header>
      <MermaidCanvas :svg="svg" interactive />
    </dialog>
  </Teleport>
</template>
