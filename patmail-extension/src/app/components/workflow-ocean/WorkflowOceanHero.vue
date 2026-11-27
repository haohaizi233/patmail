<script setup lang="ts">
import Bunny from '../../../shell/components/Bunny.vue'
import type { WorkflowOceanHeroStats } from './workflow-ocean.types'

defineProps<{
  stats: WorkflowOceanHeroStats
}>()
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
    <div class="ocean-hero-spacer" aria-hidden="true" />
  </header>
</template>
