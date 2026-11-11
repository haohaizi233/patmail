<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onDeactivated, ref, watch } from 'vue'
const props = defineProps<{ items: { src: string; label: string }[] }>()
const index = defineModel<number | null>('index', { default: null })
const current = computed(() => index.value === null ? undefined : props.items[index.value])
const stage = ref<HTMLElement | null>(null), dialog = ref<HTMLElement | null>(null), closeButton = ref<HTMLButtonElement | null>(null)
const zoom = ref(1), natural = ref({ width: 0, height: 0 }), bounds = ref({ width: 800, height: 600 })
let previousFocus: HTMLElement | null = null, observer: ResizeObserver | undefined
const fitWidth = computed(() => natural.value.width && natural.value.height ? Math.min(natural.value.width, bounds.value.width - 24, (bounds.value.height - 24) * natural.value.width / natural.value.height) : bounds.value.width - 24)
function close(): void { index.value = null }
function move(delta: number): void {
  if (index.value !== null) index.value = Math.min(props.items.length - 1, Math.max(0, index.value + delta))
}
function zoomBy(delta: number): void { zoom.value = Math.min(8, Math.max(0.25, Math.round((zoom.value + delta) * 100) / 100)) }
function measure(): void { if (stage.value) bounds.value = { width: stage.value.clientWidth, height: stage.value.clientHeight } }
function loaded(event: Event): void { const img = event.target as HTMLImageElement; natural.value = { width: img.naturalWidth, height: img.naturalHeight }; measure() }
function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1) }
  else if (event.key === 'ArrowRight') { event.preventDefault(); move(1) }
  else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(0.25) }
  else if (event.key === '-') { event.preventDefault(); zoomBy(-0.25) }
  else if (event.key === 'Tab' && dialog.value) {
    const buttons = [...dialog.value.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const first = buttons[0], last = buttons.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
}
watch(index, async (next, old) => {
  zoom.value = 1; natural.value = { width: 0, height: 0 }
  if (next !== null && old === null) previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  await nextTick()
  observer?.disconnect()
  if (next === null) { if (previousFocus?.isConnected) previousFocus.focus(); previousFocus = null; return }
  measure(); if (stage.value) { stage.value.scrollTop = 0; stage.value.scrollLeft = 0 }
  if (typeof ResizeObserver !== 'undefined' && stage.value) { observer = new ResizeObserver(measure); observer.observe(stage.value) }
  if (old === null) closeButton.value?.focus()
})
onBeforeUnmount(() => { observer?.disconnect(); if (previousFocus?.isConnected) previousFocus.focus() })
onDeactivated(close)
</script>
<template>
  <Teleport to="body">
    <div v-if="current" class="avatar-zoom image-preview" @click.self="close">
      <section ref="dialog" class="card image-preview-card" role="dialog" aria-modal="true" aria-label="图片放大预览" @keydown="onKey">
        <header class="card-head"><h2>{{ current.label }}</h2><button ref="closeButton" type="button" class="ghost" aria-label="关闭图片预览" @click="close">关闭 ×</button></header>
        <div class="toolbar">
          <button type="button" class="ghost" aria-label="上一张图片" :disabled="index === 0" @click="move(-1)">上一张</button>
          <span class="image-preview-count">{{ (index ?? 0) + 1 }} / {{ items.length }}</span>
          <button type="button" class="ghost" aria-label="下一张图片" :disabled="index === items.length - 1" @click="move(1)">下一张</button>
          <button type="button" class="ghost" aria-label="缩小图片" :disabled="zoom <= 0.25" @click="zoomBy(-0.25)">−</button>
          <button type="button" class="ghost" aria-label="适应窗口" @click="zoom = 1">{{ Math.round(zoom * 100) }}%</button>
          <button type="button" class="ghost" aria-label="放大图片" :disabled="zoom >= 8" @click="zoomBy(0.25)">＋</button>
        </div>
        <div ref="stage" class="image-preview-stage"><div class="image-preview-canvas"><img :key="current.src" :src="current.src" :alt="current.label" :style="{ width: `${Math.max(1, fitWidth * zoom)}px` }" @load="loaded" /></div></div>
        <p class="hint">点击背景或按 Esc 关闭；方向键切换图片，＋/− 调整大小。放大后可滚动查看。</p>
      </section>
    </div>
  </Teleport>
</template>
<style scoped>
.image-preview-card { width: min(1100px, 96vw); max-height: 94dvh; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.image-preview .card-head { margin-bottom: 0; }
.image-preview .card-head h2 { overflow-wrap: anywhere; min-width: 0; }
.image-preview button { position: static; width: auto; height: 36px; border: 1px solid var(--line); border-radius: 10px; padding: 0 12px; line-height: normal; font-size: 13px; flex: none; }
.image-preview-count { margin: 0; }
.image-preview-stage { height: min(68dvh, 780px); min-height: 160px; min-width: 0; overflow: auto; overscroll-behavior: contain; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
.image-preview-canvas { min-width: 100%; min-height: 100%; display: flex; padding: 12px; }
.image-preview img { display: block; flex: none; height: auto; max-width: none; margin: auto; object-fit: contain; border-radius: 0; box-shadow: none; }
.image-preview .hint { margin: 0; }
</style>
