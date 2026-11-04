<script setup lang="ts">
import { importProcedureMappings } from '../../customer/procedure-mapping-import'

import { CURRENT_ENVIRONMENT } from '../../api/config'
import { validProcedureMappings } from '../../customer/procedure-mapping'
import { matchMailTypePath } from '../../customer/mail-type-path'
import PageHead from '../../shell/components/PageHead.vue'
import { bg } from '../../shell/assets'
import { computed, inject, ref, watch } from 'vue'
import { plainClone } from '../../automation/snapshot'
import { mergeImportedMappings, upsertMapping } from '../../mail'
import { readXlsxRows } from '../../customer/xlsx-table'
import type { MailRuleBundle, ProcedureMailTypeMapping } from '../../mail/types'
import { isQueryGuid } from '../../query/query-validator'
import { scopeFromConnection, type ExpectedAccountScope } from '../../shared/connection'
import { MessageType, type MessageBridge } from '../../shared/message'
import { useWorkspace } from '../composables/useWorkspace'
import DescriptionMailTypeEditor from '../components/rules/DescriptionMailTypeEditor.vue'
import ProcedureMailTypeMappingEditor from '../components/rules/ProcedureMailTypeMapping.vue'
import RecipientEditor from '../components/rules/RecipientEditor.vue'
import SignatureEditor from '../components/rules/SignatureEditor.vue'
import SubjectRuleEditor from '../components/rules/SubjectRuleEditor.vue'
import BodyRuleEditor from '../components/rules/BodyRuleEditor.vue'
import DefaultReviewerEditor from '../components/rules/DefaultReviewerEditor.vue'
import DefaultSenderEditor from '../components/rules/DefaultSenderEditor.vue'
import { fetchMailSenders } from '../../customer/mailset-load'
import { fetchMailTypeNodes } from '../../customer/mail-type-load'
import { fetchMailboxSignature } from '../../mail/signature-load'
import type { MailSignatureItem } from '../../mail/easy/signature-read'
import { defaultSignatureChoice, signatureChoices, signatureKey } from '../../mail/signature-catalog'

const bridge = inject<MessageBridge>('bridge')
const { connection, customers, rules, accountEpoch, call } = useWorkspace()
const ready = computed(() => connection.value.sessionStatus === 'authenticated')
const draft = ref<MailRuleBundle | null>(null)
const draftScope = ref<ExpectedAccountScope | null>(null)
const message = ref('')
const savingText = ref(false)
const textStatus = ref('')
const importText = ref('')
const reviewers = ref<Array<{ id: string; name: string }>>([])
const reviewerNotice = ref('')
const senders = ref<Array<{ id: string; label: string; isDefault: boolean; isPublic: boolean; signature: string }>>([])
const senderNotice = ref('')
const mailTypes = ref<Array<{ id: string; name: string; parentId: string }>>([])
const mailTypeNotice = ref('')
const procedures = ref<Array<{ value: string; label: string; parent?: string }>>([])
const procedureNotice = ref('')
const descriptions = ref<Array<{ value: string; label: string; parent?: string; selectable?: boolean }>>([])
const descriptionNotice = ref('')
const descriptionLoading = ref(false)
const procedureLoading = ref(false)
const importingMappings = ref(false)
const importingProcedureMappings = ref(false)
const signatureReserved = ref<MailSignatureItem | null>(null)
const signatureItems = ref<MailSignatureItem[]>([])
const signatureNotice = ref('')
const signatureActiveKey = computed(() => defaultSignatureChoice(
  signatureChoices(signatureItems.value, draft.value?.signatures ?? [], connection.value.operatorId),
  draft.value?.defaultSignatureId ?? null,
  signatureReserved.value?.id ?? null
)?.key ?? '')

watch(rules, (bundle) => {
  draft.value = bundle ? plainClone(bundle) : null
  draftScope.value = scopeFromConnection(connection.value)
}, { immediate: true })
watch(accountEpoch, () => { importText.value = ''; procedures.value = []; descriptions.value = []; procedureNotice.value = ''; descriptionNotice.value = ''; if (ready.value) { void loadDescriptions(false); void loadProcedures(false) } })
watch(ready, (ok) => { if (ok) { void loadDescriptions(false); void loadProcedures(false); void loadReviewers(false); void loadSenders(false); void loadMailTypes(false); void loadSignatures(false) } }, { immediate: true })
watch(() => connection.value.easyOrigin, (next, previous) => {
  if (!previous || next === previous || !ready.value) return
  void loadDescriptions(false)
  void loadProcedures(false)
  void loadReviewers(false)
  void loadSenders(false)
  void loadMailTypes(false)
  void loadSignatures(false)
})

