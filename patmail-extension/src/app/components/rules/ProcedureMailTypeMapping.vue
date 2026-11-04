<script setup lang="ts">
import { downloadXlsxRows } from '../../../customer/xlsx-table'
import { exportProcedureMappings } from '../../../customer/procedure-mapping-import'
import MappingPagination from './MappingPagination.vue'
import { useMappingRows } from './useMappingRows'
import { computed, ref, watch } from 'vue'
import { PROCEDURE_MAIL_MAPPINGS } from '../../../customer/procedure-mapping'
import { mailTypePath, matchMailTypePath } from '../../../customer/mail-type-path'
import { matchMailTypeByName } from '../../../customer/mail-flow'
import type { ProcedureMailTypeMapping } from '../../../mail/types'
import TreeOptionSelect from '../../../shell/components/TreeOptionSelect.vue'
import type { TreeOption } from '../../../query/option-tree'
import ThemeSelect from '../../../shell/components/ThemeSelect.vue'
import MailTypeTreeSelect from '../../../shell/components/MailTypeTreeSelect.vue'

const props = defineProps<{ mailTypes: Array<{ id: string; name: string; parentId: string }>; mappings: ProcedureMailTypeMapping[]; procedures: TreeOption[]; procedureLoading?: boolean; procedureNotice?: string; importing?: boolean }>()
const emit = defineEmits<{ save: [mapping: Omit<ProcedureMailTypeMapping, 'id'>]; remove: [id: string]; reload: []; reloadProcedures: []; import: [file: File] }>()
const procedureId = ref('')
const procedure = computed(() => props.procedures.find(item => item.value === procedureId.value)?.label ?? '')
const condition = ref<'none' | 'customer' | 'our'>('none')
const mailTypeId = ref('')
const notice = ref('')
const options = computed(() => props.mailTypes.map(node => ({ value: node.id, label: node.name, ...(node.parentId ? { parent: node.parentId } : {}) })))
const rows = computed(() => PROCEDURE_MAIL_MAPPINGS.flatMap(row => [
  { procedure: row.procedure, condition: 'customer', name: row.customer },
  { procedure: row.procedure, condition: 'our', name: row.our }
]).map(row => ({ ...row, id: matchMailTypeByName(props.mailTypes, row.name)?.id ?? '' })))
const tableRows = computed(() => [
  ...rows.value.map(row => ({ ...row, key: `builtin:${row.name}`, path: '', builtin: true })),
  ...props.mappings.map(row => ({ ...row, key: row.id, name: row.mailTypeName, path: row.mailTypePath ?? '', builtin: false }))
])
const { query, page, pages, visible, total } = useMappingRows(tableRows, row => `${row.procedure} ${row.condition === 'none' ? '无' : row.condition === 'customer' ? '有客户文号' : '无客户文号，使用我方文号'} ${typePath(row.name, row.path)}`)
function exportSheet(): void {
  downloadXlsxRows(exportProcedureMappings(props.mappings, props.mailTypes), '处理事项映射.xlsx', '处理事项映射')
}
function onFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('import', file)
}
function typePath(name: string, path?: string): string {
  if (path) return path
  const picked = matchMailTypePath(props.mailTypes, name)
  return (picked && mailTypePath(props.mailTypes, picked.id)) || name
}

function submit(): void {
  notice.value = ''
  if (!procedureId.value || props.procedures.some(item => item.parent === procedureId.value)) { notice.value = '请从处理事项下拉框选择具体事项。'; return }
  const picked = props.mailTypes.find(item => item.id === mailTypeId.value)
  if (!procedure.value.trim() || !picked) { notice.value = '请填写处理事项，并从树中选择发文类型。'; return }
  const path = mailTypePath(props.mailTypes, picked.id)
  if (!path || matchMailTypePath(props.mailTypes, picked.name, path)?.id !== picked.id) { notice.value = '请选择完整树路径唯一的发文类型叶子节点。'; return }
  if (PROCEDURE_MAIL_MAPPINGS.some(row => row.procedure === procedure.value.trim())) { notice.value = '该处理事项为系统内置，不允许修改。'; return }
  if (props.mappings.some(row => row.procedure === procedure.value.trim() && row.condition === condition.value)) { notice.value = '该处理事项和文号条件已有映射，请先删除原项。'; return }
  emit('save', { procedure: procedure.value.trim(), condition: condition.value, mailTypeName: picked.name, mailTypePath: path })
}
watch(() => props.mappings, rows => {
  if (rows.some(row => row.procedure === procedure.value.trim() && row.condition === condition.value && row.mailTypeName === props.mailTypes.find(node => node.id === mailTypeId.value)?.name)) {
    procedureId.value = ''; condition.value = 'none'; mailTypeId.value = ''; notice.value = ''
  }
})
</script>

