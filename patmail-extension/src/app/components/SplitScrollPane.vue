<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
const props = defineProps<{ sidebarLabel: string; detailLabel: string; detailKey?: string }>()
const host = ref<HTMLElement | null>(null), main = ref<HTMLElement | null>(null), height = ref(520)
let observer: ResizeObserver | undefined
let frame = 0
function measure(): void {
  if (host.value?.getClientRects().length) height.value = Math.max(280, Math.floor(window.innerHeight - Math.max(0, host.value.getBoundingClientRect().top) - 20))
}
function scheduleMeasure(): void { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
onMounted(() => {
  measure(); window.addEventListener('resize', scheduleMeasure)
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(scheduleMeasure)
    // Watch the header/toolbars, not our own height-changing parent.
    for (let sibling = host.value?.previousElementSibling; sibling; sibling = sibling.previousElementSibling) observer.observe(sibling)
  }
})
onBeforeUnmount(() => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', scheduleMeasure) })
watch(() => props.detailKey, () => { if (main.value) main.value.scrollTop = 0 })
</script>
<template>
  <div ref="host" class="split-scroll-pane" :style="{ '--split-height': `${height}px` }">
    <aside class="split-scroll-sidebar" role="region" :aria-label="sidebarLabel" tabindex="0"><slot name="sidebar" /></aside>
    <section ref="main" class="split-scroll-detail" role="region" :aria-label="detailLabel" tabindex="0"><slot /></section>
  </div>
</template>
<style scoped>
.split-scroll-pane { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 14px; height: var(--split-height); min-height: 280px; min-width: 0; overflow-anchor: none; }
.split-scroll-sidebar, .split-scroll-detail { min-width: 0; min-height: 0; overflow: auto; overscroll-behavior: contain; scrollbar-gutter: stable; border-radius: 16px; }
@media(max-width: 850px) { .split-scroll-pane { grid-template-columns: 1fr; grid-template-rows: minmax(100px, 180px) minmax(280px, 1fr); height: max(520px, var(--split-height)); } }
</style>
