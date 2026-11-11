<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { cloneFileMailConfig, type FileMailConfig } from '../../customer/file-mail-config'
import { fetchMailSenders } from '../../customer/mailset-load'
import { fetchMailTypeNodes } from '../../customer/mail-type-load'
import { fetchMailboxSignature } from '../../mail/signature-load'
import { appendRecipientField } from '../../mail/easy/contracts'
import { MessageType, type MessageBridge } from '../../shared/message'
import { isQueryGuid } from '../../query/query-validator'

const props = defineProps<{ modelValue?: FileMailConfig; customerId: string; defaults?: FileMailConfig }>()
const emit = defineEmits<{ 'update:modelValue': [FileMailConfig | undefined] }>()
const bridge = inject<MessageBridge>('bridge')
type Field = keyof FileMailConfig
const fields: Array<{ key: Field; label: string }> = [
  { key: 'mailType', label: '发文类型' }, { key: 'to', label: '追加收件人' },
  { key: 'cc', label: '抄送' }, { key: 'sender', label: '发件人' },
  { key: 'reviewer', label: '审核人' }, { key: 'title', label: '标题模板' }, { key: 'signature', label: '签名' }
]
const loaded = new Set<string>()
const options = ref<Record<string, Array<{ value: string; label: string }>>>({})
const messages = ref<Record<string, string>>({})
const loading = ref<Record<string, boolean>>({})
const directory = ref<Array<{ name: string; email: string }>>([])
const config = computed(() => props.modelValue ?? {})
const cc = computed(() => config.value.cc ?? { sender: true, sales: true })
function patch(key: Field, value: unknown): void {
  const next = cloneFileMailConfig(props.modelValue) ?? {}
  if (key === 'title' && typeof value === 'string' && value.trim() === props.defaults?.title?.trim()) value = undefined
  if (value === undefined || (typeof value === 'string' && !value.trim())) delete next[key]
  else Object.assign(next, { [key]: value })
  emit('update:modelValue', Object.keys(next).length ? next : undefined)
}
function choices(key: Field): Array<{ value: string; label: string }> {
  const list = [...(options.value[key] ?? [])]
  const saved = config.value[key]
  if (saved && typeof saved === 'object' && 'id' in saved && !list.some(x => x.value === saved.id)) {
    list.unshift({ value: saved.id, label: 'label' in saved ? saved.label : saved.name })
  }
  const fallback = props.defaults?.[key]
  const label = fallback && typeof fallback === 'object' && 'id' in fallback ? ('label' in fallback ? fallback.label : fallback.name) : ''
  return [{ value: '', label: label ? `默认：${label}` : '使用默认' }, ...list]
}
function addressChoices(key: 'sender' | 'sales'): Array<{ value: string; label: string }> {
  const list = [...(key === 'sender' ? options.value.senderAddresses ?? [] : options.value.contacts ?? [])]
  const saved = key === 'sender' ? cc.value.senderAddress : cc.value.salesAddress
  if (saved && !list.some(x => x.value === saved)) list.unshift({ value: saved, label: saved })
  return [{ value: '', label: key === 'sender' ? '本封使用的发件人' : '原站按本封案件返回的商务' }, ...list]
}
function select(key: Field, value: string): void {
  const fallback = props.defaults?.[key]
  if (fallback && typeof fallback === 'object' && 'id' in fallback && fallback.id === value) { patch(key, undefined); return }
  const row = options.value[key]?.find(x => x.value === value)
  if (!row) { if (!value) patch(key, undefined); return }
  patch(key, key === 'sender' ? { id: row.value, label: row.label } : { id: row.value, name: row.label })
}
function saveCc(value: NonNullable<FileMailConfig['cc']>): void {
  const next = { ...value }
  for (const key of ['senderAddress', 'salesAddress', 'extra'] as const) if (!next[key]?.trim()) delete next[key]
  if (!next.sender) delete next.senderAddress
  if (!next.sales) delete next.salesAddress
  patch('cc', next.sender && next.sales && !next.senderAddress && !next.salesAddress && !next.extra ? undefined : next)
}
function patchCc(key: string, value: unknown): void { saveCc({ ...cc.value, [key]: value || undefined }) }
function setCcSource(key: 'sender' | 'sales', checked: boolean): void { saveCc({ ...cc.value, [key]: checked }) }
function appendContact(value: string, target: 'to' | 'cc'): void {
  const row = directory.value.find(x => `${x.name}(${x.email});` === value)
  if (!row) return
  const address = `${row.name}(${row.email});`
  if (target === 'to') patch('to', appendRecipientField(config.value.to ?? '', address))
  else patchCc('extra', appendRecipientField(cc.value.extra ?? '', address))
}
async function load(kind: string, force = false): Promise<void> {
  if (!bridge || loading.value[kind] || (!force && loaded.has(kind))) return
  loading.value[kind] = true
  messages.value[kind] = '正在读取…'
  try {
    if (kind === 'sender') {
      const result = await fetchMailSenders(bridge, force)
      options.value.sender = result.items.map(x => ({ value: x.id, label: x.label }))
      options.value.senderAddresses = result.items.filter(x => x.email).map(x => ({ value: `${x.name}(${x.email});`, label: x.label }))
      messages.value[kind] = result.message
      if (!result.message) loaded.add(kind)
    } else if (kind === 'mailType') {
      const result = await fetchMailTypeNodes(bridge, force)
      options.value.mailType = result.nodes.filter(x => isQueryGuid(x.id)).map(x => ({ value: x.id, label: x.name }))
      messages.value[kind] = result.message
      if (!result.message) loaded.add(kind)
    } else if (kind === 'signature') {
      const result = await fetchMailboxSignature(bridge, force)
      options.value.signature = (result.data?.items ?? []).map(x => ({ value: x.id, label: x.name }))
      messages.value[kind] = result.message
      if (result.data) loaded.add(kind)
    } else if (kind === 'reviewer') {
      const result = await bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'reviewer', force } })
      if (result.type === MessageType.DictionaryResult && result.payload.ok && result.payload.data.kind === 'reviewer') {
        options.value.reviewer = result.payload.data.reviewers.map(x => ({ value: x.id, label: x.name }))
        messages.value[kind] = ''
        loaded.add(kind)
      } else messages.value[kind] = '审核人没有读到，请重新读取。'
    } else if (kind === 'contacts') {
      if (!isQueryGuid(props.customerId)) { messages.value[kind] = '先选择客户，再读取联系人。'; return }
      const customerId = props.customerId
      const result = await bridge.request({ type: MessageType.ReadCustomerDirectory, payload: { customerId } })
      if (customerId !== props.customerId) return
      if (result.type === MessageType.CustomerDirectoryResult && result.payload.ok && result.payload.data.complete) {
        loaded.add(kind)
        directory.value = result.payload.data.rows.filter(x => x.email)
        options.value.contacts = directory.value.map(x => ({ value: `${x.name}(${x.email});`, label: `${x.name}<${x.email}>` }))
        messages.value[kind] = directory.value.length ? '' : '这个客户没有可用联系人，可在后面填写地址。'
      } else messages.value[kind] = '客户联系人没有读全，请重新读取或填写地址。'
    }
  } catch { messages.value[kind] = '读取失败，请重新读取。' }
  finally { loading.value[kind] = false }
}
</script>