async function loadDescriptions(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  const epoch = accountEpoch.value
  descriptionLoading.value = true
  descriptionNotice.value = '正在从原网站读取文件描述…'
  try {
    const response = await bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'fileType', force, caseTypeId: CURRENT_ENVIRONMENT.caseTypeId } })
    if (accountEpoch.value !== epoch) return
    if (response.type === MessageType.DictionaryResult && response.payload.ok && response.payload.data.kind === 'fileType') {
      descriptions.value = response.payload.data.nodes.map(item => ({ value: item.id, label: item.name, selectable: item.selectable, ...(item.parentId ? { parent: item.parentId } : {}) }))
      descriptionNotice.value = descriptions.value.length ? '' : '原网站没有返回文件描述。'
    } else {
      descriptions.value = []
      descriptionNotice.value = response.type === MessageType.Error ? response.payload.message : '文件描述没有读到，请重新读取。'
    }
  } catch {
    if (accountEpoch.value === epoch) { descriptions.value = []; descriptionNotice.value = '读取文件描述失败，请重新读取。' }
  } finally {
    if (accountEpoch.value === epoch) descriptionLoading.value = false
  }
}

async function loadProcedures(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  const epoch = accountEpoch.value
  procedureLoading.value = true
  procedureNotice.value = '正在从原网站读取处理事项…'
  try {
    const response = await bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'picker', force } })
    if (accountEpoch.value !== epoch) return
    if (response.type === MessageType.DictionaryResult && response.payload.ok && response.payload.data.kind === 'picker') {
      procedures.value = (response.payload.data.dictionaries.limitCtrlProc?.options ?? []).map(item => ({ value: item.value, label: item.label, ...(item.parentValue ? { parent: item.parentValue } : {}) }))
      procedureNotice.value = procedures.value.length ? '' : '原网站没有返回处理事项。'
    } else {
      procedures.value = []
      procedureNotice.value = response.type === MessageType.Error ? response.payload.message : '处理事项没有从原网站读到，请重新读取。'
    }
  } catch {
    if (accountEpoch.value === epoch) { procedures.value = []; procedureNotice.value = '读取处理事项失败，请重新读取。' }
  } finally {
    if (accountEpoch.value === epoch) procedureLoading.value = false
  }
}

async function loadReviewers(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  reviewerNotice.value = '正在从原网站读取人员…'
  const response = await bridge.request({ type: MessageType.LoadDictionary, payload: { kind: 'reviewer', force } })
  if (response.type === MessageType.Error) {
    reviewerNotice.value = response.payload.message
    reviewers.value = []
    return
  }
  if (response.type !== MessageType.DictionaryResult || !response.payload.ok || response.payload.data.kind !== 'reviewer') {
    reviewerNotice.value = response.type === MessageType.DictionaryResult && !response.payload.ok
      ? response.payload.error.message
      : '人员名单没有从原网站读到。'
    reviewers.value = []
    return
  }
  reviewers.value = response.payload.data.reviewers
  reviewerNotice.value = reviewers.value.length ? '' : '原网站没有返回可选人员。'
}

async function loadSenders(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  senderNotice.value = '正在从原网站读取发件邮箱…'
  const loaded = await fetchMailSenders(bridge, force)
  senders.value = loaded.items.map(item => ({
    id: item.id,
    label: item.label,
    isDefault: item.isDefault,
    isPublic: item.isPublic,
    signature: item.signature
  }))
  senderNotice.value = loaded.message
}

async function loadSignatures(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  signatureNotice.value = '正在读取个人设置里的邮件签名…'
  const loaded = await fetchMailboxSignature(bridge, force)
  signatureReserved.value = loaded.data?.reserved ?? null
  signatureItems.value = loaded.data?.items ?? []
  signatureNotice.value = loaded.data ? loaded.data.note : loaded.message
}

