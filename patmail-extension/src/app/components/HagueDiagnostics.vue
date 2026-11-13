<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { restoreDiagnosticEvents, clearDiagnosticEvents, getDiagnosticEvents, isDiagnosticModeEnabled, setDiagnosticMode, subscribeDiagnostics } from '../../hague/diagnostics/store'
import { buildDiagnosticReport, exportDiagnostics } from '../../hague/diagnostics/reports'
import { replayDiagnostics } from '../../hague/diagnostics/replay'
import { diffFingerprints, fingerprintProtocol } from '../../hague/diagnostics/fingerprint'
import type { TraceEvent } from '../../hague/diagnostics/trace'

void restoreDiagnosticEvents()
const enabled = ref(isDiagnosticModeEnabled())
const events = ref(getDiagnosticEvents())
const replay = ref<TraceEvent[] | null>(null)
const selected = ref<TraceEvent | null>(null)
const replayError = ref('')
const report = computed(() => buildDiagnosticReport(replay.value ?? events.value))
const astEvents = computed(() => report.value.events.filter(e => e.phase === 'protocol.analyzed' || e.astCallType))
const astTypes = computed(() => [...new Set(astEvents.value.map(e => e.astCallType ?? 'unresolved'))].map(type => ({ type, count: astEvents.value.filter(e => (e.astCallType ?? 'unresolved') === type).length })))
const fingerprintChange = computed(() => {
  const structures = report.value.events.filter(e => e.before || e.after)
  const first = structures[0]?.before
  const last = structures.at(-1)?.after
  if (!first || !last) return null
  return diffFingerprints(fingerprintProtocol({ forms: first.forms, components: first.components }), fingerprintProtocol({ forms: last.forms, components: last.components }))
})
function requests(input: TraceEvent[]) {
  const keys = [...new Set(input.map(e => e.requestId ?? e.cdpRequestId ?? 'step'))]
  return keys.map(id => ({ id, events: input.filter(e => (e.requestId ?? e.cdpRequestId ?? 'step') === id) }))
}
const stop = subscribeDiagnostics(() => { events.value = getDiagnosticEvents(); enabled.value = isDiagnosticModeEnabled() })
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
  <details class="hague-diagnostics">
    <summary>协议诊断 · {{ report.summary.eventCount }} 个事件</summary>
    <div class="diagnostic-content">
      <label><input type="checkbox" :checked="enabled" @change="toggle"> 应用内诊断采集</label>
      <p>默认关闭。此开关不会开启 CDP 深度脚本读取；深度采集须独立明确授权。事件仅保留结构信息。</p>
      <p role="status">{{ replay ? '离线回放 · 仅重建分析状态，不执行业务请求' : '当前应用观测记录' }} · {{ report.summary.cdpMissing ? 'CDP 数据缺失' : '存在 CDP 观测记录' }}</p>
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
      <p>窄屏可横向滚动表格查看协议、业务状态与关联证据。</p>
      <div class="diagnostic-scroll"><table>
        <thead><tr><th>案件 / 步骤</th><th>时间 / 耗时</th><th>阶段 / 请求</th><th>HTTP / 类型</th><th>协议 / 业务</th><th>证据关联</th></tr></thead>
        <tbody><tr v-for="({alias, event}, index) in report.timeline" :key="index">
          <td>{{ alias }} / {{ event.stepIndex ?? '—' }}</td><td>{{ new Date(event.timestamp).toISOString() }} / {{ event.durationMs ?? '—' }} ms</td>
          <td><button type="button" @click="selected = event">{{ event.phase }}</button> {{ event.httpMethod }} {{ event.urlPath }}</td>
          <td>{{ event.httpStatus ?? '未知' }} / {{ event.responseType ?? '未知' }}</td><td>{{ event.protocolStatus ?? '未知' }} / {{ event.businessStatus ?? '未知' }}</td>
          <td>{{ event.source }} / {{ event.correlationConfidence ?? (event.source === 'application' ? '应用内 Trace' : 'unmatched') }}</td>
        </tr></tbody>
      </table></div>
      <details v-if="selected" open><summary>请求详情 · {{ selected.phase }}</summary><p>仅显示允许列表字段。AST 静态结论不代表业务执行成功。</p><pre>{{ JSON.stringify(selected, null, 2) }}</pre></details>
      <h4>批次执行树（本次已采集记录）</h4>
      <details v-for="item in report.tree" :key="item.caseRunId"><summary>{{ item.alias }}</summary>
        <details v-for="step in item.steps" :key="step.stepIndex"><summary>步骤 {{ step.stepIndex ?? '未标记' }}</summary>
          <details v-for="request in requests(step.events)" :key="request.id"><summary>{{ request.id === 'step' ? '步骤证据（未发生或未标记请求）' : request.id }}</summary>
            <ul><li v-for="(event, index) in request.events" :key="index"><button type="button" @click="selected = event">{{ event.phase }}</button> · {{ event.protocolStatus }} · {{ event.businessStatus }}</li></ul>
          </details>
        </details>
      </details>
      <h4>AST 协议分析</h4>
      <p>已采集调用：{{ astEvents.length }} <span v-for="type in astTypes" :key="type.type"> · {{ type.type }}: {{ type.count }}</span></p>
      <ul><li v-for="(event, index) in astEvents" :key="index"><button type="button" @click="selected = event">{{ event.astCallType ?? 'unresolved' }}</button> · {{ event.astConfidence ?? '未标记置信度' }} · {{ event.sourceLocation?.scriptHash ?? '脚本未采集' }}:{{ event.sourceLocation?.line ?? '—' }}:{{ event.sourceLocation?.column ?? '—' }} · 组件 {{ event.sourceComponent ?? '未采集' }} · 参数名称 {{ event.parameterNames?.join(', ') ?? '未采集' }}</li></ul>
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
.diagnostic-scroll { overflow-x: auto; max-height: 360px; }
table { border-collapse: collapse; width: 100%; min-width: 1100px; text-align: left; }
td, th { padding: 6px; border-bottom: 1px solid var(--border, #ddd); }
pre { overflow: auto; max-height: 360px; white-space: pre-wrap; overflow-wrap: anywhere; }
h4 { margin: 14px 0 6px; }
</style>
