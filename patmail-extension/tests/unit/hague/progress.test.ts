import { expect, it } from 'vitest'
import { createApp, h, nextTick, reactive } from 'vue'
import CheckRainbow from '../../../src/app/components/CheckRainbow.vue'
import { taskCheckProgress } from '../../../src/app/check-progress'
import { registerTopProgress, topProgress } from '../../../src/app/composables/useTopProgress'
import { computed, ref } from 'vue'

it('reuses rainbow styling with scoped progress without changing another workflow', async () => {
  const globalBefore = { ...taskCheckProgress }
  const progress = reactive({ ...globalBefore, visible: true, done: 1, total: 2, percent: 50, summary: '海牙 1/2', detail: '仲裁中' })
  const root = document.createElement('div')
  const app = createApp({ render: () => h(CheckRainbow, { progress }) })
  app.mount(root)
  expect(root.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('50')
  progress.percent = 100
  await nextTick()
  expect(root.textContent).toContain('100%')
  expect(taskCheckProgress).toEqual(globalBefore)
  app.unmount()
})
it('routes active workspace progress to the header and restores the previous provider on exit', () => {
  const enabled = ref(true), visible = computed(() => ({ ...taskCheckProgress, visible: true, percent: 42, label: '海牙材料' }))
  const before = { ...taskCheckProgress }
  const release = registerTopProgress(visible, computed(() => enabled.value))
  expect(topProgress.value.percent).toBe(42)
  enabled.value = false
  expect(topProgress.value).toEqual(before)
  enabled.value = true
  release()
  expect(topProgress.value).toEqual(before)
  expect(taskCheckProgress).toEqual(before)
})