async function loadMailTypes(force: boolean): Promise<void> {
  if (!bridge || !ready.value) return
  mailTypeNotice.value = '正在从原网站读取发文类型…'
  const loaded = await fetchMailTypeNodes(bridge, force)
  mailTypes.value = loaded.nodes.map(node => ({ id: node.id, name: node.name, parentId: node.parentId }))
  mailTypeNotice.value = mailTypes.value.length ? '' : (loaded.message || '原网站没有返回发文类型。')
}

async function persist(mutate: (bundle: MailRuleBundle) => void): Promise<void> {
  if (!draft.value || !draftScope.value) {
    message.value = '尚未确认账号，未保存。'
    return
  }
  const next = plainClone(draft.value)
  mutate(next)
  next.ownerId = connection.value.operatorId
  const result = await call({ action: 'saveRules', bundle: next, expectedScope: draftScope.value })
  message.value = result?.message || '规则没有保存。'
  if (result?.rules) draft.value = plainClone(result.rules)
}

function addresses(value: string): string[] {
  return value.split(/[\s,;]+/).map(item => item.trim()).filter(Boolean)
}

async function saveMapping(input: { description: string; mailTypeId: string; mailTypeName: string }): Promise<void> {
  if (!draft.value) return
  if (!input.description.trim() || !isQueryGuid(input.mailTypeId) || !input.mailTypeName.trim()) {
    message.value = '请填写文件描述，并从发文类型里选择。'
    return
  }
  const result = upsertMapping(draft.value.mappings, {
    id: crypto.randomUUID(),
    fileDescriptionText: input.description,
    mailTypeId: input.mailTypeId,
    mailTypeName: input.mailTypeName,
    enabled: true,
    version: 1,
    updatedAt: new Date().toISOString()
  })
  if (!result.ok) { message.value = result.message; return }
  await persist(bundle => { bundle.mappings = result.mappings })
}

async function saveProcedureMapping(input: Omit<ProcedureMailTypeMapping, 'id'>): Promise<void> {
  if (!draft.value) return
  const matches = procedures.value.filter(item => item.label === input.procedure && item.value && !procedures.value.some(child => child.parent === item.value))
  if (matches.length !== 1) { message.value = '请选择原站名称唯一的具体处理事项。'; return }
  if (!matchMailTypePath(mailTypes.value, input.mailTypeName, input.mailTypePath)) { message.value = '请选择唯一同名的发文类型叶子节点。'; return }
  const next = [...(draft.value.procedureMappings ?? []), { ...input, id: crypto.randomUUID() }]
  if (!validProcedureMappings(next)) { message.value = '该事项为内置项或相同文号条件已有映射，不能重复添加。'; return }
  await persist(bundle => { bundle.procedureMappings = next })
}

async function importProcedureMappingFile(file: File): Promise<void> {
  if (!draft.value || importingProcedureMappings.value) return
  if (!procedures.value.length || !mailTypes.value.length) { message.value = '请先读取处理事项和发文类型，再导入。'; return }
  const epoch = accountEpoch.value
  importingProcedureMappings.value = true
  try {
    const table = await readXlsxRows(await file.arrayBuffer())
    if (accountEpoch.value !== epoch || !draft.value) return
    const merged = importProcedureMappings(draft.value.procedureMappings ?? [], table, mailTypes.value, procedures.value, () => crypto.randomUUID())
    if (!merged.ok) { message.value = merged.message; return }
    if (!merged.added) { message.value = merged.notice; return }
    await persist(bundle => { bundle.procedureMappings = merged.mappings })
    if (message.value.includes('已保存')) message.value = `${merged.notice}处理事项映射已保存。`
  } catch (error) {
    if (accountEpoch.value === epoch) message.value = error instanceof Error ? error.message : '表格没有读出来。'
  } finally {
    importingProcedureMappings.value = false
  }
}

async function removeProcedureMapping(id: string): Promise<void> {
  await persist(bundle => { bundle.procedureMappings = (bundle.procedureMappings ?? []).filter(row => row.id !== id) })
}

async function removeMapping(id: string): Promise<void> {
  await persist(bundle => { bundle.mappings = bundle.mappings.filter(item => item.id !== id) })
}

