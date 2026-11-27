<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import TreeOptionSelect from '../../../shell/components/TreeOptionSelect.vue'
import WDatePicker from '../../../shell/components/WDatePicker.vue'
import type { NoticeOptionItem } from '../../../api/notice-types'
import type { TreeOption } from '../../../query/option-tree'

export interface NoticeDetailFormModel {
  oaId: string
  importId: string
  ctrlProc: string
  caseId: string
  caseVolume: string
  chargeDept: string
  picName: string
  oaCode: string
  oaDate: string
  oaTypeId: string
  oaTypeName: string
  oaDesc: string
  intDueDate: string
  cusDueDate: string
  legalDueDate: string
  examiner: string
  examinerTel: string
  examinerDept: string
  issueNo: string
  issueDate: string
  certificateNo: string
  customerName: string
  remark: string
}

export type NoticeDetailEditableKey = 'oaDate' | 'oaTypeId' | 'issueNo' | 'issueDate' | 'certificateNo'

const props = withDefaults(defineProps<{
  open: boolean
  editable?: boolean
  loading?: boolean
  saving?: boolean
  message?: string
  messageTone?: 'ok' | 'error'
  form: NoticeDetailFormModel
  fees?: Record<string, unknown>[]
  hebo?: Record<string, unknown>[]
  duibi?: Record<string, unknown>[]
  fileTypeOptions?: TreeOption[]
  caseSearchKeyword?: string
  caseSearchOptions?: NoticeOptionItem[]
  caseSearching?: boolean
  caseSearchSearched?: boolean
}>(), {
  editable: false,
  loading: false,
  saving: false,
  message: '',
  messageTone: 'ok',
  fees: () => [],
  hebo: () => [],
  duibi: () => [],
  fileTypeOptions: () => [],
  caseSearchKeyword: '',
  caseSearchOptions: () => [],
  caseSearching: false,
  caseSearchSearched: false
})

const emit = defineEmits<{
  close: []
  save: []
  'search-case': []
  'pick-case': [opt: NoticeOptionItem]
  'update:caseSearchKeyword': [keyword: string]
  'update-field': [payload: { key: NoticeDetailEditableKey; value: string }]
}>()

const activeTab = ref<'charge' | 'fee' | 'hebo' | 'duibi'>('charge')
const pickerRef = ref<HTMLElement | null>(null)
const dropdownOpen = ref(false)
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function clearDebounce(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

function txt(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v === 'boolean') return v ? '是' : '否'
  return ''
}

function displayVal(v: string): string {
  return v.trim() || '—'
}

function handleCaseInput(event: Event): void {
  const val = (event.target as HTMLInputElement).value
  emit('update:caseSearchKeyword', val)
  clearDebounce()
  if (!val.trim()) {
    dropdownOpen.value = false
    return
  }
  dropdownOpen.value = true
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    emit('search-case')
  }, 350)
}

function handleSearchClick(): void {
  clearDebounce()
  dropdownOpen.value = true
  emit('search-case')
}

function handlePickCase(opt: NoticeOptionItem): void {
  clearDebounce()
  dropdownOpen.value = false
  emit('pick-case', opt)
}

function updateField(key: NoticeDetailEditableKey, value: string): void {
  emit('update-field', { key, value })
}

