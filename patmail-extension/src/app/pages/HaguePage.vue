<script setup lang="ts">
import PageHead from '../../shell/components/PageHead.vue'
import Bunny from '../../shell/components/Bunny.vue'
import { bg } from '../../shell/assets'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { discoverCases, readFiling, validateImages, imageNumber, validCaseVolume } from '../../hague/materials'
import { arbitrate } from '../../hague/arbitration'
import { createFullPageBridge } from '../services/full-page-bridge'
import OaSessionCard from '../components/OaSessionCard.vue'
import { useOaSession } from '../composables/useOaSession'
import { hagueSessionClient } from '../../hague/session'
import ImagePreview from '../components/ImagePreview.vue'
import SplitScrollPane from '../components/SplitScrollPane.vue'
import { useTopProgress } from '../composables/useTopProgress'
import { runBatch, transition, STATE_LABELS, type HagueRow, type BatchProgress } from '../../hague/workflow'
import { taskCheckSnapshot } from '../check-progress'
import { MessageType } from '../../shared/message'
import { buildDraftPlan } from '../../hague/draft-plan'
import { callDraftPage, runDraftPlan } from '../../hague/draft-runner'
import { runDraftBatch, type DraftBatchProgress } from '../../hague/draft-batch'
import { openDraftTab } from '../../hague/draft-tabs'
import type { DraftCheckpoint } from '../../hague/draft-contract'

const props = withDefaults(defineProps<{ embedded?: boolean; isActive?: boolean }>(), { isActive: true })
const filePicker = ref<HTMLInputElement | null>(null)
const oa = useOaSession(hagueSessionClient)
const headExtraId = inject<string | null>('workflowHeadExtraId', null)
const targetSelector = computed(() => {
  if (headExtraId) return `#${headExtraId}`
  if (!props.embedded) return '#hague-standalone-head-extra'
  return null
})
const canTeleport = ref(false)
onMounted(() => {
  canTeleport.value = typeof document !== 'undefined' && Boolean(targetSelector.value && document.querySelector(targetSelector.value))
})

