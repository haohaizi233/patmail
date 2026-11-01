<script setup lang="ts">
import { computed } from 'vue'
import { taskCheckProgress } from '../check-progress'

/** 进度条的动词跟着任务走：核对、翻页、取数，写在 taskCheckProgress.label 里。 */
const percent = computed(() => {
  const value = taskCheckProgress.percent
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}%`
})
const summary = computed(() => {
  const progress = taskCheckProgress
  if (progress.summary) return progress.summary
  return `${progress.detail ? '' : '已'}${progress.label} ${progress.done}/${progress.total}`
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
/** 百分比单列在进度条右端，两行文案留给阶段和分步计数；无障碍文案把百分比念在最前。 */
const caption = computed(() => `${percent.value} ${summary.value} ${detail.value}`)
</script>

<template>
  <div v-if="taskCheckProgress.visible" class="check-rainbow" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="taskCheckProgress.percent" :aria-valuetext="caption">
    <div class="check-rainbow-bar">
      <div class="check-rainbow-track"><span :style="{ width: taskCheckProgress.percent + '%' }"></span></div>
      <b class="check-rainbow-percent">{{ percent }}</b>
    </div>
    <p :title="summary">{{ summary }}</p>
    <p :title="detail">{{ detail }}</p>
  </div>
</template>
