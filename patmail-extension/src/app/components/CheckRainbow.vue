<script setup lang="ts">
import { computed } from 'vue'
import { taskCheckProgress } from '../check-progress'

/** label 换个说法：核对是 PCT 表格的核对，递交导出这条是取数。 */
const props = withDefaults(defineProps<{ pageOn: boolean; label?: string }>(), { label: '核对' })
const shown = computed(() => props.pageOn && taskCheckProgress.visible)
const caption = computed(() => {
  const progress = taskCheckProgress
  const percent = Number.isInteger(progress.percent) ? String(progress.percent) : progress.percent.toFixed(1)
  const head = `已${props.label} ${percent}%（${progress.done}/${progress.total}）`
  if (progress.status === 'hold') return `${head} 登录中断，接回后继续`
  if (progress.status === 'done') return `${head} ${props.label}结束`
  if (progress.status === 'fail') return `${head} ${props.label}停了`
  if (progress.eta) return `${head} 预计 ${progress.eta} 结束`
  return `${head} 正在估算结束时间`
})
</script>

<template>
  <div v-if="shown" class="check-rainbow" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="taskCheckProgress.percent" :aria-valuetext="caption">
    <div class="check-rainbow-track"><span :style="{ width: taskCheckProgress.percent + '%' }"></span></div>
    <p>{{ caption }}</p>
  </div>
</template>