async function importMappingFile(file: File): Promise<void> {
  if (!draft.value || importingMappings.value) return
  if (!/\.xlsx$/i.test(file.name)) {
    message.value = '请选择 .xlsx 文件。'
    return
  }
  if (!mailTypes.value.length) {
    message.value = '发文类型还没读到。先重新读取发文类型，再导入。'
    return
  }
  importingMappings.value = true
  try {
    const table = await readXlsxRows(await file.arrayBuffer())
    const merged = mergeImportedMappings(draft.value.mappings, table, mailTypes.value, {
      now: new Date().toISOString(),
      createId: () => crypto.randomUUID()
    })
    if (!merged.ok) {
      message.value = merged.message
      return
    }
    if (!merged.added) {
      message.value = merged.notice
      return
    }
    await persist(bundle => { bundle.mappings = merged.mappings })
    if (message.value.includes('已保存')) message.value = `${merged.notice}发文规则已保存。`
  } catch (error) {
    message.value = error instanceof Error ? error.message : '表格没有读出来。'
  } finally {
    importingMappings.value = false
  }
}

async function saveRecipient(input: { profileId: string; name: string; to: string; cc: string }): Promise<void> {
  if (!input.profileId || !input.name) { message.value = '请选择客户并填写收件人模板名称。'; return }
  await persist(bundle => {
    bundle.recipients = bundle.recipients.concat({
      id: crypto.randomUUID(),
      customerProfileId: input.profileId,
      name: input.name,
      to: addresses(input.to),
      cc: addresses(input.cc),
      enabled: true,
      isDefault: true,
      version: 1,
      updatedAt: new Date().toISOString()
    })
  })
}

async function saveSignature(input: { name: string; content: string }): Promise<void> {
  const name = input.name.trim().slice(0, 80)
  const content = input.content.trim().slice(0, 4000)
  if (!name || !content) { message.value = '请填写签名名称和内容。'; return }
  await persist(bundle => {
    bundle.signatures = bundle.signatures.concat({
      id: crypto.randomUUID(),
      operatorId: connection.value.operatorId,
      name,
      content,
      enabled: true,
      isDefault: false,
      version: 1,
      updatedAt: new Date().toISOString()
    })
  })
}

async function removeSignature(id: string): Promise<void> {
  await persist(bundle => {
    bundle.signatures = bundle.signatures.filter(item => item.id !== id)
    if (bundle.defaultSignatureId === signatureKey('diy', id)) bundle.defaultSignatureId = null
  })
}

async function preferSignature(key: string): Promise<void> {
  await persist(bundle => {
    bundle.defaultSignatureId = key
    const diyId = key.startsWith('diy:') ? key.slice(4) : ''
    bundle.signatures = bundle.signatures.map(item => ({ ...item, isDefault: Boolean(diyId) && item.id === diyId }))
  })
}

async function saveReviewer(input: { userId: string; name: string }): Promise<void> {
  if (!isQueryGuid(input.userId) || !input.name.trim()) { message.value = '请从当前账号的人员里选择审核人。'; return }
  await persist(bundle => { bundle.defaultReviewer = { userId: input.userId, name: input.name.trim() } })
}

async function saveSender(input: { mailsetId: string; label: string }): Promise<void> {
  if (!isQueryGuid(input.mailsetId) || !input.label.trim()) { message.value = '请从原网站的发件邮箱里选择默认发件人。'; return }
  await persist(bundle => { bundle.defaultSender = { mailsetId: input.mailsetId, label: input.label.trim() } })
}

async function saveText(): Promise<void> {
  if (savingText.value) return
  savingText.value = true
  textStatus.value = ''
  try {
    await persist(bundle => {
      if (!draft.value) return
      bundle.subject = { ...draft.value.subject, version: (draft.value.subject.version || 0) + 1 }
      bundle.body = { ...draft.value.body, version: (draft.value.body.version || 0) + 1 }
    })
    textStatus.value = message.value.includes('已保存') ? '标题和正文已保存。' : (message.value || '标题和正文没有保存。')
  } catch (error) {
    textStatus.value = error instanceof Error ? error.message : '标题和正文没有保存。'
    message.value = textStatus.value
  } finally {
    savingText.value = false
  }
}