<template>
  <section class="card mapping-board procedure-mapping">
    <div class="mapping-head">
      <h2>处理事项映射</h2>
      <div class="mapping-actions">
        <button type="button" class="text-button" @click="exportSheet">导出 Excel</button>
        <label class="text-button file-button">{{ importing ? '正在导入…' : '导入 Excel' }}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :disabled="importing" aria-label="导入处理事项映射 Excel" @change="onFile" /></label>
        <button type="button" class="text-button" @click="emit('reloadProcedures')">重新读取处理事项</button><button type="button" class="text-button" @click="emit('reload')">重新读取发文类型</button></div>
    </div>
    <p class="hint">期限监控按 Excel 工作表名称识别处理事项，发文类型按从根到叶子的完整树路径精确匹配。系统内置项置灰锁定；自定义项可在下方添加，默认文号条件为「无」，不限制文号；也可分别配置有客户文号和无客户文号，匹配时优先使用具体条件。可导入、导出 Excel：认「处理事项」「文号条件」「发文类型」列，发文类型填写从根到叶子的完整路径，以 / 分隔；内置项和相同映射自动跳过，冲突不覆盖。</p>
    <p v-if="procedureNotice" class="hint">{{ procedureNotice }}</p>
    <p v-if="notice" class="hint" role="status">{{ notice }}</p>
    <input v-model="query" class="mapping-search" type="search" placeholder="搜索全部处理事项、文号条件、发文类型" aria-label="搜索处理事项映射" />
    <table class="mapping-table procedure-table">
      <thead><tr><th>处理事项</th><th>文号条件</th><th>发文类型</th></tr></thead>
      <tbody>
        <tr v-for="row in visible" :key="row.key" :class="{ 'builtin-row': row.builtin }">
          <td>{{ row.procedure }} <small v-if="row.builtin">系统内置</small></td>
          <td>{{ row.condition === 'none' ? '无' : row.condition === 'customer' ? '有客户文号' : '无客户文号，使用我方文号' }}</td>
          <td>
            <template v-if="row.builtin">
              <div class="type-cell"><MailTypeTreeSelect :model-value="row.id" :options="options" :placeholder="row.name" disabled leaves-only /></div>
              <small v-if="mailTypes.length && !row.id">未找到唯一同名叶子节点，请核对原站发文类型。</small>
            </template>
            <div v-else class="type-cell"><span>{{ typePath(row.name, row.path) }}</span><button type="button" class="mapping-remove" @click="emit('remove', row.id)">删除</button></div>
          </td>
        </tr>
        <tr v-if="total === 0"><td colspan="3" class="mapping-empty">没有匹配的映射。</td></tr>
        <tr class="mapping-add">
          <td><TreeOptionSelect v-model="procedureId" class="procedure-picker" :options="procedures" :multiple="false" leaves-only :status="procedureLoading ? 'loading' : procedures.length ? 'ready' : 'empty'" empty-text="未读取到处理事项，请重新读取。" @retry="emit('reloadProcedures')" /></td>
          <td><ThemeSelect v-model="condition" :options="[{ value: 'none' as const, label: '无' }, { value: 'customer' as const, label: '有客户文号' }, { value: 'our' as const, label: '无客户文号，使用我方文号' }]" /></td>
          <td><div class="type-cell"><MailTypeTreeSelect v-model="mailTypeId" :options="options" :disabled="mailTypes.length === 0" leaves-only /><button type="button" class="solid" @click="submit">添加</button></div></td>
        </tr>
      </tbody>
    </table>
    <MappingPagination v-model:page="page" :pages="pages" :total="total" />
  </section>
</template>

<style scoped>
.procedure-table th:first-child, .procedure-table td:first-child { width: 26%; }
.procedure-table th:nth-child(2), .procedure-table td:nth-child(2) { width: 24%; }
.procedure-table :deep(.theme-select) { width: 100%; display: block; }
.builtin-row { color: #8b95ad; }
.builtin-row small { font-size: 12px; color: #8b95ad; }
</style>
