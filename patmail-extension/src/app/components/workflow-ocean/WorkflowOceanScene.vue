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

const { quality, webglUnavailable, setQuality, markWebglUnavailable } = useOceanQuality()
const { renderingActive, reducedMotion } = useOceanLifecycle({
  sceneEl: sceneRef,
  screenActive: computed(() => props.active),
  quality,
  webglUnavailable
})

const { webglActive, setPointerTarget } = useOceanRenderer({
  canvasEl,
  quality,
  renderingActive,
  onWebglUnavailable: markWebglUnavailable
})

useOceanCamera({
  sceneEl: sceneRef,
  active: renderingActive,
  reducedMotion,
  onPointerTarget: setPointerTarget
})

function handleSelectQuality(next: OceanQuality): void {
  setQuality(next)
}
</script>

<template>
  <div
    ref="sceneRef"
    class="workflow-ocean"
    data-testid="workflow-ocean-scene"
    :data-ocean-quality="quality"
    :data-ocean-3d="webglActive ? 'true' : 'false'"
    :data-ocean-rendering="renderingActive ? 'true' : 'false'"
  >
    <WorkflowOceanCanvas
      v-if="quality !== 'static' && !webglUnavailable"
      ref="canvasComponentRef"
    />
    <WorkflowOceanAtmosphere :active="renderingActive" />
    <WorkflowOceanHero
      :stats="stats"
      :quality="quality"
      :webgl-active="webglActive"
      @update:quality="handleSelectQuality"
    />
    <div class="ocean-grid-wrap">
      <section class="sea ocean-grid" aria-label="工作流列表">
        <slot />
      </section>
    </div>
  </div>
</template>
