<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { menuBoxStyle, placeMenu } from './theme-select'

/** 复刻原站 My97 `WdatePicker` 的日期框：文本输入加日历弹层，起止用 min / max 互限，值是 `yyyy-MM-dd`。 */
const props = withDefaults(defineProps<{
  modelValue?: string
  min?: string
  max?: string
  /** 原站的 `dateFmt`。申请日(月日) 一格是 `MM-dd`，其余日期都是 `yyyy-MM-dd`。 */
  format?: 'yyyy-MM-dd' | 'MM-dd'
  disabled?: boolean
  id?: string
  placeholder?: string
}>(), { modelValue: '', disabled: false, id: undefined, placeholder: '', format: 'yyyy-MM-dd' })

const emit = defineEmits<{ 'update:modelValue': [value: string]; change: [value: string] }>()

const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_DAY = /^\d{2}-\d{2}$/
const WEEK_TITLES = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_TITLES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月']

function pad(part: number): string {
  return String(part).padStart(2, '0')
}

const today = new Date()

/** `MM-dd` 没有年份，补一个参照年再进日历；起止比较也落在同一年里。 */
function parseDate(text: string): Date | null {
  const value = (text ?? '').trim()
  if (props.format === 'MM-dd') {
    if (!MONTH_DAY.test(value)) return null
    const [month, day] = value.split('-').map(Number)
    const year = today.getFullYear()
    const date = new Date(year, month - 1, day)
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
    return date
  }
  if (!FULL_DATE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
  return date
}

function formatDate(date: Date): string {
  if (props.format === 'MM-dd') return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function dayStart(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

const opened = ref(false)
const root = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth())
const picked = ref<Date | null>(null)

const minDate = computed(() => parseDate(props.min ?? ''))
const maxDate = computed(() => parseDate(props.max ?? ''))
const shown = computed(() => props.modelValue ?? '')
const monthTitle = computed(() => `${MONTH_TITLES[viewMonth.value]} ${viewYear.value}`)

const weeks = computed(() => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const lead = first.getDay()
  const cells: Array<{ date: Date; other: boolean }> = []
  for (let index = 0; index < 42; index += 1) {
    const date = new Date(viewYear.value, viewMonth.value, 1 - lead + index)
    cells.push({ date, other: date.getMonth() !== viewMonth.value })
  }
  const rows: Array<Array<{ date: Date; other: boolean }>> = []
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7))
  return rows
})

function outOfRange(date: Date): boolean {
  const time = dayStart(date)
  if (minDate.value && time < dayStart(minDate.value)) return true
  if (maxDate.value && time > dayStart(maxDate.value)) return true
  return false
}

function cellClass(cell: { date: Date; other: boolean }): string[] {
  const classes: string[] = []
  if (cell.other) classes.push('is-other')
  if (cell.date.getDay() === 0 || cell.date.getDay() === 6) classes.push('is-weekend')
  if (dayStart(cell.date) === dayStart(today)) classes.push('is-today')
  const value = parseDate(props.modelValue ?? '')
  if (value && dayStart(cell.date) === dayStart(value)) classes.push('is-selected')
  if (outOfRange(cell.date)) classes.push('is-disabled')
  return classes
}

function updatePosition(): void {
  const el = input.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const placed = placeMenu(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    260,
    210
  )
  panelStyle.value = menuBoxStyle({ ...placed, width: 210 })
}

function show(): void {
  if (props.disabled || opened.value) return
  const current = parseDate(props.modelValue ?? '') ?? today
  viewYear.value = current.getFullYear()
  viewMonth.value = current.getMonth()
  picked.value = parseDate(props.modelValue ?? '')
  opened.value = true
  void nextTick(updatePosition)
}

function close(): void {
  opened.value = false
  input.value?.focus()
}

function commit(date: Date): void {
  const text = formatDate(date)
  emit('update:modelValue', text)
  emit('change', text)
  close()
}

function pick(cell: { date: Date; other: boolean }): void {
  if (outOfRange(cell.date)) return
  picked.value = cell.date
  // 原站 WdatePicker 默认 autoPickDate：点日期即回填关闭。
  commit(cell.date)
}

function confirm(): void {
  const date = picked.value ?? parseDate(props.modelValue ?? '') ?? today
  if (outOfRange(date)) return
  commit(date)
}

function clear(): void {
  picked.value = null
  emit('update:modelValue', '')
  emit('change', '')
  close()
}

function pickToday(): void {
  if (outOfRange(today)) {
    viewYear.value = today.getFullYear()
    viewMonth.value = today.getMonth()
    return
  }
  commit(today)
}

function shiftMonth(delta: number): void {
  const next = new Date(viewYear.value, viewMonth.value + delta, 1)
  viewYear.value = next.getFullYear()
  viewMonth.value = next.getMonth()
}

function shiftYear(delta: number): void {
  viewYear.value += delta
}

/** 手输只认 yyyy-MM-dd。写错格式时回到上一次的值，保证提交给接口的文本就是原站格式。 */
function onInput(event: Event): void {
  const text = (event.target as HTMLInputElement).value
  emit('update:modelValue', text)
}

function onBlur(): void {
  const text = (props.modelValue ?? '').trim()
  if (!text) {
    if (props.modelValue !== '') emit('update:modelValue', '')
    return
  }
  if (!parseDate(text)) {
    emit('update:modelValue', '')
    emit('change', '')
    return
  }
  const normalized = formatDate(parseDate(text) as Date)
  if (normalized !== props.modelValue) {
    emit('update:modelValue', normalized)
    emit('change', normalized)
  }
}

function onPointer(event: Event): void {
  if (!opened.value) return
  const path = event.composedPath()
  if ((root.value && path.includes(root.value)) || (panel.value && path.includes(panel.value))) return
  close()
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && opened.value) {
    event.preventDefault()
    close()
  }
}

watch(opened, value => {
  if (value) {
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return
  }
  document.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})

onBeforeUnmount(() => {
  opened.value = false
  document.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
})
</script>

<template>
  <span ref="root" class="w-date-picker">
    <input
      :id="id"
      ref="input"
      type="text"
      class="Wdate"
      autocomplete="off"
      :value="shown"
      :placeholder="placeholder"
      :disabled="disabled"
      @click="show"
      @input="onInput"
      @blur="onBlur"
      @keydown="onKey"
    />
    <Teleport to="body">
      <div v-if="opened" ref="panel" class="wdate-panel" :style="panelStyle" @mousedown.prevent>
        <div class="wdate-head">
          <a class="wdate-btn" title="上一年" @click="shiftYear(-1)">«</a>
          <a class="wdate-btn" title="上一月" @click="shiftMonth(-1)">‹</a>
          <span class="wdate-title">{{ monthTitle }}</span>
          <a class="wdate-btn" title="下一月" @click="shiftMonth(1)">›</a>
          <a class="wdate-btn" title="下一年" @click="shiftYear(1)">»</a>
        </div>
        <table class="wdate-grid">
          <thead>
            <tr><th v-for="title in WEEK_TITLES" :key="title">{{ title }}</th></tr>
          </thead>
          <tbody>
            <tr v-for="(week, row) in weeks" :key="row">
              <td v-for="cell in week" :key="cell.date.toISOString()">
                <a :class="cellClass(cell)" @click="pick(cell)">{{ cell.date.getDate() }}</a>
              </td>
            </tr>
          </tbody>
        </table>
        <div class="wdate-foot">
          <a @click="clear">清空</a>
          <a @click="pickToday">今天</a>
          <a @click="confirm">确定</a>
        </div>
      </div>
    </Teleport>
  </span>
</template>
