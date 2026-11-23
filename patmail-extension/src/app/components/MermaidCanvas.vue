<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'
import { loadMermaidViewMode, saveMermaidViewMode, type MermaidViewMode } from '../../settings/mermaid-view-mode'
import {
  computeFitWidth,
  computeFitWindow,
  MAX_INLINE_FIT_SCALE,
  MAX_INTERACTIVE_FIT_SCALE,
} from '../docs/mermaid-fit'

const props = defineProps<{ svg: string; interactive?: boolean }>()
const suffix = useId().replace(/[^a-zA-Z0-9_-]/g, '')
// A diagram is shown inline and in its viewer: scope SVG IDs so marker and
// stylesheet references cannot accidentally resolve to the other copy.
const scopedSvg = computed(() => {
  const ids = new Map<string, string>()
  for (const match of props.svg.matchAll(/\bid="([^"]+)"/g)) ids.set(match[1], `${match[1]}-${suffix}`)
  return props.svg
    .replace(/\bid="([^"]+)"/g, (_, id: string) => `id="${ids.get(id)}"`)
    .replace(/#([a-zA-Z_][\w:.-]*)/g, (whole, id: string) => ids.has(id) ? `#${ids.get(id)}` : whole)
})
const viewport = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const scale = ref(1)
const x = ref(0)
const y = ref(0)
const size = ref({ width: 1, height: 1 })
const dragging = ref(false)
const mode = ref<MermaidViewMode | 'free'>('window')
const preferenceReady = ref(!props.interactive)
const storageNotice = ref('')
let disposed = false
let selection = 0
let drag: { id: number; x: number; y: number } | undefined
let observer: ResizeObserver | undefined
const transform = computed(() => ({
  width: `${size.value.width}px`, height: `${size.value.height}px`,
  transform: `translate(${x.value}px, ${y.value}px) scale(${scale.value})`
}))
const percent = computed(() => Number((scale.value * 100).toFixed(2)))
const viewportStyle = computed(() => props.interactive ? undefined : ({ height: `${size.value.height * scale.value + 32}px` }))

function fitWidth(): void {
  const host = viewport.value
  if (!host) return
  const next = computeFitWidth(
    host.clientWidth,
    size.value.width,
    props.interactive ? MAX_INTERACTIVE_FIT_SCALE : MAX_INLINE_FIT_SCALE,
  )
  if (!next) return
  scale.value = next.scale
  x.value = next.x
  y.value = next.y
}

function fit(): void {
  if (!props.interactive) return fitWidth()
  const host = viewport.value
  if (!host) return
  const next = computeFitWindow(
    host.clientWidth,
    host.clientHeight,
    size.value.width,
    size.value.height,
    MAX_INTERACTIVE_FIT_SCALE,
  )
  if (!next) return
  scale.value = next.scale
  x.value = next.x
  y.value = next.y
}

function applyMode(): void {
  if (!props.interactive) return fitWidth()
  if (!preferenceReady.value) return
  if (mode.value === 'window') fit()
  else if (mode.value === 'width') fitWidth()
  else if (mode.value === 'original' && viewport.value) {
    scale.value = 1
    x.value = (viewport.value.clientWidth - size.value.width) / 2
    y.value = (viewport.value.clientHeight - size.value.height) / 2
  }
}

function chooseMode(next: MermaidViewMode): void {
  selection += 1
  const mine = selection
  preferenceReady.value = true
  mode.value = next
  storageNotice.value = ''
  applyMode()
  void saveMermaidViewMode(next).then(saved => {
    if (!disposed && selection === mine && !saved) storageNotice.value = '模式暂未保存，当前窗口仍可使用'
  })
}

function zoom(next: number, cx?: number, cy?: number): void {
  const host = viewport.value
  if (!host || !Number.isFinite(next) || next <= 0) return
  mode.value = 'free'
  preferenceReady.value = true
  selection += 1
  next = Math.max(0.001, Math.min(1000, next))
  const px = cx ?? host.clientWidth / 2
  const py = cy ?? host.clientHeight / 2
  const ratio = next / scale.value
  x.value = px - (px - x.value) * ratio
  y.value = py - (py - y.value) * ratio
  scale.value = next
}

function wheel(event: WheelEvent): void {
  if (!props.interactive) return
  event.preventDefault()
  const rect = viewport.value!.getBoundingClientRect()
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? rect.height : 1)
  zoom(scale.value * Math.exp(-Math.max(-300, Math.min(300, delta)) * 0.002), event.clientX - rect.left, event.clientY - rect.top)
}

