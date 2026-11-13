import { sanitizeTraceEvent } from './schema.mjs'
import type { TraceEvent } from './trace'

export function safeDiagnosticEvents(input: readonly unknown[]): TraceEvent[] {
  return input.slice(0, 5000).flatMap(raw => {
    const event = sanitizeTraceEvent(raw)
    return event ? [event] : []
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function buildDiagnosticReport(input: readonly unknown[]) {
  const events = safeDiagnosticEvents(input)
  const cases = [...new Set(events.flatMap(e => e.caseRunId ? [e.caseRunId] : []))]
  const alias = (event: TraceEvent) => event.caseRunId ? `案件 ${cases.indexOf(event.caseRunId) + 1}` : '未归属'
  const failure = events.find(e => e.businessStatus === 'rejected' || (e.httpStatus != null && e.httpStatus >= 400) || ['network_error', 'rpc_error', 'timeout', 'aborted'].includes(e.transportStatus ?? '') || ['invalid_xml', 'invalid_mime', 'empty', 'jsf_error', 'jsf_validation_failed', 'unsupported'].includes(e.protocolStatus ?? ''))
  const uncertain = events.filter(e => e.certainty === 'unknown' || ['unknown', 'unconfirmed'].includes(e.businessStatus ?? '') || e.phase === 'step.uncertain')
  const terminal = new Map<string,number>()
  events.forEach((event,index)=>{if(event.traceId&&(event.phase==='step.completed'||event.recoveryDecision==='completed'))terminal.set(event.traceId,index)})
  return {
    version: 1 as const,
    events,
    summary: {
      eventCount: events.length, caseCount: cases.length,
      firstProvenFailure: failure ?? null,
      firstUncertainEvent: uncertain[0] ?? null,
      hasUncertainty: events.some((event,index) => (event.certainty === 'unknown' || ['unknown','unconfirmed'].includes(event.businessStatus ?? '') || event.phase === 'step.uncertain') && (!event.traceId || (terminal.get(event.traceId) ?? -1) <= index)),
      confirmedSuccess: events.some(e => e.businessStatus === 'confirmed' || e.businessStatus === 'completed'),
      cdpMissing: !events.some(e => e.source === 'cdp'),
      sideEffectMayHaveOccurred: events.some(e => e.sideEffectMayHaveOccurred === true),
      recoveryDecision: [...events].reverse().find(e => e.recoveryDecision)?.recoveryDecision ?? 'unknown',
      missingEvidence: [!events.some(e => e.source === 'cdp') ? 'CDP 数据缺失' : '', !events.some(e => e.phase === 'business.validated') ? '业务回执证据缺失' : ''].filter(Boolean),
    },
    timeline: events.map(event => ({ alias: alias(event), event })),
    tree: cases.map(caseRunId => ({ alias: `案件 ${cases.indexOf(caseRunId) + 1}`, caseRunId,
      steps: [...new Set(events.filter(e => e.caseRunId === caseRunId).map(e => e.stepIndex))].map(stepIndex => ({ stepIndex,
        events: events.filter(e => e.caseRunId === caseRunId && e.stepIndex === stepIndex),
      })),
    })),
  }
}

export function exportDiagnostics(input: readonly unknown[], format: 'json' | 'jsonl' | 'markdown', provenance: 'observed' | 'offline-replay' = 'observed'): string {
  const report = buildDiagnosticReport(input)
  if (format === 'jsonl') return report.events.map(e => JSON.stringify(e)).join('\n')
  if (format === 'json') return JSON.stringify({ ...report, provenance }, null, 2)
  return ['# Hague 诊断报告', '', '证据来源：应用内事件 / CDP 事件（各事件 source 字段）；静态分析不是运行结果。',
    `查看来源：${provenance === 'offline-replay' ? '离线回放（不执行业务）' : '观测记录'}`, `事件：${report.summary.eventCount}；案件：${report.summary.caseCount}`, `CDP：${report.summary.cdpMissing ? '数据缺失' : '有观测记录'}`,
    `首个已证明失败：${report.summary.firstProvenFailure?.phase ?? '未采集到'}`, `存在不确定结果：${report.summary.hasUncertainty}`,
    `恢复决定：${report.summary.recoveryDecision}`, '', '| 案件 | 阶段 | HTTP | 协议 | 业务 | 关联置信度 |', '| --- | --- | --- | --- | --- | --- |',
    ...report.timeline.map(({ alias, event: e }) => `| ${alias} | ${e.phase} | ${e.httpStatus ?? '未知'} | ${e.protocolStatus ?? '未知'} | ${e.businessStatus ?? '未知'} | ${e.correlationConfidence ?? (e.source === 'application' ? 'application-trace' : 'unmatched')} |`),
  ].join('\n')
}