type Row = HagueRow
const progress = ref<BatchProgress | null>(null)
const importing = ref({ done: 0, total: 0 })
const stopping = ref(false)
const elapsed = ref(0)
let startedAt = Date.now()
const tick = window.setInterval(() => { if (busy.value) elapsed.value = Math.floor((Date.now() - startedAt) / 1000) }, 1000)
const rainbow = computed(() => {
  if (draftRunning.value || draftProgress.value) {
    const d = draftProgress.value
    const b=draftBatch.value,status=draftRunning.value?'run':b.failed||b.skipped||b.stopped?'hold':'done'
    const snap = taskCheckSnapshot(b.done, b.total || 1, startedAt, Date.now(), status)
    return { ...snap, visible:true, status, label:'海牙草稿', summary:`本批 ${b.settled}/${b.cases} 件 · 成功 ${b.succeeded} · 异常 ${b.failed} · 跳过 ${b.skipped} · 运行 ${b.active} 路 · ${b.done}/${b.total} 步`,detail:`${d?.stage ?? '检查目标页面'}${stopping.value ? ' · 当前步骤结束后停止' : ''}` } as const
  }
  const p = progress.value
  const imp = importing.value
  const status = busy.value ? 'run' : p?.phase === 'stopped' || p?.phase === 'waiting' ? 'hold' : 'done'
  const snap = taskCheckSnapshot(p ? p.doneUnits : imp.done, p ? p.totalUnits : imp.total, startedAt, Date.now(), status)
  return { ...snap, visible: snap.total > 0, status, label: '海牙材料', summary: p ? `本批已处理 ${p.settled}/${p.total} 件 · 成功 ${p.succeeded} · 异常 ${p.failed}` : `已解析 ${imp.done}/${imp.total} 件`, detail: `${stopping.value ? '正在停止，等待当前只读查询结束' : p?.stage || (busy.value ? '解析 Word 与图片' : '材料解析结束')}${busy.value ? ` · 已用时 ${elapsed.value} 秒` : ''}${p?.active && busy.value ? ` · ${p.active}` : ''}` } as const
})
useTopProgress(rainbow, computed(() => props.isActive !== false))
const pendingRows = computed(() => rows.value.filter(r => !r.decision && r.state !== 'blocked'))
const rows = ref<Row[]>([]), busy = ref(false), selected = ref(0), notice = ref('')
const active = computed(() => rows.value[selected.value])
const draftRunning = ref(false)
const draftProgress = ref<DraftCheckpoint | null>(null)
const draftBatch = ref<DraftBatchProgress>({done:0,total:0,settled:0,cases:0,succeeded:0,failed:0,skipped:0,active:0,stopped:false})
const draftConcurrency = ref(1)
const draftErrors = ref<Record<string,string>>({})
const draftSkipped = ref<Record<string,boolean>>({})
const draftActive = ref(new Set<string>())
const draftIssue = (row: Row): string => { try { buildDraftPlan(row); return '' } catch(e) { return e instanceof Error ? e.message : '材料未就绪' } }
const draftKey = (row: Row) => `hague.draft.v1.${row.folder.caseVolume}`
async function storeDraft(row: Row, value: DraftCheckpoint): Promise<void> {
  row.draft = { ...value }
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [draftKey(row)]:value })
}
async function loadDraft(row: Row): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  const data = await chrome.storage.local.get(draftKey(row))
  const saved: unknown = data[draftKey(row)]
  if (saved && typeof saved === 'object' && 'next' in saved && 'tabId' in saved && 'status' in saved) row.draft = saved as DraftCheckpoint
}
async function createDrafts(targets: Row[], batch=false): Promise<void> {
  if (busy.value || !targets.length) return
  if (!await oa.ensureFresh()) { notice.value = '请先连接并验证 eHague 登录态。'; return }
  const tabId = oa.selected.value
  busy.value = true; draftRunning.value = true; stopping.value = false; controller = new AbortController(); startedAt = Date.now(); elapsed.value = 0
  draftProgress.value={tabId,next:0,total:0,status:'running',stage:'准备独立工作标签页'}
  draftErrors.value={}
  draftSkipped.value={}
  try {
    const result=await runDraftBatch(targets,batch?draftConcurrency.value:1,{
      open:()=>batch?openDraftTab():Promise.resolve(tabId),
      save:storeDraft,
      update:value=>{draftBatch.value=value},
      error:(row,message,kind)=>{draftErrors.value[row.folder.path]=message;draftSkipped.value[row.folder.path]=kind==='skipped';if(kind==='failed'&&/登录|login/i.test(message))controller?.abort()},
      run:async(row,plan,workerTab,update)=>{
        draftActive.value.add(row.folder.path)
        try{return await runDraftPlan(plan,workerTab,{
          call:(command,documentId,reference)=>callDraftPage(workerTab,command,documentId,reference),
          save:value=>storeDraft(row,value),
          update:value=>{draftProgress.value={...value,stage:`${row.folder.caseVolume} · ${value.stage}`};update(value)}
        },controller?.signal,row.draft)}finally{draftActive.value.delete(row.folder.path)}
      }
    },controller.signal)
    notice.value=`草稿批次${result.stopped?'已停止':'已结束'}：成功 ${result.succeeded}，异常 ${result.failed}，跳过 ${result.skipped}。${result.failed||result.skipped?'请在各案查看原因及原站现场。':''}`
  } catch(e) { notice.value = e instanceof Error ? e.message : '草稿操作已停止，请检查原站。' }
  finally { busy.value = false; draftRunning.value = false; stopping.value = false }
}
async function acknowledgeDraft(row: Row, completed: boolean): Promise<void> {
  if (!row.draft || busy.value) return
  await storeDraft(row, { ...row.draft, next:row.draft.next+(completed?1:0), status:'stopped', error:undefined, stage:'已由用户核对，等待继续' })
}
const bridge = createFullPageBridge()
let controller: AbortController | undefined
let batchId = ''
const urls = new Map<File, string>()
const previewIndex = ref<number | null>(null)
const gallery = computed(() => active.value?.folder.images.map(file => ({ src: preview(file), label: `${file.name} · ${active.value?.filing?.views.find(v => v.number === imageNumber(file))?.label || '未匹配视图'}` })) ?? [])
watch(() => active.value?.folder.path, () => { previewIndex.value = null })
watch(() => props.isActive, value => { if (!value) previewIndex.value = null })
function preview(file: File): string { if (!urls.has(file)) urls.set(file, URL.createObjectURL(file)); return urls.get(file)! }
function cleanup(): void { previewIndex.value = null; urls.forEach(url => URL.revokeObjectURL(url)); urls.clear() }
onBeforeUnmount(() => { if (busy.value) requestStop(); window.clearInterval(tick); cleanup() })
function issues(row: Row): string[] { return [...row.folder.issues, ...(row.filing?.issues ?? []), ...(row.filing ? validateImages(row.filing, row.folder.images) : [])] }
async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]; input.value = ''
  if (!files.length || busy.value) return
  cleanup(); selected.value = 0; notice.value = ''; progress.value = null
  rows.value = discoverCases(files).map(folder => ({ folder, state: 'parsing', error: '', confirmed: false }))
  await Promise.all(rows.value.map(loadDraft))
  if (!rows.value.length) { notice.value = '没有发现案件文件夹，请选择包含定稿 Word 和编号图片的目录。'; return }
  await process(rows.value, false, true)
}
function requestStop(): void {
  stopping.value = true; controller?.abort()
  if (batchId && !draftRunning.value) void bridge.request({ type: MessageType.CancelHagueRead, payload: { batchId } })
}
async function process(targets: Row[], refresh = false, parse = false): Promise<void> {
  if (busy.value || !targets.length) return
  draftProgress.value = null
  busy.value = true; stopping.value = false; controller = new AbortController(); batchId = crypto.randomUUID(); startedAt = Date.now(); elapsed.value = 0
  if (refresh) for (const row of targets) row.source = undefined
  try {
    if (oa.verified.value) await oa.ensureFresh()
    await runBatch(targets, {
      canRead: () => oa.verified.value,
      ...(parse ? { parse: async (row: Row) => {
        if (row.folder.documents.length !== 1) throw new Error('需要一份定稿 Word')
        row.filing = await readFiling(row.folder.documents[0])
      } } : {}),
      validate: row => [...issues(row), ...(!validCaseVolume(row.folder.caseVolume) ? ['我方文号格式无效'] : []), ...(!row.filing ? ['Word 未解析成功'] : [])],
      read: async (row, signal) => {
        const response = await bridge.request({ type: MessageType.ReadHagueCase, payload: { caseVolume: row.folder.caseVolume, batchId } }, signal)
        if (response.type === MessageType.Error) throw new Error(response.payload.message)
        if (response.type !== MessageType.ReadHagueCaseResult) throw new Error('知易通未返回案件信息')
        return response.payload.text
      },
      decide: (row, signal, onStart) => arbitrate(row.folder.caseVolume, row.filing!, row.source!, signal, onStart)
    }, controller.signal, next => { progress.value = next })
  } finally {
    busy.value = false; stopping.value = false
    const waiting = rows.value.filter(r => r.state === 'waiting-session')
    if (oa.verified.value && waiting.length && !controller.signal.aborted) void process(waiting)
  }
}
async function verifyOa(): Promise<void> {
  if (await oa.verify() && !busy.value && pendingRows.value.length) await process(pendingRows.value)
}
watch([oa.verified, oa.checking], ([ready, checking]) => {
  if (!ready && !checking && busy.value && rows.value.some(r => ['reading', 'queued', 'arbitrating'].includes(r.state))) requestStop()
})
function changeReference(row: Row): void {
  row.folder.caseVolume = row.folder.caseVolume.trim().toUpperCase()
  row.source = undefined; row.decision = undefined; row.confirmed = false; row.error = ''
  row.draft = undefined
  row.folder.issues = row.folder.issues.filter(i => !/案号|我方文号/.test(i))
  transition(row, issues(row).length || !validCaseVolume(row.folder.caseVolume) ? 'blocked' : 'ready')
}
function confirmResult(row: Row): void { transition(row, row.confirmed ? 'confirmed' : 'review') }
function showDraftPdf(row: Row): void { if (row.draft?.downloadId !== undefined) chrome.downloads.show(row.draft.downloadId) }
function rowStatus(row: Row): string {
  if (row.draft?.status === 'saved') return '草稿已保存'
  if (draftActive.value.has(row.folder.path)) return 'eHague 填表中'
  if (draftErrors.value[row.folder.path]) return draftSkipped.value[row.folder.path]?'暂未填写，查看原因':'草稿执行失败，查看原因'
  if (row.draft?.status === 'uncertain') return '草稿步骤待核对'
  if (row.draft?.status === 'stopped' || row.draft?.status === 'running') return '草稿已停止，可继续'
  return STATE_LABELS[row.state]
}
function exportData(): void {
  const data = rows.value.map(r => ({ path: r.folder.path, caseVolume: r.folder.caseVolume, state: r.state, status: STATE_LABELS[r.state], issues: issues(r), error: r.error, confirmed: r.confirmed, requiresPriorityReview: r.decision?.priorities.some(p => p.requiresReview) ?? false, notices: r.folder.notices, filing: r.filing, decision: r.decision, draft:r.draft, images: r.folder.images.map(f => ({ name: f.name, number: imageNumber(f) })) }))
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = '海牙申请核对结果.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<template>
  <section class="hague-page">
    <PageHead v-if="!embedded" title="海牙新申请" desc="把案件材料放进来，逐案核对图片与信息，再交给助手整理。" :art="bg('让重复工作变简单.png')">
      <div id="hague-standalone-head-extra" class="workflow-head-extra" />
    </PageHead>
    <Teleport v-if="canTeleport && targetSelector" :to="targetSelector">
      <OaSessionCard platform="WIPO eHague" :tabs="oa.tabs.value" :selected="oa.selected.value" :state="oa.state.value" :message="oa.message.value" :checking="oa.checking.value" :listing="oa.listing.value" @update:selected="oa.selected.value = $event" @verify="verifyOa" @refresh="oa.refresh" @open="oa.open" />
    </Teleport>
    <OaSessionCard v-else-if="!canTeleport" platform="WIPO eHague" :tabs="oa.tabs.value" :selected="oa.selected.value" :state="oa.state.value" :message="oa.message.value" :checking="oa.checking.value" :listing="oa.listing.value" @update:selected="oa.selected.value = $event" @verify="verifyOa" @refresh="oa.refresh" @open="oa.open" />
    <section class="card hague-prepare">
      <header class="card-head">
        <h2>批量材料准备</h2>
        <span class="hint hague-status" role="status" aria-live="polite">{{ notice || (busy ? '正在处理，请保留此页面…' : (rows.length ? `已识别 ${rows.length} 件案件` : '选择总文件夹自动解析并仲裁')) }}</span>
      </header>
      <div class="toolbar">
        <input ref="filePicker" aria-label="选择海牙申请总文件夹" type="file" webkitdirectory multiple hidden :disabled="busy" @change="upload" />
        <button type="button" class="solid" :disabled="busy" @click="filePicker?.click()">选择总文件夹</button>
        <button type="button" class="solid" :disabled="busy || !pendingRows.length || !oa.verified.value" @click="process(pendingRows)">{{ progress?.phase === 'stopped' ? '继续处理剩余案件' : '读取知易通并批量仲裁' }}</button>
        <button type="button" class="ghost" v-if="busy && progress" :disabled="stopping" @click="requestStop">{{ stopping ? '正在停止…' : '停止后续处理' }}</button>
        <button type="button" class="ghost" :disabled="busy || !rows.length" @click="exportData">导出核对结果</button>
        <label>草稿并发 <select v-model.number="draftConcurrency" :disabled="busy" aria-label="草稿并发路数"><option v-for="n in 6" :key="n" :value="n">{{ n }} 路{{ n === 1 ? '（串行）' : '（试运行）' }}</option></select></label>
        <button type="button" class="solid" :disabled="busy || !oa.verified.value || !rows.some(r => r.decision && r.draft?.status !== 'saved')" @click="createDrafts(rows.filter(r => r.draft?.status !== 'saved'), true)">批量填写并存草稿</button>
        <button type="button" v-if="draftRunning" class="ghost" :disabled="stopping" @click="requestStop">{{ stopping ? '等待本步回执…' : '停止后续写入' }}</button>
      </div>
      <p class="hint">批量填写可选 1–6 路，每路使用独立标签页，单案步骤依次执行；异常页保留供核对。多路填写仍需真实站点稳定性验证。</p>
      <p v-if="busy && progress" class="hint hague-progress-hint">待解析 {{ progress.parsing || 0 }} · 取数 {{ progress.reading || 0 }} · 等待仲裁 {{ progress.queued || 0 }} · 仲裁中案件 {{ progress.arbitrating || 0 }} · 助手批次并发 1</p>
    </section>
    <div v-if="!rows.length && !busy" class="card tone-pink hague-empty">
      <Bunny /><div><h2>先把案件材料放进来吧</h2><p class="hint">一个总文件夹就好，里面可以嵌套多个案件文件夹。</p><p class="hint">每案准备一份定稿 Word，以及 1.1、1.2 这样的编号图片。</p></div>
    </div>
    <SplitScrollPane v-if="rows.length" class="hague-workbench" sidebar-label="案件列表滚动区域" detail-label="案件详情滚动区域" :detail-key="active?.folder.path">
      <template #sidebar><nav class="card hague-cases" aria-label="案件列表"><button v-for="(row, i) in rows" :key="row.folder.path" class="ghost hague-case" :class="{ current: selected === i }" :aria-pressed="selected === i" @click="selected = i"><b>{{ row.folder.caseVolume || '未识别案号' }}</b><small>{{ row.folder.path }}</small><span>{{ rowStatus(row) }} · {{ issues(row).length }} 项材料问题</span></button></nav></template>
      <article v-if="active" class="card hague-detail">
        <h3>{{ active.folder.caseVolume }}</h3>
        <p v-if="draftErrors[active.folder.path]" class="errors card tone-orange">{{ draftErrors[active.folder.path] }}</p>
        <div class="toolbar hague-reference"><label>我方文号 <input v-model="active.folder.caseVolume" :disabled="busy" @change="changeReference(active)" /></label>
        <span class="hint">默认使用识别文号，有误时直接修改。</span></div>
        <p v-for="note in active.folder.notices" :key="note" class="hint">{{ note }}</p>
        <p>{{ active.folder.documents.map(f => f.name).join('、') }}</p>
        <ul v-if="issues(active).length" class="errors card tone-orange"><li v-for="issue in issues(active)" :key="issue">{{ issue }}</li></ul>
        <p v-if="active.error" role="alert" class="errors card tone-pink">{{ active.error }}</p>
        <template v-if="active.filing">
          <p>Locarno {{ active.filing.locarno }} · {{ active.filing.products.map(p => `${p[2]} / ${p[3]}`).join('；') }}</p>
          <details><summary>Description 原文</summary><pre v-if="active.filing.description" class="formula">{{ active.filing.description }}</pre><p v-else class="hint">材料未提供 Description（可选项），不自动编造说明。</p></details>
          <p class="hint">逐张核对实际视图。表格代码可能填反；图片与表格不符时请修正原材料重新选择。</p>
          <div class="images"><figure class="card" v-for="(f, imageIndex) in active.folder.images" :key="f.webkitRelativePath || f.name"><button type="button" class="hague-image-open" :aria-label="`放大预览 ${f.name}`" @click="previewIndex = imageIndex"><img :src="preview(f)" :alt="f.name" loading="lazy" /></button><figcaption>{{ f.name }} · {{ active.filing.views.find(v => v.number === imageNumber(f))?.label || '未匹配视图' }}</figcaption></figure></div>
        </template>
        <button type="button" class="solid" :disabled="busy || !active.filing || issues(active).length > 0 || !oa.verified.value" @click="process([active], true)">{{ active.decision ? '重新读取并仲裁本案' : '读取并仲裁本案' }}</button>
        <template v-if="active.decision">
          <h3>仲裁结果</h3>
          <details><summary>补充设计人英文姓名</summary><p class="hint">缺少英文姓名时由 AI 按中文原名转写拼音，可在此核对或修改；地址继续复用第一申请人。</p><div v-for="(creator, i) in active.decision.creators" :key="i" class="toolbar"><span>设计人 {{ i + 1 }}</span><label>名 <input v-model="creator.givenName" :disabled="busy || !!active.draft" /></label><label>姓 <input v-model="creator.familyName" :disabled="busy || !!active.draft" /></label></div></details>
          <ul v-if="active.decision.warnings.length" class="errors card tone-orange"><li v-for="warning in active.decision.warnings" :key="warning">{{ warning }}</li></ul>
          <div class="hague-result-grid">
            <section class="card tone-pink"><h4>申请人</h4><dl><dt>英文名称</dt><dd>{{ active.decision.applicant.name || '待补充' }}</dd><dt>详细地址（到区）</dt><dd>{{ active.decision.applicant.address || '待补充' }}</dd><dt>城市 / 省份</dt><dd>{{ active.decision.applicant.city }} / {{ active.decision.applicant.region }}</dd><dt>邮编 / 国家</dt><dd>{{ active.decision.applicant.postalCode }} / {{ active.decision.applicant.country }}</dd></dl></section>
            <section class="card tone-purple"><h4>设计人</h4><p v-for="(creator, i) in active.decision.creators" :key="i">{{ creator.givenName || creator.familyName ? `${creator.givenName} ${creator.familyName}` : `设计人 ${i + 1}${creator.sourceName ? `（${creator.sourceName}）` : ''}：等待 AI 转写或补充` }}<span v-if="creator.nameOrigin === 'ai-transliterated'" class="hint"> · AI 拼音转写（{{ creator.sourceName }}）</span></p><p class="hint">详细地址、城市、省份、邮编和国家均复用第一申请人：</p><dl class="hague-creator-address"><dt>详细地址（到区）</dt><dd>{{ active.decision.applicant.address || '待补充' }}</dd><dt>城市 / 省份</dt><dd>{{ active.decision.applicant.city }} / {{ active.decision.applicant.region }}</dd><dt>邮编 / 国家</dt><dd>{{ active.decision.applicant.postalCode }} / {{ active.decision.applicant.country }}</dd></dl><h4>指定缔约方 / 公开时间</h4><p>{{ active.decision.parties.join('、') || '待补充' }} · {{ active.decision.publicationMonths === null ? '公开时间待核对' : `${active.decision.publicationMonths} 个月` }}</p></section>
          </div>
          <section v-if="active.decision.priorities.length" class="card inset tone-blue"><h4>优先权</h4><div v-for="(priority, i) in active.decision.priorities" :key="i" class="hague-priority">
            <dl><dt>在先申请号</dt><dd>{{ priority.number || '待补充' }}</dd><dt>申请日期 / 国家</dt><dd>{{ priority.date || '待补充' }} / {{ priority.country || '待补充' }}</dd><dt>DAS 接入码</dt><dd>{{ priority.das || '待补充' }}</dd></dl>
            <p v-if="priority.generated" class="hint">自动生成的草稿占位申请号，待人工审核。原始申请号：{{ priority.originalNumber || '空' }}</p>
          </div></section>
          <details><summary>字段来源</summary><ul><li v-for="(evidence, i) in active.decision.evidence" :key="i">{{ evidence }}</li></ul></details>
          <label><input v-model="active.confirmed" type="checkbox" :disabled="busy || active.decision.warnings.length > 0 || active.decision.priorities.some(p => p.requiresReview)" @change="confirmResult(active)" /> 已逐项核对材料、视图、地址和仲裁结果</label>
          <section class="card inset tone-pink hague-draft">
            <h4>eHague 草稿</h4>
            <p class="hint">按递交说明填写并保存草稿，生成 Summary 打印文件，完成后交由人工审核。</p>
            <p v-if="draftIssue(active)" class="hint">{{ draftIssue(active) }}</p>
            <p class="hint">PDF 自动保存至浏览器下载目录的 PatMail/Hague/我方文号 文件夹。</p>
            <div v-if="active.draft" role="status"><p>WIPO reference：{{ active.draft.reference || '尚未分配' }} · {{ active.draft.next }}/{{ active.draft.total }} 步</p><p>{{ active.draft.stage }}</p><p v-if="active.draft.error" class="errors">{{ active.draft.error }}</p></div>
            <p v-for="warning in active.draft?.warnings" :key="warning" class="hint">{{ warning }}</p>
            <button v-if="active.draft?.downloadId !== undefined" type="button" class="ghost" @click="showDraftPdf(active)">打开 PDF 所在位置</button>
            <button type="button" class="solid" :disabled="busy || !oa.verified.value || !!draftIssue(active) || active.draft?.status === 'saved' || active.draft?.status === 'uncertain'" @click="createDrafts([active])">{{ active.draft?.status === 'saved' ? '草稿已保存' : active.draft ? '继续当前草稿' : '填写并保存本案草稿' }}</button>
            <p v-if="active.decision.priorities.some(p => p.generated)" class="hint">本案包含自动生成的优先权草稿占位号，保存后仍须人工审核替换。</p>
            <template v-if="active.draft?.status === 'uncertain' && !busy"><p class="hint">请先在原站核对当前步骤是否已保存，再选择对应操作。</p><button type="button" class="ghost" @click="acknowledgeDraft(active, true)">本步已完成，继续下一步</button><button type="button" class="ghost" @click="acknowledgeDraft(active, false)">本步未执行，允许重试</button></template>
          </section>
        </template>
        <details v-if="active.source"><summary>知易通原始字段</summary><pre class="formula">{{ active.source }}</pre></details>
      </article>
    </SplitScrollPane>
    <ImagePreview v-model:index="previewIndex" :items="gallery" />
  </section>
</template>
<style scoped>
.hague-page { min-width: 0; }
.hague-prepare { min-width: 0; margin-bottom: 14px; }
.hague-prepare .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.hague-prepare .card-head h2 { margin: 0; font-size: 15px; }
.hague-prepare .hague-status { margin: 0; font-size: 12px; color: var(--sub); text-align: right; }
.hague-progress-hint { margin: 8px 0 0; font-size: 12px; color: var(--sub); }
.hague-empty { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 32px 20px; }
.hague-empty :deep(.bunny) { flex: none; width: 86px; height: 86px; object-fit: contain; }
.hague-empty h2 { margin: 0 0 12px; font-size: 16px; }

.hague-cases { display: grid; gap: 8px; padding: 10px; }
.hague-case { display: grid; gap: 7px; height: auto; padding: 12px; text-align: left; white-space: normal; overflow-wrap: anywhere; }
.hague-case.current { border-color: var(--pink); background: color-mix(in srgb, var(--pink) 8%, var(--card)); }
.hague-case small, .hague-case span { color: var(--sub); font-size: 12px; line-height: 1.5; }
.hague-detail { min-width: 0; }
.hague-detail h3 { font-size: 16px; margin: 0 0 14px; }
.hague-detail h4 { margin: 0 0 10px; font-size: 14px; }
.hague-reference label { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.hague-reference input { min-width: 0; width: 220px; padding: 8px 10px; }
.errors { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
ul.errors { padding-left: 32px; }
.images { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; margin: 14px 0; }
.images figure { margin: 0; padding: 10px; min-width: 0; box-shadow: none; }
.hague-image-open { display: block; width: 100%; height: 180px; padding: 0; border: 0; border-radius: 10px; background: var(--card); cursor: zoom-in; }
.images img { display: block; width: 100%; height: 180px; object-fit: contain; background: var(--card); border-radius: 10px; }
.images figcaption { padding-top: 10px; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.formula { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 480px; overflow: auto; }
.hague-detail details { margin: 14px 0; font-size: 13px; line-height: 1.7; }
.hague-detail summary { cursor: pointer; color: var(--text); }
.hague-detail > .solid { margin-bottom: 14px; }
.hague-result-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.hague-result-grid dl { margin: 0; font-size: 13px; }
.hague-result-grid dt { color: var(--sub); margin-top: 10px; }
.hague-result-grid dd { margin: 4px 0 0; overflow-wrap: anywhere; }
@media(max-width: 850px) { .hague-result-grid { grid-template-columns: 1fr; } .hague-reference input { width: min(220px, 50vw); } }
</style>