function down(event: PointerEvent): void {
  if (!props.interactive || event.button !== 0) return
  viewport.value?.focus({ preventScroll: true })
  viewport.value?.setPointerCapture(event.pointerId)
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY }
  dragging.value = true
}
function move(event: PointerEvent): void {
  if (!drag || drag.id !== event.pointerId) return
  x.value += event.clientX - drag.x
  y.value += event.clientY - drag.y
  drag.x = event.clientX
  drag.y = event.clientY
}
function up(event: PointerEvent): void {
  if (drag?.id !== event.pointerId) return
  drag = undefined
  dragging.value = false
}
function key(event: KeyboardEvent): void {
  if (!props.interactive) return
  if (event.key === '+' || event.key === '=') zoom(scale.value * 1.25)
  else if (event.key === '-') zoom(scale.value / 1.25)
  else if (event.key === '0') chooseMode('window')
  else if (event.key === 'ArrowLeft') x.value += 40
  else if (event.key === 'ArrowRight') x.value -= 40
  else if (event.key === 'ArrowUp') y.value += 40
  else if (event.key === 'ArrowDown') y.value -= 40
  else return
  event.preventDefault()
}
async function measure(): Promise<void> {
  await nextTick()
  const svg = content.value?.querySelector('svg')
  if (!svg) return
  const box = svg.viewBox.baseVal
  size.value = { width: box.width || 800, height: box.height || 600 }
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.maxWidth = 'none'
  applyMode()
}
watch(() => props.svg, measure)
onMounted(() => {
  void measure()
  if (props.interactive) {
    const mine = selection
    void loadMermaidViewMode().then(saved => {
      if (disposed || selection !== mine) return
      mode.value = saved
      preferenceReady.value = true
      applyMode()
    })
  }
  // Inline height is derived from width; observing its height must not create
  // a resize/fit feedback loop. Expanded viewers still fit both dimensions.
  let lastWidth = 0
  let lastHeight = 0
  observer = new ResizeObserver(() => {
    const host = viewport.value
    if (!host) return
    if (host.clientWidth !== lastWidth || (props.interactive && host.clientHeight !== lastHeight)) applyMode()
    lastWidth = host.clientWidth
    lastHeight = host.clientHeight
  })
  if (viewport.value) {
    observer.observe(viewport.value)
    viewport.value.addEventListener('wheel', wheel, { passive: false })
  }
})
onBeforeUnmount(() => {
  disposed = true
  observer?.disconnect()
  viewport.value?.removeEventListener('wheel', wheel)
})
</script>

<template>
  <div class="mermaid-canvas">
    <div v-if="interactive" class="mermaid-tools" aria-label="图表缩放工具">
      <button type="button" aria-label="缩小图表" @click="zoom(scale / 1.25)">−</button>
      <label><input aria-label="图表缩放百分比" type="number" min="0.1" max="100000" step="10" :value="percent" @change="zoom(Number(($event.target as HTMLInputElement).value) / 100)">%</label>
      <button type="button" aria-label="放大图表" @click="zoom(scale * 1.25)">+</button>
      <div class="mermaid-presets" role="group" aria-label="图表显示模式">
        <button type="button" aria-label="适应窗口" :aria-pressed="preferenceReady && mode === 'window'" @click="chooseMode('window')">适应窗口</button>
        <button type="button" aria-label="适应宽度" :aria-pressed="preferenceReady && mode === 'width'" @click="chooseMode('width')">适应宽度</button>
        <button type="button" aria-label="原始大小" :aria-pressed="preferenceReady && mode === 'original'" @click="chooseMode('original')">原始大小</button>
      </div>
      <span role="status">{{ storageNotice || (mode === 'free' ? '自由缩放 · ' : '') + '滚轮缩放 · 拖拽移动 · 方向键平移' }}</span>
    </div>
    <div ref="viewport" class="mermaid-viewport" :class="{ interactive, dragging }" :style="viewportStyle" :tabindex="interactive ? 0 : undefined" aria-label="流程图画布" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @lostpointercapture="up" @keydown="key" @dblclick="interactive && chooseMode('window')">
      <div ref="content" class="mermaid-content" :style="transform" v-html="scopedSvg"></div>
    </div>
  </div>
</template>
