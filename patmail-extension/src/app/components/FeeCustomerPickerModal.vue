<script setup lang="ts">
import { ref, watch } from 'vue'
import type { FeeCustomerItem } from '../../api/fee-search-types'
import { MessageType, type MessageBridge } from '../../shared/message'

export interface SelectedCustomerEntry {
  id: string
  name: string
}

const props = defineProps<{
  open: boolean
  title: string
  bridge?: MessageBridge
  selected: SelectedCustomerEntry[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [items: SelectedCustomerEntry[]]
}>()

const searchKey = ref('')
const loading = ref(false)
const errorMsg = ref('')
const candidates = ref<FeeCustomerItem[]>([])
const draft = ref<SelectedCustomerEntry[]>([])
const activeSelectedId = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let requestSeq = 0

async function runSearch(): Promise<void> {
  if (!props.bridge) {
    errorMsg.value = '尚未连接 EASY，无法读取客户列表。'
    candidates.value = []
    return
  }
  const seq = ++requestSeq
  loading.value = true
  errorMsg.value = ''
  try {
    const resp = await props.bridge.request({
      type: MessageType.SearchFeeCustomers,
      payload: { searchKey: searchKey.value.trim() }
    })
    if (seq !== requestSeq) return
    if (resp.type === MessageType.SearchFeeCustomersResult && resp.payload.ok) {
      candidates.value = resp.payload.data
    } else if (resp.type === MessageType.SearchFeeCustomersResult && !resp.payload.ok) {
      errorMsg.value = resp.payload.error.message || '读取客户列表失败'
      candidates.value = []
    } else if (resp.type === MessageType.Error) {
      errorMsg.value = resp.payload.message || '读取客户列表失败'
      candidates.value = []
    }
  } catch (e) {
    if (seq !== requestSeq) return
    errorMsg.value = e instanceof Error ? e.message : '读取客户列表失败'
    candidates.value = []
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(
  () => props.open,
  opened => {
    if (opened) {
      draft.value = props.selected.map(item => ({ ...item }))
      activeSelectedId.value = ''
      searchKey.value = ''
      void runSearch()
    } else if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
  },
  { immediate: true }
)

function onInputSearch(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void runSearch()
  }, 260)
}

function isPicked(id: string): boolean {
  return draft.value.some(item => item.id === id)
}

function toggleCandidate(item: FeeCustomerItem): void {
  const idx = draft.value.findIndex(entry => entry.id === item.id)
  if (idx >= 0) {
    draft.value.splice(idx, 1)
  } else {
    draft.value.push({ id: item.id, name: item.name })
  }
}

function addCandidate(item: FeeCustomerItem): void {
  if (!isPicked(item.id)) {
    draft.value.push({ id: item.id, name: item.name })
  }
}

function removePicked(id: string): void {
  draft.value = draft.value.filter(item => item.id !== id)
  if (activeSelectedId.value === id) activeSelectedId.value = ''
}

function moveActive(delta: -1 | 1): void {
  const idx = draft.value.findIndex(item => item.id === activeSelectedId.value)
  if (idx < 0) return
  const nextIdx = idx + delta
  if (nextIdx < 0 || nextIdx >= draft.value.length) return
  const copy = [...draft.value]
  const [moved] = copy.splice(idx, 1)
  copy.splice(nextIdx, 0, moved)
  draft.value = copy
}

function clearPicked(): void {
  draft.value = []
  activeSelectedId.value = ''
}

function confirmSelection(): void {
  emit('confirm', draft.value.map(item => ({ ...item })))
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ihg-backdrop" role="dialog" aria-modal="true" :aria-label="title" @click.self="emit('close')" @keydown.escape="emit('close')">
      <div class="ihg-modal">
        <header class="ihg-head">
          <strong>{{ title }}</strong>
          <button type="button" class="ihg-close" v-hint="'关闭'" aria-label="关闭" @click="emit('close')">×</button>
        </header>

        <div class="ihg-search-bar">
          <input
            v-model="searchKey"
            type="text"
            placeholder="输入客户名称关键词查询（点击或双击加入右侧结果列表）"
            @input="onInputSearch"
            @keydown.enter.prevent="runSearch"
          />
          <button type="button" class="solid tiny" :disabled="loading" @click="runSearch">
            {{ loading ? '查询中…' : '查询' }}
          </button>
        </div>

        <p v-if="errorMsg" class="ihg-error" role="alert">{{ errorMsg }}</p>

        <div class="ihg-body">
          <!-- 左侧候选表格（对齐 IhgSelect #divData） -->
          <div class="ihg-left">
            <table class="ihg-table">
              <thead>
                <tr>
                  <th class="col-check"></th>
                  <th>客户名称</th>
                  <th class="col-tel">联系电话</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading && !candidates.length">
                  <td colspan="3" class="ihg-empty">正在向原网站读取客户列表…</td>
                </tr>
                <tr v-else-if="!candidates.length">
                  <td colspan="3" class="ihg-empty">暂无匹配的客户</td>
                </tr>
                <tr
                  v-for="item in candidates"
                  :key="item.id"
                  :class="{ 'is-picked': isPicked(item.id) }"
                  @click="toggleCandidate(item)"
                  @dblclick="addCandidate(item)"
                >
                  <td class="col-check">
                    <input type="checkbox" :checked="isPicked(item.id)" @click.stop="toggleCandidate(item)" />
                  </td>
                  <td class="col-name">
                    <span class="col-name-clip" v-hint.clip="item.name">{{ item.name }}</span>
                  </td>
                  <td class="col-tel">{{ item.tel || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- 右侧结果列表（对齐 IhgSelect #tbresult） -->
          <div class="ihg-right">
            <div class="ihg-right-head">
              <span>结果列表（{{ draft.length }}）</span>
              <button v-if="draft.length" type="button" class="ihg-clear-btn" v-hint="'清空已选客户'" @click="clearPicked">清空</button>
            </div>
            <ul class="ihg-picked-list">
              <li v-if="!draft.length" class="ihg-empty">尚未选择客户</li>
              <li
                v-for="entry in draft"
                :key="entry.id"
                :class="{ 'is-active': activeSelectedId === entry.id }"
                v-hint.clip="entry.name"
                @click="activeSelectedId = entry.id"
                @dblclick="removePicked(entry.id)"
              >
                <span class="picked-name" v-hint.clip="entry.name">{{ entry.name }}</span>
                <button
                  type="button"
                  class="picked-del"
                  v-hint="'移除该客户'"
                  aria-label="移除"
                  @click.stop="removePicked(entry.id)"
                >
                  ×
                </button>
              </li>
            </ul>
          </div>

          <!-- 上下排序按钮（对齐 IhgSelect Up/Down） -->
          <div class="ihg-order-btns">
            <button
              type="button"
              class="ghost tiny"
              v-hint="'向上移动'"
              aria-label="上移"
              :disabled="!activeSelectedId"
              @click="moveActive(-1)"
            >
              ↑
            </button>
            <button
              type="button"
              class="ghost tiny"
              v-hint="'向下移动'"
              aria-label="下移"
              :disabled="!activeSelectedId"
              @click="moveActive(1)"
            >
              ↓
            </button>
          </div>
        </div>

        <footer class="ihg-foot">
          <button type="button" class="ghost" @click="emit('close')">取消</button>
          <button type="button" class="solid" @click="confirmSelection">确定</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ihg-backdrop {
  position: fixed;
  inset: 0;
  z-index: 120;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(36, 48, 86, 0.36);
}
.ihg-modal {
  width: min(760px, 94vw);
  max-height: 86vh;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid #f3d7e5;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 20px 50px rgba(77, 43, 88, 0.22);
  color: var(--text, #243056);
}
.ihg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid #f6e5ee;
  font-size: 14px;
}
.ihg-close {
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: #fff0f6;
  color: #e44586;
  font-size: 18px;
  line-height: 1;
}
.ihg-search-bar {
  display: flex;
  gap: 8px;
  align-items: center;
}
.ihg-search-bar input {
  flex: 1;
  min-width: 0;
  height: 32px;
  padding: 0 10px;
  border: 1px solid #eadff0;
  border-radius: 8px;
  font-size: 12px;
}
.ihg-error {
  margin: 0;
  color: #e11d48;
  font-size: 12px;
}
.ihg-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px 34px;
  gap: 8px;
  height: 360px;
  min-height: 0;
}
.ihg-left,
.ihg-right {
  border: 1px solid #f0e1eb;
  border-radius: 10px;
  overflow: auto;
  min-height: 0;
  background: #fff;
}
.ihg-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  table-layout: fixed;
}
.col-name-clip {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ihg-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fff6fa;
  color: #8a7290;
  font-weight: 600;
  text-align: left;
  padding: 7px 8px;
  border-bottom: 1px solid #f0e1eb;
}
.ihg-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f8eef4;
  cursor: pointer;
}
.ihg-table tbody tr:hover {
  background: #fff8fb;
}
.ihg-table tbody tr.is-picked {
  background: #ffeef6;
  color: #c43b78;
}
.ihg-table .col-check {
  width: 28px;
  text-align: center;
}
.ihg-table .col-check input[type="checkbox"] {
  width: 15px;
  height: 15px;
  margin: 0;
  vertical-align: middle;
}
.ihg-table .col-tel {
  width: 110px;
  white-space: nowrap;
  color: #8a7290;
}
.ihg-right {
  display: flex;
  flex-direction: column;
}
.ihg-right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: #fff6fa;
  border-bottom: 1px solid #f0e1eb;
  font-size: 12px;
  font-weight: 600;
  color: #8a7290;
}
.ihg-clear-btn {
  border: 0;
  background: transparent;
  color: #e44586;
  font-size: 11px;
  padding: 0 4px;
}
.ihg-picked-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.ihg-picked-list li {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.ihg-picked-list li:hover {
  background: #fff6fa;
}
.ihg-picked-list li.is-active {
  background: #ffe4ef;
  color: #c43b78;
}
.picked-name {
  flex: 1;
  min-width: 0;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.picked-del {
  border: 0;
  background: transparent;
  color: #b48ea3;
  font-size: 14px;
  line-height: 1;
  padding: 0 4px;
}
.picked-del:hover {
  color: #e11d48;
}
.ihg-order-btns {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
}
.ihg-order-btns button {
  padding: 0;
  width: 30px;
  height: 30px;
}
.ihg-empty {
  text-align: center;
  color: #9aa0b4;
  padding: 20px 8px;
}
.ihg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
  border-top: 1px solid #f6e5ee;
}
</style>