function handleDocMouseDown(event: MouseEvent): void {
  if (!dropdownOpen.value || !pickerRef.value) return
  if (!pickerRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

function handleKeyDown(event: KeyboardEvent): void {
  if (!props.open) return
  if (event.key === 'Escape') {
    if (dropdownOpen.value) {
      dropdownOpen.value = false
      event.stopPropagation()
    } else {
      emit('close')
    }
  }
}

watch(() => props.open, isOpen => {
  if (isOpen) {
    activeTab.value = 'charge'
    dropdownOpen.value = false
    document.addEventListener('mousedown', handleDocMouseDown)
    document.addEventListener('keydown', handleKeyDown)
  } else {
    clearDebounce()
    dropdownOpen.value = false
    document.removeEventListener('mousedown', handleDocMouseDown)
    document.removeEventListener('keydown', handleKeyDown)
  }
}, { immediate: true })

watch(() => props.caseSearchOptions, list => {
  if (list.length > 0) dropdownOpen.value = true
})

onBeforeUnmount(() => {
  clearDebounce()
  document.removeEventListener('mousedown', handleDocMouseDown)
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<template>
  <div v-if="open" class="mask app-dialog" @click.self="emit('close')">
    <div class="dialog with-table nd-dialog" role="dialog" aria-modal="true" aria-labelledby="nd-modal-title">
      <header class="nd-header">
        <div class="nd-title-wrap">
          <h3 id="nd-modal-title">来文详细信息</h3>
          <span class="nd-mode-badge" :class="editable ? 'is-editable' : 'is-readonly'">
            {{ editable ? '可编辑' : '只读查看' }}
          </span>
        </div>
        <button type="button" class="nd-close" aria-label="关闭" @click="emit('close')">×</button>
      </header>

      <div class="nd-tabs-bar" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'charge'"
          class="nd-tab"
          :class="{ on: activeTab === 'charge' }"
          @click="activeTab = 'charge'"
        >
          处理信息
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'fee'"
          class="nd-tab"
          :class="{ on: activeTab === 'fee' }"
          @click="activeTab = 'fee'"
        >
          官费信息
          <span class="nd-tab-count" :class="{ 'has-items': fees.length > 0 }">{{ fees.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'hebo'"
          class="nd-tab"
          :class="{ on: activeTab === 'hebo' }"
          @click="activeTab = 'hebo'"
        >
          核驳信息
          <span class="nd-tab-count" :class="{ 'has-items': hebo.length > 0 }">{{ hebo.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="activeTab === 'duibi'"
          class="nd-tab"
          :class="{ on: activeTab === 'duibi' }"
          @click="activeTab = 'duibi'"
        >
          对比文件
          <span class="nd-tab-count" :class="{ 'has-items': duibi.length > 0 }">{{ duibi.length }}</span>
        </button>
      </div>

      <div v-if="loading" class="nd-loading-banner">
        <span class="nd-spinner" aria-hidden="true" />
        <span>正在读取原站来文详情与关联信息…</span>
      </div>

      <div class="nd-body">
        <div v-if="activeTab === 'charge'" class="nd-charge-layout">
          <!-- 区块 1：来文概览（核心只读信息） -->
          <section class="nd-card nd-card-overview">
            <div class="nd-card-head">
              <h4>来文概览</h4>
              <span class="nd-card-tag">原站同步 · 只读</span>
            </div>
            <div class="nd-kv-grid">
              <div class="nd-kv nd-kv-span2">
                <span class="nd-kv-label">客户名称</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.customerName.trim() }" v-hint.clip="form.customerName.trim()">{{ displayVal(form.customerName) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">来文编号</span>
                <span class="nd-kv-value nd-mono" :class="{ 'is-empty': !form.oaCode.trim() }" v-hint.clip="form.oaCode.trim()">{{ displayVal(form.oaCode) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">处理事项</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.ctrlProc.trim() }" v-hint.clip="form.ctrlProc.trim()">{{ displayVal(form.ctrlProc) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">承办部门</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.chargeDept.trim() }" v-hint.clip="form.chargeDept.trim()">{{ displayVal(form.chargeDept) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">处理人</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.picName.trim() }" v-hint.clip="form.picName.trim()">{{ displayVal(form.picName) }}</span>
              </div>
              <div class="nd-kv nd-kv-full">
                <span class="nd-kv-label">来文备注</span>
                <span class="nd-kv-value nd-kv-multiline" :class="{ 'is-empty': !form.oaDesc.trim() }">{{ displayVal(form.oaDesc) }}</span>
              </div>
            </div>
          </section>

          <!-- 区块 2：关联案件与来文信息（可编辑核心区） -->
          <section class="nd-card nd-card-edit">
            <div class="nd-card-head">
              <h4>关联案件与来文信息</h4>
              <span class="nd-card-tag" :class="{ 'is-accent': editable }">
                {{ editable ? '以下 6 项可编辑并保存至原站' : '已导入记录仅支持查看' }}
              </span>
            </div>
            <div class="nd-form-grid">
              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">我方文号</span>
                  <span v-if="form.caseVolume.trim()" class="nd-picked-pill" v-hint.clip="`当前关联：${form.caseVolume}`">
                    已关联：{{ form.caseVolume }}
                  </span>
                  <span v-else class="nd-unpicked-pill">未关联案件</span>
                </div>
                <div v-if="editable" ref="pickerRef" class="nd-case-picker">
                  <div class="nd-case-input-row">
                    <input
                      :value="caseSearchKeyword"
                      type="text"
                      class="nd-input"
                      :placeholder="form.caseVolume || '输入我方文号关键词检索'"
                      @input="handleCaseInput"
                      @focus="caseSearchOptions.length > 0 && (dropdownOpen = true)"
                      @keydown.enter.prevent="handleSearchClick"
                    />
                    <button
                      type="button"
                      class="nd-search-btn"
                      :disabled="caseSearching"
                      @click="handleSearchClick"
                    >
                      {{ caseSearching ? '检索中…' : '查找案件' }}
                    </button>
                  </div>
                  <div v-if="dropdownOpen && (caseSearchOptions.length > 0 || caseSearchSearched || caseSearching)" class="nd-case-dropdown">
                    <div v-if="caseSearching && caseSearchOptions.length === 0" class="nd-case-empty">
                      正在检索匹配案件…
                    </div>
                    <template v-else-if="caseSearchOptions.length > 0">
                      <button
                        v-for="opt in caseSearchOptions"
                        :key="opt.value"
                        type="button"
                        class="nd-case-option"
                        :class="{ 'is-selected': opt.value === form.caseId }"
                        @click="handlePickCase(opt)"
                      >
                        <span>{{ opt.label }}</span>
                        <small v-if="opt.value === form.caseId">当前</small>
                      </button>
                    </template>
                    <div v-else class="nd-case-empty">
                      未找到匹配案件，请换个关键词重试
                    </div>
                  </div>
                </div>
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.caseVolume.trim() }" v-hint.clip="form.caseVolume.trim()">
                  {{ displayVal(form.caseVolume) }}
                </div>
              </div>

              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">官方发文日</span>
                </div>
                <WDatePicker
                  v-if="editable"
                  :model-value="form.oaDate"
                  placeholder="选择发文日"
                  @update:model-value="updateField('oaDate', $event)"
                />
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.oaDate.trim() }" v-hint.clip="form.oaDate.trim()">
                  {{ displayVal(form.oaDate) }}
                </div>
              </div>

              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">来文名称</span>
                </div>
                <TreeOptionSelect
                  v-if="editable && fileTypeOptions.length > 0 && !(loading && !form.oaTypeId)"
                  :model-value="form.oaTypeId"
                  :options="fileTypeOptions"
                  :multiple="false"
                  :leaves-only="true"
                  :hide-parent-radio="true"
                  empty-text="暂无来文类型"
                  @update:model-value="updateField('oaTypeId', $event)"
                />
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.oaTypeName.trim() && !loading }" v-hint.clip="form.oaTypeName.trim()">
                  {{ form.oaTypeName.trim() || (loading ? '正在读取来文类型…' : '—') }}
                </div>
              </div>

              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">公告号</span>
                </div>
                <input
                  v-if="editable"
                  :value="form.issueNo"
                  type="text"
                  class="nd-input"
                  placeholder="如有授权/公告信息可填写"
                  @input="updateField('issueNo', ($event.target as HTMLInputElement).value)"
                />
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.issueNo.trim() }" v-hint.clip="form.issueNo.trim()">
                  {{ displayVal(form.issueNo) }}
                </div>
              </div>

              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">公告日</span>
                </div>
                <WDatePicker
                  v-if="editable"
                  :model-value="form.issueDate"
                  placeholder="选择公告日"
                  @update:model-value="updateField('issueDate', $event)"
                />
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.issueDate.trim() }" v-hint.clip="form.issueDate.trim()">
                  {{ displayVal(form.issueDate) }}
                </div>
              </div>

              <div class="nd-field">
                <div class="nd-field-head">
                  <span class="nd-field-label">证书号</span>
                </div>
                <input
                  v-if="editable"
                  :value="form.certificateNo"
                  type="text"
                  class="nd-input"
                  placeholder="如有证书号信息可填写"
                  @input="updateField('certificateNo', ($event.target as HTMLInputElement).value)"
                />
                <div v-else class="nd-readonly-box" :class="{ 'is-empty': !form.certificateNo.trim() }" v-hint.clip="form.certificateNo.trim()">
                  {{ displayVal(form.certificateNo) }}
                </div>
              </div>
            </div>
          </section>

          <!-- 区块 3：期限与审查信息（紧凑只读网格） -->
          <section class="nd-card nd-card-meta">
            <div class="nd-card-head">
              <h4>期限与审查信息</h4>
              <span class="nd-card-tag">只读</span>
            </div>
            <div class="nd-kv-grid">
              <div class="nd-kv">
                <span class="nd-kv-label">内部期限</span>
                <span class="nd-kv-value nd-mono" :class="{ 'is-empty': !form.intDueDate.trim() }" v-hint.clip="form.intDueDate.trim()">{{ displayVal(form.intDueDate) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">客户期限</span>
                <span class="nd-kv-value nd-mono" :class="{ 'is-empty': !form.cusDueDate.trim() }" v-hint.clip="form.cusDueDate.trim()">{{ displayVal(form.cusDueDate) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">官方期限</span>
                <span class="nd-kv-value nd-mono" :class="{ 'is-empty': !form.legalDueDate.trim() }" v-hint.clip="form.legalDueDate.trim()">{{ displayVal(form.legalDueDate) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">审查员</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.examiner.trim() }" v-hint.clip="form.examiner.trim()">{{ displayVal(form.examiner) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">审查员电话</span>
                <span class="nd-kv-value nd-mono" :class="{ 'is-empty': !form.examinerTel.trim() }" v-hint.clip="form.examinerTel.trim()">{{ displayVal(form.examinerTel) }}</span>
              </div>
              <div class="nd-kv">
                <span class="nd-kv-label">审查部门</span>
                <span class="nd-kv-value" :class="{ 'is-empty': !form.examinerDept.trim() }" v-hint.clip="form.examinerDept.trim()">{{ displayVal(form.examinerDept) }}</span>
              </div>
            </div>
          </section>
        </div>

        <div v-else-if="activeTab === 'fee'" class="nd-table-box">
          <table class="nd-table">
            <thead>
              <tr>
                <th style="width: 64px">序号</th>
                <th>费用类型</th>
                <th>费用子类</th>
                <th style="width: 110px">费用</th>
                <th style="width: 120px">费用期限</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="fees.length === 0">
                <td colspan="6" class="nd-table-empty">暂无官费信息</td>
              </tr>
              <tr v-for="(item, i) in fees" :key="txt(item.oa_fee_id) || i">
                <td>{{ txt(item.sn) || i + 1 }}</td>
                <td>{{ txt(item.fee_type) || '—' }}</td>
                <td>{{ txt(item.fee_sub_type) || '—' }}</td>
                <td class="nd-mono">{{ txt(item.amount) || '—' }}</td>
                <td class="nd-mono">{{ txt(item.legal_due_date) || '—' }}</td>
                <td>{{ txt(item.description) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="activeTab === 'hebo'" class="nd-hebo-layout">
          <div class="nd-table-box">
            <table class="nd-table">
              <thead>
                <tr>
                  <th>权利要求项</th>
                  <th>引用法条</th>
                  <th>审查结果</th>
                  <th style="width: 120px">审查类型</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="hebo.length === 0">
                  <td colspan="4" class="nd-table-empty">暂无核驳明细</td>
                </tr>
                <tr v-for="(item, i) in hebo" :key="txt(item.reject_id) || i">
                  <td>{{ txt(item.reject_claims) || '—' }}</td>
                  <td>{{ txt(item.reject_law) || '—' }}</td>
                  <td>{{ txt(item.reject_file) || '—' }}</td>
                  <td>{{ txt(item.review_type) || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="nd-card nd-card-meta">
            <div class="nd-card-head">
              <h4>审查结论</h4>
              <span class="nd-card-tag">只读</span>
            </div>
            <p class="nd-conclusion-text" :class="{ 'is-empty': !form.remark.trim() }">
              {{ displayVal(form.remark) }}
            </p>
          </div>
        </div>

        <div v-else class="nd-table-box">
          <table class="nd-table">
            <thead>
              <tr>
                <th style="width: 120px">国别</th>
                <th>对比文件号</th>
                <th style="width: 140px">公开日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="duibi.length === 0">
                <td colspan="3" class="nd-table-empty">暂无对比文件</td>
              </tr>
              <tr v-for="(item, i) in duibi" :key="txt(item.oa_ids_id) || i">
                <td>{{ txt(item.country) || '—' }}</td>
                <td class="nd-mono">{{ txt(item.file_no) || '—' }}</td>
                <td class="nd-mono">{{ txt(item.pub_date) || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <footer class="nd-footer">
        <div class="nd-footer-status">
          <span v-if="message" class="nd-status-pill" :class="messageTone === 'error' ? 'is-error' : 'is-ok'">
            {{ message }}
          </span>
        </div>
        <div class="nd-footer-actions">
          <button type="button" class="ghost" @click="emit('close')">
            {{ editable ? '取消' : '关闭' }}
          </button>
          <button
            v-if="editable && activeTab === 'charge'"
            type="button"
            class="solid"
            :disabled="saving"
            @click="emit('save')"
          >
            {{ saving ? '保存中…' : '保存修改' }}
          </button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.nd-dialog {
  width: min(880px, calc(100vw - 36px));
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  padding: 20px 24px 18px;
  border-radius: 20px;
  border: 1px solid #f7d8e7;
  box-shadow: 0 20px 54px rgba(155, 48, 96, 0.16);
}

.nd-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f7e9f1;
}

.nd-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.nd-title-wrap h3 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
  color: var(--text);
}

.nd-mode-badge {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 700;
}

.nd-mode-badge.is-editable {
  background: #ffe8f2;
  color: #c82e6e;
  border: 1px solid #ffc7df;
}

.nd-mode-badge.is-readonly {
  background: #f3f5fa;
  color: #6b7691;
  border: 1px solid #e4e8f2;
}

.nd-close {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  background: #fff5fa;
  color: #9e5c7c;
  font-size: 20px;
  line-height: 30px;
  display: grid;
  place-items: center;
  transition: background 0.15s ease, color 0.15s ease;
}

.nd-close:hover {
  background: #ffe4ef;
  color: #ff4f93;
}

.nd-tabs-bar {
  flex: none;
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 4px;
  margin: 12px 0 10px;
  border-radius: 12px;
  background: #fdf4f8;
  border: 1px solid #f6dfeb;
  align-self: flex-start;
}

.nd-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #71596e;
  font-size: 13px;
  font-weight: 600;
  transition: background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
}

.nd-tab:hover:not(.on) {
  background: rgba(255, 255, 255, 0.72);
  color: #b82964;
}

.nd-tab.on {
  background: #ff4f93;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 79, 147, 0.28);
}

.nd-tab-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(141, 151, 176, 0.16);
  color: #6f7c98;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-variant-numeric: tabular-nums;
}

.nd-tab-count.has-items {
  background: #ffe1ee;
  color: #d62d72;
}

.nd-tab.on .nd-tab-count {
  background: rgba(255, 255, 255, 0.26);
  color: #fff;
}

.nd-loading-banner {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border-radius: 10px;
  background: #fff4f9;
  border: 1px solid #ffd8e9;
  color: #a83c6d;
  font-size: 12.5px;
  font-weight: 600;
}

.nd-spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #ffc6df;
  border-top-color: #ff4f93;
  animation: nd-spin 0.8s linear infinite;
}

@keyframes nd-spin {
  to {
    transform: rotate(360deg);
  }
}

.nd-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.nd-charge-layout,
.nd-hebo-layout {
  display: grid;
  gap: 12px;
}

.nd-card {
  border-radius: 14px;
  padding: 13px 16px;
}

.nd-card-overview {
  background: linear-gradient(180deg, #fff9fc 0%, #fff4f9 100%);
  border: 1px solid #f7d8e7;
}

.nd-card-edit {
  background: #fff;
  border: 1px solid #f0d7e6;
  box-shadow: 0 4px 16px rgba(255, 127, 176, 0.08);
}

.nd-card-meta {
  background: #faf8fc;
  border: 1px solid #ece4f2;
}

.nd-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.nd-card-head h4 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text);
}

.nd-card-tag {
  font-size: 11.5px;
  color: #8d97b0;
  font-weight: 600;
}

.nd-card-tag.is-accent {
  color: #d62d72;
}

.nd-kv-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px 18px;
}

.nd-kv {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.nd-kv-span2 {
  grid-column: span 2;
}

.nd-kv-full {
  grid-column: 1 / -1;
}

.nd-kv-label {
  font-size: 11.5px;
  font-weight: 600;
  color: #8c7b8e;
}

.nd-kv-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.45;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nd-kv-value.nd-kv-multiline {
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  font-weight: 500;
  color: #424d6b;
}

.nd-kv-value.is-empty {
  color: #c2b7c7;
  font-weight: 400;
}

.nd-mono {
  font-variant-numeric: tabular-nums;
}

.nd-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 18px;
  align-items: start;
}

.nd-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.nd-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 20px;
}

.nd-field-label {
  font-size: 12px;
  font-weight: 700;
  color: #5b6782;
}

.nd-picked-pill {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 8px;
  border-radius: 999px;
  background: #e9fbf2;
  border: 1px solid #bcebd3;
  color: #157a45;
  font-size: 11px;
  font-weight: 600;
}

.nd-unpicked-pill {
  padding: 1px 8px;
  border-radius: 999px;
  background: #fff2f6;
  border: 1px solid #ffd4e3;
  color: #c94679;
  font-size: 11px;
  font-weight: 600;
}

.nd-input,
.nd-readonly-box {
  width: 100%;
  min-width: 0;
  height: 36px;
  padding: 0 11px;
  border-radius: 10px;
  font-size: 13px;
}

.nd-dialog .nd-input {
  margin-top: 0;
  border: 1px solid #eadff0;
  background: #fff;
  color: var(--text);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.nd-dialog .nd-input:focus {
  border-color: #ff4f93;
  box-shadow: 0 0 0 3px #ffe4ef;
}

.nd-readonly-box {
  display: block;
  line-height: 34px;
  border: 1px solid #efe7f3;
  background: #faf7fb;
  color: #4d5975;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.nd-readonly-box.is-empty {
  color: #b8bece;
}

.nd-case-picker {
  position: relative;
  min-width: 0;
}

.nd-case-input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.nd-case-input-row .nd-input {
  flex: 1 1 auto;
}

.nd-search-btn {
  flex: none;
  height: 36px;
  padding: 0 13px;
  border-radius: 10px;
  border: 1px solid #f4bdd5;
  background: #fff5fa;
  color: #c43671;
  font-size: 12.5px;
  font-weight: 600;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.nd-search-btn:hover:not(:disabled) {
  background: #ffe6f1;
  border-color: #ff8dbd;
}

.nd-search-btn:disabled {
  opacity: 0.55;
  cursor: wait;
}

.nd-case-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 30;
  max-height: 180px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid #f2cfe0;
  border-radius: 12px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(155, 48, 96, 0.16);
  display: grid;
  gap: 2px;
}

.nd-case-option {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  font-size: 12.5px;
  color: var(--text);
}

.nd-case-option:hover,
.nd-case-option.is-selected {
  background: #fff0f6;
  color: #b82964;
}

.nd-case-option small {
  font-size: 11px;
  font-weight: 700;
  color: #ff4f93;
}

.nd-case-empty {
  padding: 12px 10px;
  text-align: center;
  font-size: 12.5px;
  color: #8d97b0;
}

/* 统一内部 DatePicker 与 TreeOptionSelect 高度和宽度，避免与其他输入错位 */
.nd-field :deep(.w-date-picker) {
  display: flex;
  width: 100%;
}

.nd-field :deep(.w-date-picker .Wdate) {
  width: 100%;
  height: 36px;
  margin-top: 0;
  padding: 0 28px 0 11px;
  border-color: #eadff0;
  font-size: 13px;
}

.nd-field :deep(.w-date-picker .Wdate:focus) {
  border-color: #ff4f93;
  box-shadow: 0 0 0 3px #ffe4ef;
}

.nd-field :deep(.theme-select) {
  display: block;
  width: 100%;
  min-width: 0;
}

.nd-field :deep(.theme-select-trigger) {
  width: 100%;
  min-width: 0;
  height: 36px;
  border-radius: 10px;
  border-color: #eadff0;
  font-size: 13px;
}

.nd-table-box {
  border: 1px solid #f2dce8;
  border-radius: 12px;
  overflow: auto;
  max-height: 48vh;
  background: #fff;
}

.nd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.nd-table th,
.nd-table td {
  padding: 9px 14px;
  text-align: left;
  border-bottom: 1px solid #f7edf3;
}

.nd-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #fff5fa;
  color: #8d5c78;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

.nd-table tbody tr:hover td {
  background: #fffafd;
}

.nd-table tbody tr:last-child td {
  border-bottom: 0;
}

.nd-table-empty {
  padding: 32px 16px !important;
  text-align: center !important;
  color: #9aa3b8;
  font-size: 13px;
}

.nd-conclusion-text {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text);
  white-space: pre-wrap;
  word-break: break-word;
}

.nd-conclusion-text.is-empty {
  color: #b8bece;
}

.nd-footer {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #f7e9f1;
}

.nd-footer-status {
  flex: 1 1 auto;
  min-width: 0;
}

.nd-status-pill {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 600;
}

.nd-status-pill.is-ok {
  background: #e9fbf2;
  color: #157a45;
  border: 1px solid #bcebd3;
}

.nd-status-pill.is-error {
  background: #fff0f4;
  color: #c4234e;
  border: 1px solid #ffc7d6;
}

.nd-footer-actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
}

@media (max-width: 720px) {
  .nd-dialog {
    padding: 16px;
  }
  .nd-kv-grid,
  .nd-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .nd-kv-span2 {
    grid-column: auto;
  }
}
</style>
