<script setup lang="ts">
import TreeOptionSelect from '../../../shell/components/TreeOptionSelect.vue'
import type { TreeOption } from '../../../query/option-tree'
import MappingPagination from './MappingPagination.vue'
import { useMappingRows } from './useMappingRows'
import { computed, ref, watch } from 'vue'
import { downloadXlsxRows } from '../../../customer/xlsx-table'
import { mappingExportRows } from '../../../mail/rules/description-import'
import MailTypeTreeSelect from '../../../shell/components/MailTypeTreeSelect.vue'
import type { DescriptionMailTypeMapping } from '../../../mail/types'

const props = defineProps<{
  mappings: DescriptionMailTypeMapping[]
  mailTypes: Array<{ id: string; name: string; parentId: string }>
  descriptions: TreeOption[]
  descriptionLoading?: boolean
  descriptionNotice?: string
  notice: string
  importing?: boolean
}>()
const emit = defineEmits<{
  save: [mapping: { descriptionId: string; description: string; mailTypeId: string; mailTypeName: string }]
  remove: [id: string]
  reload: []
  reloadDescriptions: []
  import: [file: File]
}>()
const descriptionId = ref('')
const description = computed(() => props.descriptions.find(item => item.value === descriptionId.value)?.label ?? '')
const localNotice = ref('')
const { query, page, pages, visible, total } = useMappingRows(computed(() => props.mappings), row => `${descriptionPath(row)} ${row.fileDescriptionId ?? ''} ${typePath(row.mailTypeId, row.mailTypeName)}`)
const mailTypeId = ref('')

const treeOptions = computed(() => props.mailTypes.map(item => ({
  value: item.id,
  label: item.name,
  ...(item.parentId ? { parent: item.parentId } : {})
})))
const byId = computed(() => new Map(props.mailTypes.map(item => [item.id, item])))
const descriptionById = computed(() => new Map(props.descriptions.map(item => [item.value.toLowerCase(), item])))
const descriptionOptions = computed(() => {
  const counts = new Map<string, number>()
  const keyOf = (item: TreeOption) => JSON.stringify([item.parent?.toLowerCase(), item.label.trim()])
  for (const item of props.descriptions) {
    const key = keyOf(item)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return props.descriptions.map(item => (counts.get(keyOf(item)) ?? 0) > 1
    ? { ...item, label: `${item.label} · ${item.value}` }
    : item)
})
const descriptionOptionById = computed(() => new Map(descriptionOptions.value.map(item => [item.value.toLowerCase(), item])))

function descriptionPath(item: DescriptionMailTypeMapping): string {
  const fallback = item.fileDescriptionText || item.fileDescriptionId || ''
  let node = descriptionById.value.get(item.fileDescriptionId?.toLowerCase() ?? '')
  if (!node) return fallback
  const names: string[] = []
  const seen = new Set<string>()
  while (node && !seen.has(node.value)) {
    seen.add(node.value)
    names.unshift(descriptionOptionById.value.get(node.value.toLowerCase())?.label ?? node.label)
    node = descriptionById.value.get(node.parent?.toLowerCase() ?? '')
  }
  return names.join(' / ')
}

function typePath(id: string, fallback: string): string {
  const names: string[] = []
  let current = id
  const seen = new Set<string>()
  while (current && !seen.has(current)) {
    seen.add(current)
    const node = byId.value.get(current)
    if (!node) break
    names.unshift(node.name)
    current = node.parentId
  }
  return names.length ? names.join(' / ') : fallback
}

function exportSheet(): void {
  downloadXlsxRows(mappingExportRows(props.mappings, props.mailTypes), '发文映射.xlsx', '发文映射')
}

function onFile(event: Event): void {
  const input = event.target
  if (!(input instanceof HTMLInputElement)) return
  const file = input.files?.[0]
  input.value = ''
  if (file) emit('import', file)
}

function submit(): void {
  localNotice.value = ''
  const descriptions = props.descriptions.filter(item => item.value === descriptionId.value)
  if (!descriptionId.value || !description.value || descriptions.length !== 1 || descriptions[0].selectable === false ||
      props.descriptions.some(item => item.parent === descriptionId.value)) {
    localNotice.value = '请从原站文件描述下拉框选择唯一的具体描述。'
    return
  }
  const picked = byId.value.get(mailTypeId.value)
  emit('save', {
    descriptionId: descriptionId.value,
    description: description.value.trim(),
    mailTypeId: picked?.id ?? '',
    mailTypeName: picked?.name ?? ''
  })
}

watch(() => props.mappings, (rows) => {
  const text = description.value.trim()
  if (!text || !mailTypeId.value) return
  if (rows.some(item => item.fileDescriptionId?.toLowerCase() === descriptionId.value.toLowerCase() && item.mailTypeId === mailTypeId.value)) {
    descriptionId.value = ''
    mailTypeId.value = ''
  }
})
</script>

<template>
  <section class="card mapping-board">
    <div class="mapping-head">
      <h2>文件描述映射</h2>
      <div class="mapping-actions">
        <button type="button" class="text-button" @click="exportSheet">导出 Excel</button>
        <label class="text-button file-button">
          {{ importing ? '正在导入…' : '导入 Excel' }}
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" :disabled="importing" aria-label="导入 Excel" @change="onFile" />
        </label>
        <button type="button" class="text-button" @click="emit('reloadDescriptions')">重新读取文件描述</button>
        <button type="button" class="text-button" @click="emit('reload')">重新读取发文类型</button>
      </div>
    </div>
    <p class="hint">从原站的树中选择文件描述叶子和发文类型。导入 Excel 时，填写「文件描述」和「发文类型」，同名文件描述还需要「文件描述ID」。导出会保留已有的叶子 ID。</p>
    <p v-if="descriptionNotice || localNotice" class="hint">{{ descriptionNotice || localNotice }}</p>
    <input v-model="query" class="mapping-search" type="search" placeholder="搜索全部文件描述、发文类型" aria-label="搜索文件描述映射" />
    <p v-if="notice" class="hint">{{ notice }}</p>
    <table class="mapping-table">
      <thead>
        <tr><th>文件描述</th><th>发文类型</th></tr>
      </thead>
      <tbody>
        <tr v-for="item in visible" :key="item.id">
          <td>{{ descriptionPath(item) }}</td>
          <td>
            <div class="type-cell">
              <span>{{ typePath(item.mailTypeId, item.mailTypeName) }}</span>
              <button type="button" class="mapping-remove" @click="emit('remove', item.id)">删除</button>
            </div>
          </td>
        </tr>
        <tr v-if="total === 0">
          <td colspan="2" class="mapping-empty">{{ query ? '没有匹配的映射。' : '还没有映射。在下面这一行添加第一对。' }}</td>
        </tr>
        <tr class="mapping-add">
          <td><TreeOptionSelect v-model="descriptionId" class="description-picker" :options="descriptionOptions" :multiple="false" leaves-only :status="descriptionLoading ? 'loading' : descriptions.length ? 'ready' : 'empty'" empty-text="未读取到文件描述，请重新读取。" @retry="emit('reloadDescriptions')" /></td>
          <td>
            <div class="type-cell">
              <MailTypeTreeSelect v-model="mailTypeId" :options="treeOptions" :disabled="mailTypes.length === 0" leaves-only />
              <button type="button" class="solid" @click="submit">添加</button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <MappingPagination v-model:page="page" :pages="pages" :total="total" />
  </section>
</template>
