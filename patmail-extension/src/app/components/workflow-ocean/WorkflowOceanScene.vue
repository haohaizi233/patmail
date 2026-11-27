<script setup lang="ts">
import { computed, ref } from 'vue'
import WorkflowOceanAtmosphere from './WorkflowOceanAtmosphere.vue'
import WorkflowOceanCanvas from './WorkflowOceanCanvas.vue'
import WorkflowOceanHero from './WorkflowOceanHero.vue'
import { useOceanCamera } from './composables/useOceanCamera'
import { useOceanLifecycle } from './composables/useOceanLifecycle'
import { useOceanQuality } from './composables/useOceanQuality'
import { useOceanRenderer } from './composables/useOceanRenderer'
import type { OceanQuality } from './rendering/render-scheduler'
import type { WorkflowOceanHeroStats } from './workflow-ocean.types'

const props = defineProps<{
  active: boolean
  stats: WorkflowOceanHeroStats
}>()

const sceneRef = ref<HTMLElement | null>(null)
const canvasComponentRef = ref<InstanceType<typeof WorkflowOceanCanvas> | null>(null)
const canvasEl = computed(() => canvasComponentRef.value?.canvasRef ?? null)

const {
  quality,
  effectiveQuality,
  fallbackReason: qualityFallbackReason,
  webglUnavailable,
  setQuality,
  setEffectiveOverride,
  markWebglUnavailable,
  resetForRetry
} = useOceanQuality()

const { renderingActive, reducedMotion } = useOceanLifecycle({
  sceneEl: sceneRef,
  screenActive: computed(() => props.active),
  quality,
  webglUnavailable
})

const {
  rendererState,
  canShowCanvas,
  fallbackReason: rendererFallbackReason,
  setPointerTarget,
  retry3D
} = useOceanRenderer({
  canvasEl,
  quality,
  renderingActive,
  onWebglUnavailable: reason => markWebglUnavailable(reason),
  onEffectiveQualityChange: (effective, reason) => {
    if (reason) {
      setEffectiveOverride(effective, reason)
    }
  }
})

useOceanCamera({
  sceneEl: sceneRef,
  active: renderingActive,
  reducedMotion,
  onPointerTarget: setPointerTarget
})

const mergedFallbackReason = computed(
  () => rendererFallbackReason.value ?? qualityFallbackReason.value
)

function handleSelectQuality(next: OceanQuality): void {
  if (next !== 'static' && webglUnavailable.value) {
    resetForRetry()
  }
  setQuality(next)
}

function handleRetry3D(): void {
  resetForRetry()
  retry3D()
}
</script>

<template>
  <div
    ref="sceneRef"
    class="workflow-ocean"
    data-testid="workflow-ocean-scene"
    :data-ocean-quality="quality"
    :data-ocean-effective-quality="effectiveQuality"
    :data-ocean-state="rendererState"
    :data-ocean-3d="canShowCanvas ? 'true' : 'false'"
    :data-ocean-rendering="renderingActive ? 'true' : 'false'"
  >
    <WorkflowOceanCanvas
      v-if="quality !== 'static' && !webglUnavailable"
      ref="canvasComponentRef"
      :class="{ 'is-ready': canShowCanvas }"
    />
    <WorkflowOceanAtmosphere :active="renderingActive" />
    <WorkflowOceanHero
      :stats="stats"
      :quality="quality"
      :effective-quality="effectiveQuality"
      :fallback-reason="mergedFallbackReason"
      @update:quality="handleSelectQuality"
      @retry3d="handleRetry3D"
    />
    <div class="ocean-grid-wrap">
      <section class="sea ocean-grid" aria-label="工作流列表">
        <slot />
      </section>
    </div>
  </div>
</template>
