<script setup lang="ts">
import Bunny from '../../../shell/components/Bunny.vue'
import type { OceanQuality } from './rendering/render-scheduler'
import type { WorkflowOceanHeroStats } from './workflow-ocean.types'

defineProps<{
  stats: WorkflowOceanHeroStats
  quality: OceanQuality
  effectiveQuality: OceanQuality
  fallbackReason: string | null
}>()

const emit = defineEmits<{
  'update:quality': [value: OceanQuality]
  retry3d: []
}>()

const QUALITY_OPTIONS: ReadonlyArray<{ value: OceanQuality; label: string }> = [
  { value: 'cinema', label: '电影' },
  { value: 'balanced', label: '平衡' },
  { value: 'eco', label: '节能' },
  { value: 'static', label: '静态' }
]
</script>

<template>
  <header class="ocean-hero" data-testid="workflow-ocean-hero">
    <div class="ocean-hero-main">
      <div class="ocean-hero-mascot" aria-hidden="true">
        <Bunny />
      </div>
      <div class="ocean-hero-copy">
        <span class="ocean-hero-eyebrow">PatMail · Knowledge Ocean</span>
        <h1 class="ocean-hero-title">工作流 · 知识海洋</h1>
        <p class="ocean-hero-subtitle">让知识在海洋中流动，让重复工作变得简单。</p>
        <div class="ocean-hero-stats" aria-label="工作流概览">
          <span class="ocean-stat-pill">全部工作流 <strong>{{ stats.total }}</strong> 条</span>
          <span class="ocean-stat-pill">内置专案与工具 <strong>{{ stats.systemAndTool }}</strong> 条</span>
          <span v-if="stats.custom > 0" class="ocean-stat-pill">自定义编排 <strong>{{ stats.custom }}</strong> 条</span>
        </div>
      </div>
    </div>
    <div class="ocean-hero-controls">
      <div class="ocean-quality-switch" role="group" aria-label="渲染画质">
        <button
          v-for="opt in QUALITY_OPTIONS"
          :key="opt.value"
          type="button"
          class="ocean-quality-pill"
          :class="{ 'is-active': quality === opt.value }"
          :aria-pressed="quality === opt.value"
          :data-quality-option="opt.value"
          @click="emit('update:quality', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
      <div
        v-if="quality !== 'static' && effectiveQuality === 'static'"
        class="ocean-fallback-banner"
        data-testid="ocean-fallback-banner"
      >
        <span>当前已降级为静态模式{{ fallbackReason ? `（${fallbackReason}）` : '' }}</span>
        <button
          type="button"
          class="ocean-retry-btn"
          data-testid="ocean-retry-3d"
          @click="emit('retry3d')"
        >
          重新启用 3D
        </button>
      </div>
    </div>
  </header>
</template>
