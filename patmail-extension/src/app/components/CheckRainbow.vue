<script setup lang="ts">
import { computed } from 'vue'
import { taskCheckProgress } from '../check-progress'

/** 进度条的动词跟着任务走：核对、翻页、取数，写在 taskCheckProgress.label 里。 */
const summary = computed(() => {
  const progress = taskCheckProgress
  const percent = Number.isInteger(progress.percent) ? String(progress.percent) : progress.percent.toFixed(1)
  return `${progress.detail ? '' : '已'}${progress.label} ${percent}%（${progress.done}/${progress.total}）`
})
const detail = computed(() => {
  const progress = taskCheckProgress
  if (progress.detail) return progress.detail
  if (progress.status === 'hold') return '登录中断，接回后继续'
  if (progress.status === 'done') return `${progress.label}结束`
  if (progress.status === 'fail') return `${progress.label}停了`
  if (progress.eta) return `预计 ${progress.eta} 结束`
  return '正在估算结束时间'
})
const caption = computed(() => `${summary.value} ${detail.value}`)
</script>

<template>
  <div v-if="taskCheckProgress.visible" class="check-rainbow" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="taskCheckProgress.percent" :aria-valuetext="caption">
    <div class="check-rainbow-track"><span :style="{ width: taskCheckProgress.percent + '%' }"></span></div>
    <p :title="summary">{{ summary }}</p>
    <p :title="detail">{{ detail }}</p>
  </div>
</template>
