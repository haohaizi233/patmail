<script setup lang="ts">
import { downloadNamedBlob } from '../../utils/download-blob'
import {hagueActionState} from '../../hague/action-state'
import {beforeSummaryExport} from '../../hague/reproductions'
import PageHead from '../../shell/components/PageHead.vue'
import Bunny from '../../shell/components/Bunny.vue'
import { bg } from '../../shell/assets'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createRecoveryClient } from '../../recovery/client'
import { HAGUE_HTTP_CHANNEL } from '../../background/hague-http'
import { HAGUE_WORKSPACE_SCOPE,workspaceRows,saveWorkspaceMaterials,pruneWorkspaceMaterials,restoreWorkspaceRows,checkpointForBatch,withHagueBatchLock,type HagueWorkspace,type ActiveDraftBatch } from '../../hague/workspace-recovery'
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
import { createDraftRunnerHost, type HagueGateway } from '../../hague/gateway'
import { runDraftBatch, type DraftBatchProgress } from '../../hague/draft-batch'
import { openDraftTab } from '../../hague/draft-tabs'
import { createHttpChain, httpRestoreCommands, renderSavedSummary,renderSavedReproductions,runHagueSessionRead,exportPageReproductions } from '../../hague/http-client'
import {HagueDiagnosticError} from '../../hague/diagnostics/errors'
import { downloadDocuments } from '../../utils/download-documents'
import type { DraftCheckpoint,DraftCommand } from '../../hague/draft-contract'
import { draftCheckpointSnapshot, draftWarnings } from '../../hague/draft-contract'
import { repairRepeatedDesignNumbers,restoreApprovedDesignNumbers,withDraftCorrections } from '../../hague/draft-repairs'
import { showDraftCompletion,draftReviewNotes } from '../../hague/draft-completion'
import ThemeSelect from '../../shell/components/ThemeSelect.vue'
import { confirmDialog } from '../dialog'
import { readDroppedFolders } from '../../hague/dropped-folders'
import HagueDiagnostics from '../components/HagueDiagnostics.vue'
import type { TraceContext } from '../../hague/diagnostics/trace'

