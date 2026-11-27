<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import WorkflowOceanAtmosphere from './WorkflowOceanAtmosphere.vue'
import WorkflowOceanHero from './WorkflowOceanHero.vue'
import type { WorkflowOceanHeroStats } from './workflow-ocean.types'

const props = defineProps<{
  active: boolean
  stats: WorkflowOceanHeroStats
}>()

const sceneRef = ref<HTMLElement | null>(null)
const isDocumentHidden = ref(typeof document !== 'undefined' ? document.hidden : false)

let rafId = 0
let targetX = 0
let targetY = 0
let attachedEl: HTMLElement | null = null

function canAnimateParallax(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  const finePointer = window.matchMedia('(pointer: fine)').matches
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return finePointer && !reducedMotion
}

function flushParallax(): void {
  rafId = 0
  const el = sceneRef.value
  if (!el) return
  el.style.setProperty('--ocean-px', `${targetX.toFixed(2)}px`)
  el.style.setProperty('--ocean-py', `${targetY.toFixed(2)}px`)
}

function scheduleParallax(x: number, y: number): void {
  targetX = x
  targetY = y
  if (!rafId && typeof requestAnimationFrame === 'function') {
    rafId = requestAnimationFrame(flushParallax)
  }
}

function onPointerMove(event: PointerEvent): void {
  const el = sceneRef.value
  if (!el || !props.active || isDocumentHidden.value) return
  const rect = el.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const nx = (event.clientX - rect.left) / rect.width - 0.5
  const ny = (event.clientY - rect.top) / rect.height - 0.5
  scheduleParallax(nx * 10, ny * 8)
}

function onPointerLeave(): void {
  scheduleParallax(0, 0)
}

function onVisibilityChange(): void {
  isDocumentHidden.value = typeof document !== 'undefined' ? document.hidden : false
  if (isDocumentHidden.value) {
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
  }
}

function detachListeners(): void {
  if (attachedEl) {
    attachedEl.removeEventListener('pointermove', onPointerMove)
    attachedEl.removeEventListener('pointerleave', onPointerLeave)
    attachedEl = null
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
  if (rafId && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafId)
    rafId = 0
  }
  const el = sceneRef.value
  if (el) {
    el.style.setProperty('--ocean-px', '0px')
    el.style.setProperty('--ocean-py', '0px')
  }
}

function syncListeners(): void {
  const el = sceneRef.value
  if (!props.active || !el || !canAnimateParallax()) {
    detachListeners()
    return
  }
  if (attachedEl === el) return
  detachListeners()
  el.addEventListener('pointermove', onPointerMove, { passive: true })
  el.addEventListener('pointerleave', onPointerLeave, { passive: true })
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }
  attachedEl = el
}

watch([() => props.active, sceneRef], () => {
  syncListeners()
}, { immediate: true })

onBeforeUnmount(() => {
  detachListeners()
})
</script>

<template>
  <div ref="sceneRef" class="workflow-ocean" data-testid="workflow-ocean-scene">
    <WorkflowOceanAtmosphere :active="active && !isDocumentHidden" />
    <WorkflowOceanHero :stats="stats" />
    <div class="ocean-grid-wrap">
      <section class="sea ocean-grid" aria-label="工作流列表">
        <slot />
      </section>
    </div>
  </div>
</template>