<template>
  <section class="file-mail-config">
    <h3>此客户的发文设置</h3>
    <p class="hint">直接修改即可自定义；留空或选择“使用默认”会沿用原有规则。只影响这条客户工作流。</p>
    <div class="mail-settings-grid">
    <div v-for="field in fields" :key="field.key" class="mail-setting" :class="{ 'is-wide': field.key === 'to' || field.key === 'cc' }" :data-field="field.key">
      <div class="mail-setting-title"><strong>{{ field.label }}</strong><span>{{ config[field.key] !== undefined ? '已自定义' : '默认' }}</span></div>
      <template>
        <template v-if="['mailType', 'sender', 'reviewer', 'signature'].includes(field.key)">
          <ThemeSelect :model-value="(config[field.key] as { id?: string } | undefined)?.id ?? ''" :options="choices(field.key)" placeholder="留空使用默认" @open="load(field.key)" @update:model-value="select(field.key, String($event))" />
          <button type="button" class="text-button" @click="load(field.key, true)">重新读取{{ field.label }}</button>
          <p class="hint load-note" role="status">{{ messages[field.key] || ' ' }}</p>
        </template>
        <template v-else-if="field.key === 'title'">
          <input :value="config.title ?? ''" maxlength="500" :placeholder="defaults?.title || '留空使用默认标题模板'" @input="patch('title', ($event.target as HTMLInputElement).value)" />
          <p class="hint">支持现有模板变量，例如 {客户名称}、{文件描述}、{发文类型}。</p>
        </template>
        <template v-else-if="field.key === 'to'">
          <p class="hint">保留案件联系人，在后面追加这些收件人。</p>
          <ThemeSelect model-value="" :options="options.contacts ?? []" placeholder="从此客户联系人中追加" @open="load('contacts')" @update:model-value="appendContact(String($event), 'to')" />
          <textarea :value="config.to ?? ''" placeholder="追加：姓名(邮箱); 或 邮箱; 每行一个也可以" @input="patch('to', ($event.target as HTMLTextAreaElement).value)" />
          <button type="button" class="text-button" @click="load('contacts', true)">重新读取客户联系人</button>
          <p class="hint load-note" role="status">{{ messages.contacts || ' ' }}</p>
        </template>
        <template v-else-if="field.key === 'cc'">
          <label><input type="checkbox" :checked="cc.sender" @change="setCcSource('sender', ($event.target as HTMLInputElement).checked)" /> 抄送发件人</label>
          <ThemeSelect v-if="cc.sender" :model-value="cc.senderAddress ?? ''" :options="addressChoices('sender')" placeholder="本封使用的发件人" @open="load('sender')" @update:model-value="patchCc('senderAddress', String($event))" />
          <label><input type="checkbox" :checked="cc.sales" @change="setCcSource('sales', ($event.target as HTMLInputElement).checked)" /> 抄送商务</label>
          <ThemeSelect v-if="cc.sales" :model-value="cc.salesAddress ?? ''" :options="addressChoices('sales')" placeholder="原站按本封案件返回的商务" @open="load('contacts')" @update:model-value="patchCc('salesAddress', String($event))" />
          <ThemeSelect model-value="" :options="options.contacts ?? []" placeholder="从客户联系人中追加抄送" @open="load('contacts')" @update:model-value="appendContact(String($event), 'cc')" />
          <textarea :value="cc.extra ?? ''" placeholder="继续追加：姓名(邮箱); 或 邮箱;" @input="patchCc('extra', ($event.target as HTMLTextAreaElement).value)" />
          <button type="button" class="text-button" @click="load('sender', true); load('contacts', true)">重新读取抄送选项</button>
          <p class="hint load-note" role="status">{{ messages.contacts || messages.sender || ' ' }}</p>
          <p class="hint">全部取消且不追加地址，表示不抄送；两项勾选且下拉留空、不追加地址时恢复默认。</p>
        </template>
      </template>
    </div>
    </div>
  </section>
</template>

<style scoped>
.file-mail-config { min-width: 0; }
.file-mail-config h3 { margin: 0 0 8px; }
.mail-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px 20px; margin-top: 18px; }
.mail-setting { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.mail-setting.is-wide { grid-column: 1 / -1; }
.mail-setting-title { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.mail-setting-title span { font-size: 12px; color: #8492ad; }
.mail-setting textarea { min-height: 64px; resize: vertical; width: 100%; box-sizing: border-box; }
.mail-setting input:not([type=checkbox]) { width: 100%; box-sizing: border-box; }
.mail-setting .hint { margin: 0; }
.mail-setting .text-button { align-self: flex-end; }
.load-note { height: 1.5em; line-height: 1.5; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 1200px) { .mail-settings-grid { grid-template-columns: minmax(0, 1fr); } }
</style>