let alive = true
const props = withDefaults(defineProps<{ embedded?: boolean; isActive?: boolean }>(), { isActive: true })
async function repairDesignNumbers(row:Row):Promise<void> {
  if(busy.value||!row.filing||row.draft&&row.draft.status!=='saved')return
  const repaired=repairRepeatedDesignNumbers(row.filing,row.folder.images)
  if(!repaired)return
  row.filing=repaired
  if(row.draft?.status==='saved')await storeDraft(row,row.draft)
  if(!row.decision)await process([row])
}
const filePicker = ref<HTMLInputElement | null>(null)
const authenticationRefreshing=ref(false)
const oa = useOaSession(hagueSessionClient,{autoVerify:true,deferPolling:()=>busy.value||!workspaceReady.value||!!activeBatch||props.isActive===false,recoveringNavigation:()=>authenticationRefreshing.value})
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
const stopReason = ref('')
const elapsed = ref(0)
let startedAt = Date.now()
const tick = window.setInterval(() => { if (busy.value) elapsed.value = Math.floor((Date.now() - startedAt) / 1000) }, 1000)
const zipProgress = ref<{done:number;total:number;error?:boolean}|null>(null)
const rainbow = computed(() => {
  if(zipProgress.value){const p=zipProgress.value,status=busy.value?'run':p.error?'hold':'done';return {...taskCheckSnapshot(p.done,p.total,startedAt,Date.now(),status),visible:true,status,label:'海牙导出',summary:`PDF 打包 ${p.done}/${p.total} 件`,detail:busy.value?'正在生成 PDF 并流式下载 ZIP':p.error?'导出中断，请检查提示':'浏览器已确认下载完成'} as const}
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
const draftConcurrency = ref(6)
const draftTransport = ref<'http'|'page'>('http')
const draftExportReproductions = ref(true)
const draftExportFormat = ref<'pdf'|'zip'>('pdf')
const draftExportOptions: { value: 'pdf'|'zip'; label: string }[] = [{ value: 'pdf', label: '单个 PDF' }, { value: 'zip', label: '流式 ZIP' }]
const draftTransportOptions: { value: 'http'|'page'; label: string }[] = [{ value: 'http', label: '接口链' }, { value: 'page', label: '页面填写' }]
const draftConcurrencyOptions = [1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: `${n} 路${n === 1 ? '（串行）' : ''}` }))
const draftErrors = ref<Record<string,string>>({})
const draftSkipped = ref<Record<string,boolean>>({})
const draftActive = ref(new Set<string>())
const restoredDrafts = ref(new Set<string>())
const workspaceRecovery=createRecoveryClient()
const workspaceReady=ref(false),materialsDurable=ref(false)
const actions=computed(()=>hagueActionState({busy:busy.value,checking:oa.checking.value||authenticationRefreshing.value,listing:oa.listing.value,stopping:stopping.value,verified:oa.verified.value,workspaceReady:workspaceReady.value,materialsDurable:materialsDurable.value,pending:pendingRows.value.length,drafts:rows.value.filter(row=>row.decision&&!issues(row).length).length,saved:savedDraftRows.value.length}))
let materialId='',ownsBatchLock=false,activeBatch:ActiveDraftBatch|undefined,workspaceTimer:ReturnType<typeof setTimeout>|undefined
function workspaceSnapshot():HagueWorkspace {
  return JSON.parse(JSON.stringify({version:1,materialId,rows:workspaceRows(rows.value,materialId),selected:selected.value,concurrency:draftConcurrency.value,transport:draftTransport.value,exportFormat:draftExportFormat.value,exportReproductions:draftExportReproductions.value,batch:draftBatch.value,current:draftProgress.value,activeBatch,approvedTab:oa.selected.value})) as HagueWorkspace
}
async function persistWorkspace():Promise<void>{
  clearTimeout(workspaceTimer)
  if(!workspaceReady.value||!materialId||!materialsDurable.value)return
  const commit=()=>workspaceRecovery.put('workflow-exec',HAGUE_WORKSPACE_SCOPE,workspaceSnapshot())
  if(ownsBatchLock)await commit()
  else await withHagueBatchLock(commit,()=>{})
}
async function ownWorkspace(work:()=>Promise<void>):Promise<void>{
  await withHagueBatchLock(async()=>{ownsBatchLock=true;try{await work()}finally{ownsBatchLock=false}},()=>{notice.value='另一工作台正在执行海牙批次，本页保留记录，未重复写入。'})
}
function scheduleWorkspace():void {
  if(!workspaceReady.value||!materialId)return
  clearTimeout(workspaceTimer)
  workspaceTimer=setTimeout(()=>{void persistWorkspace().catch(()=>{notice.value='工作台恢复记录未能落盘，请保留本页。'})},400)
}
// Checkpoint writes have their own mandatory durability barrier. Do not deep-watch
// them (or File bytes) and reserialize the whole material set on every receipt.
watch(()=>[selected.value,draftConcurrency.value,draftTransport.value,draftExportFormat.value,draftExportReproductions.value,...rows.value.flatMap(row=>[row.state,row.confirmed,row.error,row.source,row.decision,row.filing,row.folder.caseVolume,...(row.decision?.creators.flatMap(creator=>[creator.givenName,creator.familyName])??[])])],scheduleWorkspace)
function flushWorkspaceOnHide():void{void persistWorkspace().catch(()=>{})}
window.addEventListener('pagehide',flushWorkspaceOnHide)
onMounted(async()=>{
  try{
    const snapshot=await workspaceRecovery.get('workflow-exec',HAGUE_WORKSPACE_SCOPE) as HagueWorkspace|null
    if(snapshot?.version===1){
      const restored=await restoreWorkspaceRows(snapshot)
      if(!alive)return
      rows.value=restored;materialId=snapshot.materialId;materialsDurable.value=true;selected.value=Math.max(0,Math.min(snapshot.selected,restored.length-1))
      draftConcurrency.value=Math.max(1,Math.min(6,snapshot.concurrency||6));draftTransport.value=snapshot.transport;draftExportFormat.value=snapshot.exportFormat;draftExportReproductions.value=snapshot.exportReproductions!==false
      draftBatch.value=snapshot.batch;draftProgress.value=snapshot.current;activeBatch=snapshot.activeBatch
      // The case storage is the authoritative, awaited pre-send journal.
      await Promise.all(rows.value.map(loadDraft))
      for(const job of activeBatch?.jobs??[]){const row=rows.value.find(row=>row.folder.path===job.path);if(row)row.draft=checkpointForBatch(row.draft,job.caseRunId)}
      workspaceReady.value=true
      notice.value=`已恢复 ${restored.length} 件材料及工作台。`
      if(activeBatch&&alive){
        const targets=activeBatch.jobs.map(job=>rows.value.find(row=>row.folder.path===job.path))
        if(targets.some(row=>!row))throw new Error('恢复批次材料不完整，未自动写入。')
        if(snapshot.transport!=='http')throw new Error('页面填写模式已恢复，请核对原标签页后手动继续。')
        await oa.refresh()
        if(!oa.tabs.value.some(tab=>tab.id===snapshot.approvedTab))throw new Error('原先批准的 eHague 标签页已关闭，未自动切换到其他草稿。')
        oa.selected.value=snapshot.approvedTab!
        await createDrafts(targets as Row[],activeBatch.parallel,false,true)
      }
    }
  }catch(error){notice.value=error instanceof Error?error.message:'工作台恢复失败，请重新导入材料。'}
  finally{workspaceReady.value=true}
})
const savedDraftRows = computed(() => rows.value.filter(r => r.draft?.status === 'saved' && r.draft.reference))
const uncertainDraftRows = computed(() => rows.value.filter(r => r.draft?.status === 'uncertain' || r.draft?.status === 'failed'))
const unsavedDraftRows = computed(() => rows.value.filter(r => r.draft?.status !== 'saved'))
const restoredSavedCount = computed(() => savedDraftRows.value.filter(r => restoredDrafts.value.has(r.folder.path)).length)
const draftIssues=computed(()=>new Map(rows.value.map(row=>{try{buildDraftPlan(row);return[row.folder.path,''] as const}catch(error){return[row.folder.path,error instanceof Error?error.message:'材料未就绪'] as const}})))
const draftIssue = (row: Row): string => draftIssues.value.get(row.folder.path)??'材料未就绪'
const pendingDraftDisplay=new Map<string,DraftCheckpoint>()
let displayTimer:ReturnType<typeof setTimeout>|undefined,pendingBatch:DraftBatchProgress|undefined,pendingCurrent:DraftCheckpoint|undefined
function flushDraftDisplay():void{
  clearTimeout(displayTimer);displayTimer=undefined
  for(const row of rows.value){const value=pendingDraftDisplay.get(row.folder.path);if(value)row.draft=value}
  pendingDraftDisplay.clear()
  if(pendingBatch){draftBatch.value=pendingBatch;pendingBatch=undefined}
  if(pendingCurrent){draftProgress.value=pendingCurrent;pendingCurrent=undefined}
}
function queueDraftDisplay():void{displayTimer??=setTimeout(flushDraftDisplay,150)}
const draftKey = (row: Row) => `hague.draft.v1.${row.folder.caseVolume}`
async function storeDraft(row: Row, value: DraftCheckpoint): Promise<void> {
  value=draftCheckpointSnapshot(withDraftCorrections(value,row.filing))
  row.draft = { ...value }
  const displayed = rows.value.find(r => r.folder.path === row.folder.path)
  if (displayed && displayed !== row){
    pendingDraftDisplay.set(row.folder.path,{...value})
    if(value.status==='saved'||value.error)flushDraftDisplay();else queueDraftDisplay()
  }
  restoredDrafts.value.delete(row.folder.path)
  if (typeof chrome !== 'undefined' && chrome.storage?.local) await chrome.storage.local.set({ [draftKey(row)]:value })
}
async function loadDraft(row: Row): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  const data = await chrome.storage.local.get(draftKey(row))
  const saved: unknown = data[draftKey(row)]
  if (saved && typeof saved === 'object' && 'next' in saved && 'tabId' in saved && 'status' in saved) { row.draft = draftCheckpointSnapshot(saved as DraftCheckpoint); restoredDrafts.value.add(row.folder.path) }
}
async function exportDraftZip():Promise<void>{
 if(busy.value)return
 const targets=savedDraftRows.value
 if(!targets.length){notice.value='本列表暂无可打包的已保存草稿，请先完成草稿保存。';return}
 busy.value=true;stopping.value=false;const operation=new AbortController();controller=operation;batchId='';startedAt=Date.now();notice.value='正在验证 eHague 登录态，验证通过后打包本列表已存草稿…'
 try{
  const ready=await oa.ensureFresh()
  if(operation.signal.aborted){notice.value='已停止，未开始草稿打包。';return}
  if(!ready){notice.value=oa.message.value;return}
  const tabId=oa.selected.value
  const kinds=draftExportReproductions.value?['Reproductions','Summary'] as const:['Summary'] as const
  const total=targets.length*kinds.length
  zipProgress.value={done:0,total};notice.value=''
  let done=0
  const result=await downloadDocuments('zip',targets.flatMap(row=>kinds.map(kind=>({name:`${row.folder.caseVolume}-${kind}-WIPO${row.draft!.reference}.pdf`,open:async()=>{operation.signal.throwIfAborted();const pdf=await(kind==='Reproductions'?renderSavedReproductions:renderSavedSummary)(tabId,row.folder.caseVolume,row.draft!.reference!);operation.signal.throwIfAborted();zipProgress.value={done:++done,total};return pdf.bytes}}))),`Hague-${draftExportReproductions.value?'Documents':'Summaries'}-${new Date().toISOString().slice(0,10)}.zip`)
  notice.value=`已导出 ${total} 份 PDF，ZIP 下载已完成。`;await chrome.downloads.show(result.downloadId)
 }catch(error){if(zipProgress.value)zipProgress.value={...zipProgress.value,error:true};notice.value=error instanceof Error?error.message:'批量导出失败。'}finally{busy.value=false;stopping.value=false}
}
async function createDrafts(targets: Row[], batch=false, asNew=false,resuming=false): Promise<void> {
  if(busy.value||!workspaceReady.value||oa.checking.value||oa.listing.value||stopping.value)return
  if(!materialsDurable.value){notice.value='材料尚未可靠落盘，请重新导入后再运行。';return}
  try{await ownWorkspace(()=>createDraftsLocked(targets,batch,asNew,resuming))}
  catch(error){notice.value=error instanceof Error?error.message:'工作流运行锁不可用。'}
}
async function createDraftsLocked(targets: Row[], batch=false, asNew=false,resuming=false): Promise<void> {
  if (busy.value || !targets.length) return
  busy.value = true; stopping.value = false; stopReason.value=''; const operation = new AbortController(); controller = operation; batchId = ''
  try {
    const saved = resuming?[]:targets.filter(row => row.draft && (asNew || row.draft.status === 'saved'))
    if (saved.length && !await confirmDialog({
      title: '确认重新创建草稿',
      message: asNew ? `为 ${saved.length} 件案件另建新草稿？旧操作结果尚未确认，原站可能已有草稿。确认后将归档旧检查点，使用当前材料创建新编号；不修改或删除旧草稿，请审核可能重复的记录。` : `重新创建 ${saved.length} 件曾保存的案件草稿？\n本机历史记录不代表原站草稿仍存在。确认后将按当前材料创建新草稿、新编号，保留旧编号记录，不修改或删除旧草稿。${targets.length > saved.length ? `其余 ${targets.length - saved.length} 件继续正常填写或恢复。` : ''}`,
      confirmLabel: asNew ? '另建新草稿' : '重新创建',
      cancelLabel: '取消'
    })) return
    if (operation.signal.aborted) { notice.value = '已停止，未开始草稿填写。'; return }
    // Fresh rows intentionally carry no old reference, progress, transport or recovery budget.
    // The displayed historical receipt stays intact until the new runner persists its checkpoint.
    const previousCheckpoints = new Map<Row, DraftCheckpoint>()
    const jobs = targets.map(row => {
      if (resuming || !row.draft || (!asNew && row.draft.status !== 'saved')) return {...row,draft:row.draft?draftCheckpointSnapshot(row.draft):undefined}
      const fresh: Row = { ...row, draft: undefined }
      previousCheckpoints.set(fresh, draftCheckpointSnapshot(row.draft))
      return fresh
    })
    const checkpointFor=(row:Row,value:DraftCheckpoint):DraftCheckpoint=>{
      const previous=previousCheckpoints.get(row)
      return {...value,transport:draftTransport.value,...(previous&&previous.status!=='saved'?{warnings:[...new Set([...draftWarnings(value.warnings),'旧操作结果尚未确认；已归档原检查点并按用户确认另建新草稿，请审核可能重复的记录。'])]}:{})}
    }
    notice.value = resuming?'正在等待旧请求结束并核验原站回执…':'正在验证 eHague 登录态，验证通过后开始填写…'
    const idle=await chrome.runtime.sendMessage<unknown,{ok:boolean;error?:string}>({channel:HAGUE_HTTP_CHANNEL,action:'waitIdle'})
    if(!idle.ok)throw new Error(idle.error==='接口参数无效。'?'新版后台尚未启用，请在 Chrome 扩展管理页重新加载 PatMail，再恢复本工作台。':idle.error||'旧请求尚未结束，未重复写入。')
    const ready = resuming?await oa.recover():await oa.ensureFresh()
    if (operation.signal.aborted) { notice.value = '已停止，未开始草稿填写。'; return }
    if (!ready) { notice.value = oa.message.value; return }
    if(!resuming)activeBatch={parallel:batch,jobs:jobs.map(row=>({path:row.folder.path,caseRunId:row.draft?.caseRunId??'case-'+crypto.randomUUID()}))}
    const runIds=new Map(activeBatch?.jobs.map(job=>[job.path,job.caseRunId])??[])
    if(jobs.some(row=>!runIds.has(row.folder.path)))throw new Error('批次运行代号不完整，未开始写入。')
    await persistWorkspace() // intent + stable run IDs must survive before first dispatch
    const tabId = oa.selected.value
    notice.value = ''; zipProgress.value=null
    draftRunning.value = true; startedAt = Date.now(); elapsed.value = 0
    draftProgress.value={tabId,next:0,total:0,status:'running',stage:draftTransport.value==='http'?'准备独立接口链':'准备独立工作标签页'}
    draftErrors.value={}
    draftSkipped.value={}
    let authenticationRefresh:Promise<boolean>|undefined
    const refreshAuthentication=():Promise<boolean>=>{
      if(authenticationRefresh)return authenticationRefresh
      authenticationRefreshing.value=true
      const work=(async()=>{
        try{
          if(operation.signal.aborted)return false
          return await runHagueSessionRead(()=>oa.recover(),operation.signal)
        }catch{return false}
        finally{authenticationRefreshing.value=false}
      })()
      authenticationRefresh=work
      void work.then(()=>{if(authenticationRefresh===work)authenticationRefresh=undefined})
      return work
    }
    const result=await runDraftBatch(jobs,batch?draftConcurrency.value:1,{
      transport:draftTransport.value,
      recoverUncertain:draftTransport.value==='http',
      completed:row=>resuming&&row.draft?.status==='saved'&&row.draft.caseRunId===runIds.get(row.folder.path),
      open:()=>draftTransport.value==='http'?Promise.resolve(tabId):batch?openDraftTab():Promise.resolve(tabId),
      save:(row,value)=>storeDraft(row,checkpointFor(row,value)),
      update:value=>{pendingBatch=value;queueDraftDisplay()},
      error:(row,message,kind)=>{draftErrors.value[row.folder.path]=message;draftSkipped.value[row.folder.path]=kind==='skipped';if(kind==='failed'&&/登录|login/i.test(message))stopWithReason(`原站业务请求未通过登录校验：${message}`)},
      run:async(row,plan,workerTab,update)=>{
        const previous = previousCheckpoints.get(row)
        if (previous && typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set({ [`hague.draft.history.v1.${row.folder.caseVolume}.${previous.reference ?? `unassigned-${crypto.randomUUID()}`}`]: previous })
        }
        draftActive.value.add(row.folder.path)
        let http=draftTransport.value==='http'?createHttpChain(tabId,`hague-http-${crypto.randomUUID()}`,row.draft?.reference,httpRestoreCommands(plan,row.draft?.next??0),draftExportFormat.value,operation.signal):null
        try{
          const gateway: HagueGateway = {
            transport: draftTransport.value,
            inspect: (reference, trace) => dispatch({op:'inspect'}, undefined, reference, trace),
            execute: (command, context) => dispatch(command, context.documentId, context.reference, context.trace),
            refreshAuthentication,
            ...(http ? { recover: async(command:DraftCommand,checkpoint:DraftCheckpoint,trace?:TraceContext)=>{
              if(authenticationRefresh&&!await authenticationRefresh)return{outcome:'unknown' as const}
              let fresh=createHttpChain(tabId,`hague-recovery-${crypto.randomUUID()}`,checkpoint.reference,[],draftExportFormat.value,operation.signal)
              let result=await fresh.recover(command,checkpoint,trace)
              if(result.diagnosticError?.errorCode==='AUTH_REDIRECT'&&await refreshAuthentication()){
                fresh=createHttpChain(tabId,`hague-recovery-${crypto.randomUUID()}`,checkpoint.reference,[],draftExportFormat.value,operation.signal)
                result=await fresh.recover(command,checkpoint,trace)
              }
              if(result.outcome!=='unknown'&&result.receipt?.ok)oa.noteAuthenticatedActivity(tabId)
              if(result.outcome!=='unknown')http=fresh
              return result
            }} : {}),
          }
          async function dispatch(command:DraftCommand,documentId?:string,reference?:string,trace?:TraceContext){
            if(oa.checking.value&&!oa.verified.value&&!authenticationRefresh&&!await refreshAuthentication())throw new HagueDiagnosticError({errorCode:'AUTH_REDIRECT',errorStage:'http'})
            if(authenticationRefresh&&!await authenticationRefresh)throw new HagueDiagnosticError({errorCode:'AUTH_REDIRECT',errorStage:'http'})
            if(command.op==='summary'&&draftExportReproductions.value){
              if(pendingCurrent)pendingCurrent={...pendingCurrent,stage:`${row.folder.caseVolume} · 导出图纸 PDF`}
              await beforeSummaryExport(()=>http?http.exportReproductions(row.folder.caseVolume,trace):exportPageReproductions(workerTab,reference??'',row.folder.caseVolume,documentId,trace,operation.signal),operation.signal)
            }
            const receipt=await(http?http.call(command,trace):callDraftPage(workerTab,command,documentId,reference,trace))
            if(receipt.ok)oa.noteAuthenticatedActivity(tabId)
            return receipt
          }
          const host=createDraftRunnerHost(gateway,{
            save:value=>storeDraft(row,checkpointFor(row,value)),
            update:value=>{pendingCurrent={...value,stage:`${row.folder.caseVolume} · ${value.stage}`};queueDraftDisplay();update(value)}
          },runIds.get(row.folder.path))
          return await runDraftPlan(plan,workerTab,host,controller?.signal,row.draft)
        }finally{draftActive.value.delete(row.folder.path)}
      }
    },controller.signal)
    flushDraftDisplay()
    notice.value=`草稿批次${result.stopped?'已停止':'已结束'}：成功 ${result.succeeded}，异常 ${result.failed}，跳过 ${result.skipped}。${result.stopped?`停止原因：${stopReason.value||'当前草稿未执行完成，检查点已保留。'}`:''}${result.failed||result.skipped?'请在各案查看原因及原站现场。':''}`
    activeBatch=undefined
    await persistWorkspace()
    void showDraftCompletion(notice.value,jobs.flatMap(row=>draftReviewNotes(row,draftErrors.value[row.folder.path])))
  } catch(e) { notice.value = e instanceof Error ? e.message : '草稿操作已停止，请检查原站。' }
  finally { flushDraftDisplay();busy.value = false; draftRunning.value = false; stopping.value = false }
}
async function acknowledgeDraft(row: Row, completed: boolean): Promise<void> {
  if (!row.draft || busy.value) return
  const recoveryAttempts = { ...(row.draft.recoveryAttempts ?? {}) }
  delete recoveryAttempts[String(row.draft.next)]
  delete recoveryAttempts[String(row.draft.next + (completed ? 1 : 0))]
  await storeDraft(row, { ...row.draft, next:row.draft.next+(completed?1:0), status:'stopped', recoveryDecision:undefined, error:undefined, stage:'已由用户核对，等待继续', recoveryAttempts })
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
onBeforeUnmount(() => { alive = false; if (busy.value) stopWithReason('工作台已卸载，停止后续处理。'); clearTimeout(workspaceTimer);void persistWorkspace().catch(()=>{});window.removeEventListener('pagehide',flushWorkspaceOnHide);window.clearInterval(tick); cleanup() })
function issues(row: Row): string[] { return [...row.folder.issues, ...(row.filing?.issues ?? []), ...(row.filing ? validateImages(row.filing, row.folder.images) : [])] }
async function importFiles(files: File[]): Promise<void> {
  if(!files.length||busy.value)return
  try{await ownWorkspace(()=>importFilesLocked(files))}
  catch(error){notice.value=error instanceof Error?error.message:'工作台恢复存储不可用。'}
}
async function importFilesLocked(files: File[]): Promise<void> {
  if (!files.length || busy.value) return
  cleanup(); restoredDrafts.value.clear(); selected.value = 0; notice.value = ''; progress.value = null
  rows.value = discoverCases(files).map(folder => ({ folder, state: 'parsing', error: '', confirmed: false }))
  materialId=crypto.randomUUID();activeBatch=undefined;materialsDurable.value=false;busy.value=true
  try{
    await saveWorkspaceMaterials(rows.value,materialId);materialsDurable.value=true
    await Promise.all(rows.value.map(loadDraft))
    await persistWorkspace()
    await pruneWorkspaceMaterials(materialId)
  }catch(error){notice.value=error instanceof Error?error.message:'材料持久化失败，请重新导入。';return}
  finally{busy.value=false}
  if(!alive)return
  if (!rows.value.length) { notice.value = '没有发现案件文件夹，请选择包含定稿 Word 和编号图片的目录。'; return }
  await process(rows.value, false, true)
}
function canImportFiles():boolean {return alive&&props.isActive!==false&&!busy.value}
async function confirmImport(files:File[]):Promise<void> {
  if(!canImportFiles()||!files.length)return
  const confirmed=await confirmDialog({title:'导入海牙申请材料',message:`已选择 ${files.length} 个文件。确认后读取材料并进行案件解析、取数和仲裁。`,confirmLabel:'导入材料',cancelLabel:'取消'})
  if(confirmed&&canImportFiles())await importFiles(files)
}
// 走浏览器文件选择，不调 showDirectoryPicker：后者会触发无法抑制的“允许此网站查看和复制文件”授权弹窗。
function chooseFolder(): void { if (canImportFiles()) filePicker.value?.click() }
async function upload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]; input.value = ''
  await confirmImport(files)
}
// 整页都是放置区：拖到空白处也不会让浏览器直接打开文件夹。
const dragging = ref(false)
function isFileDrag(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files')
}
function onDragEnter(event: DragEvent): void {
  if (busy.value || !isFileDrag(event)) return
  dragging.value = true
}
function onDragOver(event: DragEvent): void {
  if (!isFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = busy.value ? 'none' : 'copy'
  if (!busy.value) dragging.value = true
}
function onDragLeave(event: DragEvent): void {
  const zone = event.currentTarget as HTMLElement | null
  const next = event.relatedTarget as Node | null
  if (zone && next && zone.contains(next)) return
  dragging.value = false
}
async function onDrop(event: DragEvent): Promise<void> {
  if (!isFileDrag(event)) return
  event.preventDefault()
  dragging.value = false
  if (busy.value || !event.dataTransfer) return
  try {
    // readDroppedFolders 内部先同步取完 DataTransfer.items，必须在 drop 处理器里直接调用。
    const files = await readDroppedFolders(event.dataTransfer)
    if (!files.length) { notice.value = '请拖入总文件夹（里面可以嵌套多个案件文件夹）。'; return }
    await importFiles(files)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '读取拖入的文件夹失败，请改用「选择总文件夹」。'
  }
}
function requestStop(): void {stopWithReason('用户停止后续处理。')}
function stopWithReason(reason:string):void {
  activeBatch=undefined;void persistWorkspace().catch(()=>{})
  if(!stopReason.value)stopReason.value=reason
  stopping.value = true; controller?.abort()
  if (batchId && !draftRunning.value) void bridge.request({ type: MessageType.CancelHagueRead, payload: { batchId } })
}
async function process(targets: Row[], refresh = false, parse = false): Promise<void> {
  if (busy.value || !targets.length) return
  draftProgress.value = null
  zipProgress.value=null
  busy.value = true; stopping.value = false; stopReason.value=''; controller = new AbortController(); batchId = crypto.randomUUID(); startedAt = Date.now(); elapsed.value = 0
  if (refresh) for (const row of targets) row.source = undefined
  try {
    if (oa.verified.value) await oa.ensureFresh()
    await runBatch(targets, {
      canRead: () => oa.verified.value,
      ...(parse ? { parse: async (row: Row) => {
        if (row.folder.documents.length !== 1) throw new Error('需要一份定稿 Word')
        row.filing = restoreApprovedDesignNumbers(await readFiling(row.folder.documents[0]),row.folder.images,row.draft)
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
  if(busy.value)return
  await ownWorkspace(async()=>{
    authenticationRefreshing.value=true
    let ready=false
    try{ready=await runHagueSessionRead(()=>oa.verify())}finally{authenticationRefreshing.value=false}
    if(ready&&!busy.value&&pendingRows.value.length)await process(pendingRows.value)
  })
}
// Continue only material reads already requested by import; never auto-create a draft.
watch([oa.verified,busy],([ready,running])=>{
  if(!ready||running||controller?.signal.aborted||!workspaceReady.value)return
  const waiting=rows.value.filter(row=>row.state==='waiting-session')
  if(waiting.length)void process(waiting)
})
watch([oa.verified, oa.checking,authenticationRefreshing], ([ready, checking,recovering]) => {
  if (!ready && !checking && !recovering && busy.value && (draftRunning.value || rows.value.some(r => ['reading', 'queued', 'arbitrating'].includes(r.state)))) stopWithReason(`会话验证中断：${oa.message.value}`)
})
function changeReference(row: Row): void {
  row.folder.caseVolume = row.folder.caseVolume.trim().toUpperCase()
  row.source = undefined; row.decision = undefined; row.confirmed = false; row.error = ''
  row.draft = undefined
  restoredDrafts.value.delete(row.folder.path)
  row.folder.issues = row.folder.issues.filter(i => !/案号|我方文号/.test(i))
  transition(row, issues(row).length || !validCaseVolume(row.folder.caseVolume) ? 'blocked' : 'ready')
}
function confirmResult(row: Row): void { transition(row, row.confirmed ? 'confirmed' : 'review') }
function showDraftPdf(row: Row): void { if (row.draft?.downloadId !== undefined) chrome.downloads.show(row.draft.downloadId) }
function rowStatus(row: Row): string {
  if (row.draft?.status === 'saved' && !draftErrors.value[row.folder.path]) return '曾保存草稿 · 原站当前状态未核验'
  if (draftActive.value.has(row.folder.path)) return 'eHague 填表中'
  if (draftErrors.value[row.folder.path]) return draftSkipped.value[row.folder.path]?'暂未填写，查看原因':'草稿执行失败，查看原因'
  if (row.draft?.status === 'uncertain') return '草稿步骤待核对'
  if (row.draft?.status === 'stopped' || row.draft?.status === 'running') return '草稿已停止，可继续'
  return STATE_LABELS[row.state]
}
function exportData(): void {
  const data = rows.value.map(r => ({ path: r.folder.path, caseVolume: r.folder.caseVolume, state: r.state, status: STATE_LABELS[r.state], issues: issues(r), error: r.error, confirmed: r.confirmed, requiresPriorityReview: r.decision?.priorities.some(p => p.requiresReview) ?? false, notices: r.folder.notices, filing: r.filing, decision: r.decision, draft:r.draft, images: r.folder.images.map(f => ({ name: f.name, number: imageNumber(f) })) }))
  downloadNamedBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), '海牙申请核对结果.json')
}
</script>

<template>
  <section class="hague-page" :class="{ 'is-dragging': dragging }" @dragenter="onDragEnter" @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
    <PageHead v-if="!embedded" title="海牙新申请" desc="选择总文件夹核对材料与信息，默认 6 路填写草稿，导出图纸与 Summary。" :art="bg('让重复工作变简单.png')">
      <div id="hague-standalone-head-extra" class="workflow-head-extra" />
    </PageHead>
    <Teleport v-if="canTeleport && targetSelector" :to="targetSelector">
      <OaSessionCard :disabled="busy || authenticationRefreshing" automatic platform="WIPO eHague" :tabs="oa.tabs.value" :selected="oa.selected.value" :state="oa.state.value" :message="oa.message.value" :checking="oa.checking.value" :listing="oa.listing.value" @update:selected="oa.selected.value = $event" @verify="verifyOa" @refresh="oa.refresh" @open="oa.open" />
    </Teleport>
    <OaSessionCard v-else-if="!canTeleport" :disabled="busy || authenticationRefreshing" automatic platform="WIPO eHague" :tabs="oa.tabs.value" :selected="oa.selected.value" :state="oa.state.value" :message="oa.message.value" :checking="oa.checking.value" :listing="oa.listing.value" @update:selected="oa.selected.value = $event" @verify="verifyOa" @refresh="oa.refresh" @open="oa.open" />
    <HagueDiagnostics />
    <section class="card hague-prepare">
      <header class="card-head">
        <h2>批量材料准备</h2>
        <span class="hint hague-status" role="status" aria-live="polite">{{ notice || (busy ? '正在处理，请保留此页面…' : (rows.length ? `已识别 ${rows.length} 件案件` : '选择总文件夹自动解析并仲裁')) }}</span>
      </header>
      <div class="toolbar">
        <input ref="filePicker" aria-label="选择海牙申请总文件夹" type="file" webkitdirectory multiple hidden :disabled="busy" @change="upload" />
        <button type="button" class="solid" :disabled="!actions.configure" @click="chooseFolder">选择总文件夹</button>
        <button type="button" class="solid" :disabled="!actions.process" @click="process(pendingRows)">{{ progress?.phase === 'stopped' ? '继续处理剩余案件' : '读取知易通并批量仲裁' }}</button>
        <button type="button" class="ghost" v-if="busy" :disabled="!actions.stop" @click="requestStop">{{ stopping ? '等待当前操作结束…' : draftRunning ? '停止后续写入' : '停止后续处理' }}</button>
        <button type="button" class="ghost" :disabled="busy || !rows.length" @click="exportData">导出核对结果</button>
        <button type="button" class="hague-export-toggle" :class="draftExportReproductions ? 'solid' : 'ghost'" :aria-pressed="draftExportReproductions" :disabled="!actions.configure" v-hint="'在 Summary 前导出原站图纸 PDF'" @click="draftExportReproductions = !draftExportReproductions">
          <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="15" height="15" rx="4" :fill="draftExportReproductions ? 'currentColor' : 'none'" :fill-opacity="draftExportReproductions ? '.18' : '1'" stroke="currentColor" stroke-width="1.5"/><path v-if="draftExportReproductions" d="m6 10 2.6 2.7L14 7.3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <span>导出图纸</span>
        </button>
        <label v-if="draftTransport === 'http'">导出格式 <ThemeSelect v-model="draftExportFormat" :options="draftExportOptions" :disabled="!actions.configure" aria-label="草稿导出格式" /></label>
        <label>填写方式 <ThemeSelect v-model="draftTransport" :options="draftTransportOptions" :disabled="!actions.configure" aria-label="草稿填写方式" /></label>
        <label>草稿并发 <ThemeSelect v-model="draftConcurrency" :options="draftConcurrencyOptions" :disabled="!actions.configure" aria-label="草稿并发路数" /></label>
        <button type="button" class="solid" :disabled="!actions.draft" @click="createDrafts(rows, true)">批量填写并存草稿</button>
        <button v-if="uncertainDraftRows.length" type="button" class="ghost" :disabled="!actions.draft" @click="createDrafts(uncertainDraftRows, true, true)">将异常另建草稿</button>
        <button v-if="rows.some(row=>row.draft)" type="button" class="ghost" :disabled="!actions.draft" @click="createDrafts(rows, true, true)">全部另建草稿</button>
        <button type="button" class="ghost" :disabled="!actions.exportSaved" @click="exportDraftZip">已存草稿打包 ZIP</button>
      </div>
      <p v-if="rows.length" class="hint hague-draft-scope" role="status">本列表 {{ rows.length }} 件 · 本机记录曾保存 {{ savedDraftRows.length }} 件 · 待填写或恢复 {{ unsavedDraftRows.length }} 件<span v-if="restoredSavedCount"> · 本机恢复 {{ restoredSavedCount }} 件已保存记录</span>。本机记录不代表原站当前仍存在，原站当前状态未核验；可确认后再次创建。ZIP 按导出图纸选项打包本列表已保存编号对应的原站图纸和 Summary，包含本机恢复的历史保存记录，不包含待保存案件。材料有修改时，已保存草稿不会自动更新，请先在原站核对。<span v-if="!oa.verified.value">在 eHague 原站登录后会自动检测；多个标签页时请选择对应页面。</span></p>
      <p class="hint">默认 6 路并发，可按需调整为 1–6 路。{{ draftTransport === 'http' ? '新建草稿按顺序确认，填写按所选路数并行；认证切换时自动等待并核对回执。' : '批量填写时每路使用独立标签页，异常页保留供核对。' }}</p>
      <p v-if="busy && progress" class="hint hague-progress-hint">待解析 {{ progress.parsing || 0 }} · 取数 {{ progress.reading || 0 }} · 等待仲裁 {{ progress.queued || 0 }} · 仲裁中案件 {{ progress.arbitrating || 0 }} · 助手批次并发 1</p>
    </section>
    <div v-if="!rows.length && !busy" class="card tone-pink hague-empty" role="region" aria-label="案件材料拖放区">
      <Bunny /><div><h2>先把案件材料放进来吧</h2><p class="hint">一个总文件夹就好，里面可以嵌套多个案件文件夹。</p><p class="hint">每案准备一份定稿 Word，以及 1.1、1.2 这样的编号图片。</p>
        <p class="hint hague-drop-hint">{{ dragging ? '松手即可导入这个文件夹' : '也可以把总文件夹直接拖到这里' }}</p></div>
    </div>
    <SplitScrollPane v-if="rows.length" class="hague-workbench" sidebar-label="案件列表滚动区域" detail-label="案件详情滚动区域" :detail-key="active?.folder.path">
      <template #sidebar><nav class="card hague-cases" aria-label="案件列表"><button v-for="(row, i) in rows" :key="row.folder.path" class="ghost hague-case" :class="{ current: selected === i }" :aria-pressed="selected === i" @click="selected = i"><b>{{ row.folder.caseVolume || '未识别案号' }}</b><small>{{ row.folder.path }}</small><span>{{ rowStatus(row) }} · {{ issues(row).length }} 项材料问题</span></button></nav></template>
      <article v-if="active" class="card hague-detail">
        <h3>{{ active.folder.caseVolume }}</h3>
        <p v-if="draftErrors[active.folder.path]" class="errors card tone-orange">{{ draftErrors[active.folder.path] }}</p>
        <button v-if="active.filing && (!active.draft || active.draft.status === 'saved') && repairRepeatedDesignNumbers(active.filing,active.folder.images)" type="button" class="ghost" :disabled="busy" @click="repairDesignNumbers(active)">按图纸分组修正重复设计编号</button>
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
            <p class="hint">按递交说明填写并保存草稿，按所选设置导出图纸，再生成 Summary 打印文件，完成后交由人工审核。</p>
            <p v-if="draftIssue(active)" class="hint">{{ draftIssue(active) }}</p>
            <p class="hint">导出文件保存至浏览器下载目录，可点击“打开导出文件所在位置”查看。</p>
            <div v-if="active.draft" role="status"><p>WIPO reference：{{ active.draft.reference || '尚未分配' }} · {{ active.draft.next }}/{{ active.draft.total }} 步</p><p>{{ active.draft.stage }}</p><p v-if="active.draft.status === 'saved'" class="hint">以上为本机保存回执，不保证原站当前仍有此草稿；已删除或需要重做时，可点击「再次创建本案草稿」。</p><p v-if="active.draft.error" class="errors">{{ active.draft.error }}</p></div>
            <p v-for="warning in active.draft?.warnings" :key="warning" class="hint">{{ warning }}</p>
            <button v-if="active.draft?.downloadId !== undefined" type="button" class="ghost" @click="showDraftPdf(active)">打开导出文件所在位置</button>
            <button type="button" class="solid" :disabled="!actions.draft || !!draftIssue(active) || (active.draft?.status === 'uncertain' && draftTransport !== 'http')" @click="createDrafts([active])">{{ active.draft?.status === 'saved' ? '再次创建本案草稿' : active.draft?.status === 'uncertain' ? '核对并恢复当前草稿' : active.draft ? '继续当前草稿' : '填写并保存本案草稿' }}</button>
            <button v-if="active.draft && active.draft.status !== 'saved'" type="button" class="ghost" :disabled="!actions.draft || !!draftIssue(active)" @click="createDrafts([active], false, true)">另建本案新草稿（保留旧记录）</button>
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
.hague-prepare .hague-export-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding-inline: 11px; white-space: nowrap; }
.hague-export-toggle svg { width: 17px; height: 17px; flex: 0 0 17px; }

.hague-page { min-width: 0; }
.hague-prepare { min-width: 0; margin-bottom: 14px; }
.hague-prepare .card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.hague-prepare .card-head h2 { margin: 0; font-size: 15px; }
/* 工具栏里的三个下拉：全局 label > .theme-select 会拉满宽度，这里收回成内容宽度并压到与按钮同高。 */
.hague-prepare .toolbar > label { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; }
.hague-prepare .toolbar > label > .theme-select { width: auto; }
.hague-prepare .toolbar :deep(.theme-select-trigger) { min-width: 116px; height: 32px; font-size: 13px; }
.hague-prepare .hague-status { margin: 0; font-size: 12px; color: var(--sub); text-align: right; }
.hague-progress-hint { margin: 8px 0 0; font-size: 12px; color: var(--sub); }
.hague-empty { display: flex; align-items: center; justify-content: center; gap: 20px; padding: 32px 20px; }
.hague-empty :deep(.bunny) { flex: none; width: 86px; height: 86px; object-fit: contain; }
.hague-empty h2 { margin: 0 0 12px; font-size: 16px; }
.hague-drop-hint { margin: 10px 0 0; font-weight: 700; color: var(--pink, #c45b86); }
.hague-page.is-dragging .hague-empty { outline: 2px dashed var(--pink, #ff4f93); outline-offset: -8px; }
.hague-page.is-dragging .hague-prepare { outline: 2px dashed var(--pink, #ff4f93); outline-offset: -6px; }

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
