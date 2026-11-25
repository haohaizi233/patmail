<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { buildOptionTree, searchOptionTree, toggleTreeSelection, type TreeOption } from '../../query/option-tree'
import { menuBoxStyle, placeMenu, treeMenuWidth } from './theme-select'
import TreeOptionNode from './TreeOptionNode.vue'

const props = withDefaults(defineProps<{
  modelValue?: string
  options: TreeOption[]
  disabled?: boolean
  // eslint-disable-next-line vue/require-default-prop -- 存量豁免：optional prop 由父组件保证传入
  status?: 'loading' | 'ready' | 'empty' | 'partial' | 'invalid'
  // eslint-disable-next-line vue/require-default-prop -- 存量豁免：optional prop 由父组件保证传入
  emptyText?: string
  /** 多选（checkbox，带「全选」）或单选（radio，选中即收起）。对应原站 TreeUser 的 SelectType。 */
  leavesOnly?: boolean
  hideParentRadio?: boolean
  multiple?: boolean
}>(), { modelValue: '', disabled: false, hideParentRadio: false, multiple: true })
const emit = defineEmits<{ 'update:modelValue': [value: string]; open: []; retry: [] }>()

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const menu = ref<HTMLElement | null>(null)
const searchBox = ref<HTMLInputElement | null>(null)
const opened = ref(false)
const portal = ref<HTMLElement | string>('body')
const menuStyle = ref<Record<string, string>>({})
const draft = ref('')
const applied = ref('')
const manualExpanded = ref<Record<string, boolean>>({})
const owner = Symbol('tree-option-select')
const radioName = `tree-option-${Math.random().toString(36).slice(2, 9)}`
const tree = computed(() => buildOptionTree(props.options.filter(item => item.value)))
const selected = computed(() => props.modelValue.split(',').map(item => item.trim()).filter(Boolean))
const found = computed(() => applied.value.trim() ? searchOptionTree(tree.value, applied.value) : null)
const expanded = computed(() => found.value ? { ...manualExpanded.value, ...Object.fromEntries([...found.value.expand].map(id => [id, true])) } : manualExpanded.value)
const state = computed(() => props.status ?? (tree.value.roots.length ? 'ready' : 'empty'))
const available = computed(() => (state.value === 'ready' || state.value === 'partial') && tree.value.roots.length > 0)
const unresolved = computed(() => selected.value.filter(id => !available.value || !tree.value.byId.has(id)))
const statusText = computed(() => state.value === 'loading' ? '正在读取选项…' : state.value === 'invalid' ? '选项读取失败' : state.value === 'empty' ? props.emptyText || '当前账号未配置此字段选项' : '当前条件下没有可选项')
watch(available, value => { if (!value) close() })
const summary = computed(() => {
  const names = selected.value.map(id => tree.value.byId.get(id)?.label).filter((item): item is string => Boolean(item))
  if (names.length === 0) return selected.value.length ? `已选 ${selected.value.length} 项` : '不限'
  if (names.length <= 2) return names.join('、')
  return `${names.slice(0, 2).join('、')} 等 ${names.length} 项`
})

function resolvePortal(): HTMLElement | string {
  const node = root.value?.getRootNode()
  if (node instanceof ShadowRoot) {
    let holder = node.querySelector<HTMLElement>('#theme-select-portal')
    if (!holder) {
      holder = document.createElement('div')
      holder.id = 'theme-select-portal'
      node.appendChild(holder)
    }
    return holder
  }
  return 'body'
}

function updatePosition(): void {
  const el = trigger.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const placed = placeMenu(
    { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width },
    { width: window.innerWidth, height: window.innerHeight },
    320,
    Math.min(treeMenuWidth(props.options), 460)
  )
  menuStyle.value = menuBoxStyle(placed)
}

function expandSelectedAncestors(): void {
  if (selected.value.length === 0) return
  const parentOf = new Map<string, string>()
  for (const node of tree.value.byId.values()) {
    for (const childId of node.childIds) parentOf.set(childId, node.value)
  }
  const next = { ...manualExpanded.value }
  for (const id of selected.value) {
    const seen = new Set<string>([id])
    let parent = parentOf.get(id)
    while (parent && !seen.has(parent)) {
      seen.add(parent)
      next[parent] = true
      parent = parentOf.get(parent)
    }
  }
  manualExpanded.value = next
}

function show(): void {
  if (props.disabled || opened.value || !available.value) return
  portal.value = resolvePortal()
  expandSelectedAncestors()
  opened.value = true
  emit('open')
  window.dispatchEvent(new CustomEvent('theme-select-open', { detail: owner }))
  void nextTick(() => {
    updatePosition()
    searchBox.value?.focus()
    menu.value?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.scrollIntoView?.({ block: 'nearest' })
  })
}

