<script setup lang="ts">
import { computed } from 'vue'
import type { taskCheckProgress } from '../check-progress'
import { topProgress, type TopProgress } from '../composables/useTopProgress'

const props = defineProps<{ progress?: TopProgress | typeof taskCheckProgress }>()
const view = computed<TopProgress>(() => props.progress ?? topProgress.value)
const isStateMode = computed(() => view.value.mode === 'state')
const stateClass = computed(() => {
  const s = view.value.status
  if (s === 'done') return 'is-done'
  if (s === 'hold') return 'is-hold'
  if (s === 'fail') return 'is-fail'
  return 'is-run'
})
const stateDetail = computed(() => {
  const parts = [view.value.summary.trim(), view.value.detail.trim()].filter(Boolean)
  return parts.join('：')
})
const stateAriaLabel = computed(() =>
  [view.value.label, view.value.stage, view.value.elapsed, stateDetail.value].filter(Boolean).join(' ')
)

/** 进度条的动词跟着任务走：核对、翻页、取数，写在 taskCheckProgress.label 里。 */
const percent = computed(() => {
  const value = view.value.percent
  return `${Number.isInteger(value) ? String(value) : value.toFixed(1)}%`
})
const summary = computed(() => {
  const progress = view.value
  if (progress.summary) return progress.summary
  return `${progress.detail ? '' : '已'}${progress.label} ${progress.done}/${progress.total}`
})
const detail = computed(() => {
  const progress = view.value
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
  <div
    v-if="view.visible && isStateMode"
    class="check-rainbow is-state-machine"
    :class="stateClass"
    role="status"
    aria-live="polite"
    :aria-label="stateAriaLabel"
  >
    <div class="check-rainbow-state-head">
      <span class="check-rainbow-dot" aria-hidden="true" />
      <strong class="check-rainbow-title">{{ view.label }}</strong>
      <span v-if="view.stage" class="check-rainbow-stage">{{ view.stage }}</span>
      <time v-if="view.elapsed" class="check-rainbow-elapsed">{{ view.elapsed }}</time>
      <button
        v-if="view.onDismiss && view.status !== 'run'"
        type="button"
        class="check-rainbow-close"
        aria-label="收起状态提示"
        @click="view.onDismiss()"
      >
        ×
      </button>
    </div>
    <p v-if="stateDetail" class="check-rainbow-msg" v-hint.clip="stateDetail">{{ stateDetail }}</p>
  </div>
  <div v-else-if="view.visible" class="check-rainbow" :class="stateClass" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="view.percent" :aria-valuetext="caption">
    <div class="check-rainbow-bar">
      <div class="check-rainbow-track"><span :style="{ width: view.percent + '%' }"></span></div>
      <b class="check-rainbow-percent">{{ percent }}</b>
    </div>
    <p v-hint.clip="summary">{{ summary }}</p>
    <p v-hint.clip="detail">{{ detail }}</p>
  </div>
</template>
