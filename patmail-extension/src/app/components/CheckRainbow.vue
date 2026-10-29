<script setup lang="ts">
import { computed } from 'vue'
import { taskCheckProgress } from '../check-progress'

/** 进度条的动词跟着任务走：核对、翻页、取数，写在 taskCheckProgress.label 里。 */
const caption = computed(() => {
  const progress = taskCheckProgress
  const percent = Number.isInteger(progress.percent) ? String(progress.percent) : progress.percent.toFixed(1)
  if (progress.detail) return `${progress.label} ${percent}%（${progress.done}/${progress.total}） ${progress.detail}`
  const head = `已${progress.label} ${percent}%（${progress.done}/${progress.total}）`
  if (progress.status === 'hold') return `${head} 登录中断，接回后继续`
  if (progress.status === 'done') return `${head} ${progress.label}结束`
  if (progress.status === 'fail') return `${head} ${progress.label}停了`
  if (progress.eta) return `${head} 预计 ${progress.eta} 结束`
  return `${head} 正在估算结束时间`
})
</script>

<template>
  <div v-if="taskCheckProgress.visible" class="check-rainbow" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="taskCheckProgress.percent" :aria-valuetext="caption">
    <div class="check-rainbow-track"><span :style="{ width: taskCheckProgress.percent + '%' }"></span></div>
    <p>{{ caption }}</p>
  </div>
</template>