function close(): void {
  opened.value = false
}

function search(): void {
  applied.value = draft.value.trim()
}

function clearSelection(): void {
  emit('update:modelValue', '')
}

/** 全选只勾当前可见的项：搜索时就是命中的那批，没搜索就是整棵树。 */
function selectAll(): void {
  if (!props.multiple) return
  const next = new Set(selected.value)
  const ids = found.value ? found.value.visible : tree.value.byId.keys()
  for (const id of ids) {
    const node = tree.value.byId.get(id)
    if (node && node.selectable !== false && (!found.value || node.label.toLowerCase().includes(applied.value.trim().toLowerCase()))) next.add(id)
  }
  emit('update:modelValue', [...next].join(','))
}

function confirm(): void {
  close()
  trigger.value?.focus()
}

function toggle(id: string): void {
  if (!props.multiple) {
    if (tree.value.byId.get(id)?.selectable === false || (props.leavesOnly && tree.value.byId.get(id)?.childIds.length)) return
    emit('update:modelValue', id)
    close()
    trigger.value?.focus()
    return
  }
  emit('update:modelValue', toggleTreeSelection(tree.value, selected.value, id).join(','))
}

function expand(id: string): void {
  manualExpanded.value = { ...manualExpanded.value, [id]: !manualExpanded.value[id] }
}

function onPointer(event: Event): void {
  if (!opened.value) return
  const path = event.composedPath()
  if ((root.value && path.includes(root.value)) || (menu.value && path.includes(menu.value))) return
  close()
}

function onAnother(event: Event): void {
  if ((event as CustomEvent).detail !== owner) close()
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && opened.value) {
    event.preventDefault()
    close()
    trigger.value?.focus()
  }
}

watch(opened, (value) => {
  if (value) {
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('theme-select-open', onAnother)
    return
  }
  document.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('theme-select-open', onAnother)
})

onBeforeUnmount(() => {
  opened.value = false
  document.removeEventListener('pointerdown', onPointer, true)
  window.removeEventListener('resize', updatePosition)
  window.removeEventListener('scroll', updatePosition, true)
  window.removeEventListener('theme-select-open', onAnother)
})
</script>

<template>
  <span ref="root" class="theme-select" @keydown="onKey">
    <span v-if="!available" class="theme-select-status" role="status" v-hint.clip="statusText">{{ statusText }} <button v-if="state === 'invalid'" type="button" @click="emit('retry')">重试</button></span>
    <button v-else ref="trigger" type="button" class="theme-select-trigger" :class="{ 'is-open': opened }" :disabled="disabled" aria-haspopup="tree" :aria-expanded="opened" @click="opened ? close() : show()">
      <span class="theme-select-value" :class="{ 'is-placeholder': summary === '不限' }" v-hint.clip="summary">{{ summary }}</span>
      <svg class="theme-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4.2 6 8l4-3.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
    <span v-if="unresolved.length" class="theme-select-unresolved" role="alert">原选项当前不可用：{{ unresolved.join('、') }} <button type="button" @click="emit('update:modelValue', selected.filter(id => !unresolved.includes(id)).join(','))">清除原选项</button></span>
    <Teleport :to="portal">
      <div v-if="opened && available" ref="menu" class="theme-select-menu theme-tree-menu" role="tree" :style="menuStyle">
        <div class="theme-tree-search">
          <input ref="searchBox" v-model="draft" type="search" placeholder="搜索" aria-label="搜索" @keydown.enter.prevent="search" />
          <button type="button" class="theme-tree-query" @click="search">查询</button>
        </div>
        <div class="theme-tree-list">
          <TreeOptionNode v-for="id in tree.roots" :key="id" :node-id="id" :by-id="tree.byId" :selected="selected" :expanded="expanded" :visible="found ? found.visible : null" :trail="[]" :multiple="multiple" :leaves-only="leavesOnly" :hide-parent-radio="hideParentRadio" :input-name="radioName" @toggle="toggle" @expand="expand" />
          <p v-if="tree.roots.length === 0" class="theme-select-empty">没有可选的选项。原站没有返回这个下拉的数据。</p>
          <p v-else-if="found && found.visible.size === 0" class="theme-select-empty">没有匹配的选项。</p>
        </div>
        <div class="theme-tree-actions">
          <button type="button" class="theme-tree-clear" @click="clearSelection">清除</button>
          <button type="button" class="theme-tree-confirm" @click="confirm">确定</button>
          <button v-if="multiple" type="button" class="theme-tree-all" @click="selectAll">全选</button>
        </div>
      </div>
    </Teleport>
  </span>
</template>
