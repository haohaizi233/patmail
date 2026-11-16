<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { restoreDiagnosticEvents, clearDiagnosticEvents, getDiagnosticEvents, getResearchStatus, getCollectorStats, isDiagnosticModeEnabled, setDiagnosticMode, subscribeDiagnostics } from '../../hague/diagnostics/store'
import { buildDiagnosticReport, exportDiagnostics } from '../../hague/diagnostics/reports'
import { replayDiagnostics } from '../../hague/diagnostics/replay'
import { diffFingerprints, fingerprintProtocol } from '../../hague/diagnostics/fingerprint'
import type { TraceEvent } from '../../hague/diagnostics/trace'
import { analyzeEvidence } from '../../hague/diagnostics/evidence/evidence-model.mjs'

void restoreDiagnosticEvents()
const panelOpen = ref(false)
const enabled = ref(isDiagnosticModeEnabled())
const events = shallowRef(getDiagnosticEvents())
const researchStatus = ref(getResearchStatus())
const collectorStats = ref(getCollectorStats())
const featureState = computed(()=>{const status=researchStatus.value;if(!status)return{ast:'未采集',jsf:'未采集',correlation:'未采集'};const running=status.researchState==='enabled';return{ast:running&&['deep','research'].includes(status.mode??'')?'Enabled':'Disabled',jsf:running&&status.mode==='research'?'Enabled':'Disabled',correlation:running&&status.mode==='research'?'Enabled':'Disabled'}})
const filterKeys = ['operation','caseRunId','phase','httpStatus','errorStage','correlationConfidence','businessStatus'] as const
const filters = ref<Record<string,string>>({})
const page = ref(0)
const expandedCases = ref(new Set<string>())
const expandedRequests = ref(new Set<string>())
function trackOpen(event: Event, key: string, expanded: Set<string>) {
  if ((event.target as HTMLDetailsElement).open) expanded.add(key)
  else expanded.delete(key)
}
const replay = shallowRef<TraceEvent[] | null>(null)
const selected = shallowRef<TraceEvent | null>(null)
const replayError = ref('')
const report = computed(() => buildDiagnosticReport(replay.value ?? events.value))
const filteredTimeline = computed(()=>report.value.timeline.filter(({event})=>filterKeys.every(key=>!filters.value[key] || String(event[key]??'')===filters.value[key])))
const pageCount = computed(()=>Math.max(1,Math.ceil(filteredTimeline.value.length/200)))
const currentPage = computed(()=>Math.min(page.value,pageCount.value-1))
const visibleTimeline = computed(()=>filteredTimeline.value.slice(currentPage.value*200,(currentPage.value+1)*200))
const filterOptions = computed(()=>Object.fromEntries(filterKeys.map(key=>[key,[...new Set(report.value.events.flatMap(event=>event[key]===undefined?[]:[String(event[key])]))]])))
const selectedEvidence = computed(()=>selected.value ? analyzeEvidence(report.value.events,selected.value) : null)
const statLabels = {observedRequests:'已观测请求',analyzedScripts:'已分析脚本',astCalls:'AST 调用',parsedResponses:'已解析 JSF 响应',exactCorrelations:'AST 源码精确关联',probableCorrelations:'AST 源码可能关联',ambiguousCorrelations:'AST 源码歧义关联',unmatchedEvents:'AST 源码未匹配',droppedDiagnostics:'丢弃的诊断事件'} as const
const astEvents = computed(() => report.value.events.filter(e => e.phase === 'protocol.analyzed' || e.astCallType))
const astTypes = computed(() => [...new Set(astEvents.value.map(e => e.astCallType ?? 'unresolved'))].map(type => ({ type, count: astEvents.value.filter(e => (e.astCallType ?? 'unresolved') === type).length })))
const fingerprintChange = computed(() => {
  const structures = report.value.events.filter(e => e.before || e.after)
  const first = structures[0]?.before
  const last = structures.at(-1)?.after
  if (!first || !last) return null
  return diffFingerprints(fingerprintProtocol({ forms: first.forms, components: first.components }), fingerprintProtocol({ forms: last.forms, components: last.components }))
})
const stop = subscribeDiagnostics(next => { events.value = next as TraceEvent[]; enabled.value = isDiagnosticModeEnabled(); researchStatus.value = getResearchStatus(); collectorStats.value = getCollectorStats() })
onBeforeUnmount(stop)
function toggle(event: Event) { enabled.value = (event.target as HTMLInputElement).checked; setDiagnosticMode(enabled.value) }
function download(format: 'json' | 'jsonl' | 'markdown') {
  const content = exportDiagnostics(report.value.events, format, replay.value ? 'offline-replay' : 'observed')
  const url = URL.createObjectURL(new Blob([content], { type: format === 'markdown' ? 'text/markdown' : 'application/json' }))
  const link = document.createElement('a'); link.href = url; link.download = `hague-${replay.value ? 'offline-replay' : 'diagnostics'}.${format === 'markdown' ? 'md' : format}`; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function importReplay(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  replayError.value = ''
  if (file.size > 2_000_000) { replayError.value = '回放文件超过上限'; return }
  try { replay.value = replayDiagnostics(await file.text()).report.events; selected.value = null }
  catch { replayError.value = '回放数据无效、版本不支持或超过上限' }
}
</script>

<template>
  <details class="hague-diagnostics" @toggle.self="panelOpen = ($event.target as HTMLDetailsElement).open">
    <summary>协议诊断 · {{ (replay ?? events).length }} 个事件</summary>
    <div v-if="panelOpen" class="diagnostic-content">
      <label><input type="checkbox" :checked="enabled" @change="toggle"> 应用内诊断采集</label>
      <p>应用内脱敏诊断默认开启，可手动关闭。此开关不会开启 CDP 深度脚本读取；研究模式随已授权 CDP 服务开启。事件仅保留结构信息。</p>
      <p role="status">{{ replay ? '离线回放 · 仅重建分析状态，不执行业务请求' : '当前应用观测记录' }} · {{ report.summary.cdpMissing ? 'CDP 数据缺失' : '存在 CDP 观测记录' }}</p>
      <p data-testid="research-status">最近服务状态：模式 {{ researchStatus?.mode ?? '未采集' }} · 研究 {{ researchStatus?.researchState ?? '未采集' }} · 连接 {{ researchStatus?.observerState ?? '未采集' }} · {{ researchStatus?.timestamp ?? '未采集' }}</p>
      <p>Target：{{ researchStatus?.targetId ?? '未指定研究目标' }} · AST：{{ featureState.ast }} · JSF Parser：{{ featureState.jsf }} · Correlation：{{ featureState.correlation }}</p>
      <p>以下统计来自服务状态记录；应用诊断开关独立控制应用内事件采集。</p>
      <p>应用采集器：{{ collectorStats.events }} 个事件 · {{ collectorStats.bytes }} 字节 · 丢弃 {{ collectorStats.droppedEvents }} 个事件。已验证成功表示存在已验证动作，整批结果须逐案件/步骤查看。</p>
      <dl class="research-stats"><template v-for="(label,key) in statLabels" :key="key"><dt>{{ label }}</dt><dd>{{ researchStatus?.stats?.[key] ?? '未采集' }}</dd></template></dl>
      <div class="diagnostic-actions">
        <button v-for="format in (['jsonl', 'json', 'markdown'] as const)" :key="format" type="button" @click="download(format)">导出 {{ format }}</button>
        <label>离线回放 <input type="file" accept=".json,.jsonl" @change="importReplay"></label>
        <button v-if="replay" type="button" @click="replay = null; selected = null">返回当前观测</button>
        <button type="button" @click="clearDiagnosticEvents(); selected = null">清空应用记录</button>
      </div>
      <p v-if="replayError" role="alert">{{ replayError }}</p>
      <h4>故障与证据</h4>
      <p>首个可证明失败：{{ report.summary.firstProvenFailure?.phase ?? '未采集到' }} <template v-if="report.summary.firstProvenFailure">· 步骤 {{ report.summary.firstProvenFailure.stepIndex ?? '未知' }} · {{ report.summary.firstProvenFailure.operation ?? '未标记动作' }}</template>；首个不确定事件：{{ report.summary.firstUncertainEvent?.phase ?? '未采集到' }}</p>
      <p>远端副作用：{{ report.summary.sideEffectMayHaveOccurred ? '可能发生，须核对' : '无充分证据确认' }}；恢复决定：{{ report.summary.recoveryDecision }}</p>
      <p>{{ report.summary.missingEvidence.join('；') }}。如有不确定写入，请在 WIPO Draft(s) / Summary 核对现有检查点，避免重复提交。</p>
      <h4>请求时间线</h4>
      <div class="diagnostic-actions"><label v-for="key in filterKeys" :key="key">{{ key }} <select v-model="filters[key]" :aria-label="key" @change="page = 0"><option value="">全部</option><option v-for="value in filterOptions[key]" :key="value" :value="value">{{ value }}</option></select></label></div>
      <p>{{ filteredTimeline.length }} 个匹配事件 · 第 {{ currentPage + 1 }} / {{ pageCount }} 页（每页最多 200） <button type="button" :disabled="currentPage === 0" @click="page = currentPage - 1">上一页</button> <button type="button" :disabled="currentPage + 1 >= pageCount" @click="page = currentPage + 1">下一页</button></p>
      <p>窄屏可横向滚动表格查看协议、业务状态与关联证据。</p>
      <div class="diagnostic-scroll"><table>
        <thead><tr><th>案件 / 步骤</th><th>时间 / 耗时</th><th>阶段 / 请求</th><th>HTTP / 类型</th><th>协议 / 业务</th><th>证据关联</th></tr></thead>
        <tbody><tr v-for="({alias, event}, index) in visibleTimeline" :key="index">
          <td>{{ alias }} / {{ event.stepIndex ?? '—' }}</td><td>{{ new Date(event.timestamp).toISOString() }} / {{ event.durationMs ?? '—' }} ms</td>
          <td><button type="button" @click="selected = event">{{ event.phase }}</button> {{ event.httpMethod }} {{ event.urlPath }}</td>
          <td>{{ event.httpStatus ?? '未知' }} / {{ event.responseType ?? '未知' }}</td><td>{{ event.protocolStatus ?? '未知' }} / {{ event.businessStatus ?? '未知' }}</td>
          <td>{{ event.source }} / {{ event.correlationConfidence ?? (event.source === 'application' ? '应用内 Trace' : 'unmatched') }}</td>
        </tr></tbody>
      </table></div>
      <details v-if="selected" open><summary>请求详情 · {{ selected.phase }}</summary><p>仅显示允许列表字段。AST 静态结论不代表业务执行成功。</p><p>{{ selectedEvidence?.explanation }}</p><p>application_model 是应用模型，expected_only 是协议预期；真实 DOM 变化须有同文档前后数值证据。</p><ul><li v-for="missing in selectedEvidence?.missingEvidence" :key="missing">{{ missing }}</li></ul><pre>{{ JSON.stringify(selected, null, 2) }}</pre></details>
      <h4>批次执行树（本次已采集记录）</h4>
      <details v-for="item in report.tree" :key="item.caseRunId" @toggle.stop="trackOpen($event, item.caseRunId, expandedCases)"><summary>{{ item.alias }}</summary>
        <template v-if="expandedCases.has(item.caseRunId)"><details v-for="(step,stepNumber) in item.steps" :key="stepNumber"><summary>步骤 {{ step.stepIndex ?? '未标记' }}</summary><p>{{ step.evidence.explanation }}</p>
          <details v-for="request in step.requests" :key="request.id" @toggle.stop="trackOpen($event, request.id, expandedRequests)"><summary>{{ request.events[0]?.requestId ?? request.events[0]?.cdpRequestId ?? '步骤证据（未发生或未标记请求）' }}</summary>
            <ul v-if="expandedRequests.has(request.id)"><li v-for="(event, index) in request.events.slice(0,200)" :key="index"><button type="button" @click="selected = event">{{ event.phase }}</button> · {{ event.protocolStatus }} · {{ event.businessStatus }}</li><li v-if="request.events.length > 200">更多记录可通过时间线筛选和导出查看。</li></ul>
          </details>
        </details></template>
      </details>
      <h4>AST 协议分析</h4>
      <p>已采集调用：{{ astEvents.length }} <span v-for="type in astTypes" :key="type.type"> · {{ type.type }}: {{ type.count }}</span></p>
      <ul><li v-for="(event, index) in astEvents.slice(0, 200)" :key="index"><button type="button" @click="selected = event">{{ event.astCallType ?? 'unresolved' }}</button> · {{ event.astConfidence ?? '未标记置信度' }} · 源码边 {{ event.astCorrelationConfidence ?? 'unmatched' }} · {{ event.sourceLocation?.scriptHash ?? '脚本未采集' }}:{{ event.sourceLocation?.line ?? '—' }}:{{ event.sourceLocation?.column ?? '—' }} · 组件 {{ event.sourceComponent ?? '未采集' }} · 参数名称 {{ event.parameterNames?.join(', ') ?? '未采集' }}</li></ul>
      <p>本次首尾结构指纹：{{ fingerprintChange ? (fingerprintChange.changed ? '存在结构变化' : '未检测到结构变化') : '快照证据不足' }}。仅比较已采集表单与组件，不推断协议兼容。</p>
      <pre v-if="fingerprintChange?.changed">{{ JSON.stringify(fingerprintChange, null, 2) }}</pre>
      <p>在请求详情查看已采集的 analysis 元数据、脚本位置、调用类型、组件依赖、置信度与 unresolved 原因。无元数据表示未采集，不能推断页面不存在调用。协议指纹与差异通过离线分析模块生成；当前面板不读取页面脚本。</p>
    </div>
  </details>
</template>

<style scoped>
.hague-diagnostics { margin: 12px 0; padding: 12px 16px; border: 1px solid var(--border, #ddd); border-radius: 8px; font-size: 12px; }
summary { cursor: pointer; font-weight: 600; }
.diagnostic-content { margin-top: 12px; }
.diagnostic-actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.research-stats { display: flex; flex-wrap: wrap; gap: 8px; } .research-stats dd { margin: 0 12px 0 0; }
.diagnostic-scroll { overflow-x: auto; max-height: 360px; }
table { border-collapse: collapse; width: 100%; min-width: 1100px; text-align: left; }
td, th { padding: 6px; border-bottom: 1px solid var(--border, #ddd); }
pre { overflow: auto; max-height: 360px; white-space: pre-wrap; overflow-wrap: anywhere; }
h4 { margin: 14px 0 6px; }
</style>