async function importRules(): Promise<void> {
  let parsed: MailRuleBundle
  try {
    parsed = JSON.parse(importText.value) as MailRuleBundle
  } catch {
    message.value = '导入失败，原配置未覆盖。'
    return
  }
  if (!isQueryGuid(connection.value.operatorId)) { message.value = '尚未确认 EASY 用户。'; return }
  await persist(bundle => {
    bundle.policies = parsed.policies
    bundle.mappings = parsed.mappings
    bundle.procedureMappings = parsed.procedureMappings
    bundle.recipients = parsed.recipients
    bundle.signatures = parsed.signatures
    bundle.subject = parsed.subject
    bundle.body = parsed.body
    bundle.defaultReviewer = parsed.defaultReviewer ?? null
    bundle.defaultSender = parsed.defaultSender ?? null
    bundle.defaultSignatureId = parsed.defaultSignatureId ?? null
  })
}
</script>

<template>
  <PageHead title="发文映射" desc="文件描述对上发文类型，并记下收件人、签名、标题和正文。" :art="bg('规则配置好，发文更轻松.png')" art-large />
  <section v-if="!ready" class="card"><p class="empty">尚未确认当前登录的人，不能读取发文映射。</p></section>
  <section v-else-if="!draft" class="card"><p class="empty">发文规则还没有读到。</p></section>
  <div v-else class="rules-page">
    <p v-if="message" class="hint">{{ message }}</p>
    <DescriptionMailTypeEditor :descriptions="descriptions" :description-loading="descriptionLoading" :description-notice="descriptionNotice" @reload-descriptions="loadDescriptions(true)" :mappings="draft.mappings" :mail-types="mailTypes" :notice="mailTypeNotice" :importing="importingMappings" @save="saveMapping" @remove="removeMapping" @reload="loadMailTypes(true)" @import="importMappingFile" />
    <ProcedureMailTypeMappingEditor :importing="importingProcedureMappings" @import="importProcedureMappingFile" :procedures="procedures" :procedure-loading="procedureLoading" :procedure-notice="procedureNotice" @reload-procedures="loadProcedures(true)" :mail-types="mailTypes" :mappings="draft.procedureMappings ?? []" @save="saveProcedureMapping" @remove="removeProcedureMapping" @reload="loadMailTypes(true)" />
    <div class="rule-columns">
      <RecipientEditor :recipients="draft.recipients" :customers="customers" @save="saveRecipient" />
      <SignatureEditor :signatures="draft.signatures" :items="signatureItems" :active-key="signatureActiveKey" :notice="signatureNotice" @save="saveSignature" @remove="removeSignature" @prefer="preferSignature" @reload="loadSignatures(true)" />
    </div>
    <div class="rule-columns">
      <DefaultReviewerEditor :reviewers="reviewers" :current-id="connection.operatorId" :selected="draft.defaultReviewer" :notice="reviewerNotice" @save="saveReviewer" @reload="loadReviewers(true)" />
      <DefaultSenderEditor :senders="senders" :selected="draft.defaultSender" :notice="senderNotice" @save="saveSender" @reload="loadSenders(true)" />
    </div>
    <form class="card stack-form" @submit.prevent="saveText">
      <h2>标题和正文</h2>
      <p class="hint">原站默认主题按「客户文号-我方文号-案件名称+发文类型」拼接，空的段会自动去掉。可以删掉其中几段，再写上自己的字，例如把文号改成第一件-最后一件，或改成「18件」。</p>
      <div class="rule-fields">
        <SubjectRuleEditor v-model="draft.subject" />
        <BodyRuleEditor v-model="draft.body" />
      </div>
      <button class="solid" type="submit" :disabled="savingText">{{ savingText ? '正在保存…' : '保存标题和正文' }}</button>
      <p v-if="textStatus" class="save-status" role="status">{{ textStatus }}</p>
    </form>
    <form class="card stack-form" @submit.prevent="importRules">
      <h2>配置导入</h2>
      <label>规则 JSON <textarea v-model="importText" rows="4"></textarea></label>
      <button class="ghost" type="submit">导入到当前账号</button>
    </form>
  </div>
</template>
