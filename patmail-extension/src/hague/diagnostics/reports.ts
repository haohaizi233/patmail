import { sanitizeTraceEvent } from './schema.mjs'
import type { TraceEvent } from './trace'
import { analyzeEvidence } from './evidence/evidence-model.mjs'

export function groupDiagnosticRequests(events: readonly TraceEvent[]) {
  const groups = new Map<string, {id:string;events:TraceEvent[]}>()
  for (const event of events) {
    const id = JSON.stringify([event.sessionId, event.targetId, event.frameId, event.traceId, event.caseRunId, event.stepIndex, event.requestId ?? event.applicationRequestId, event.cdpRequestId])
    const group = groups.get(id) ?? { id, events: [] }
    group.events.push(event); groups.set(id, group)
  }
  return [...groups.values()]
}

export function safeDiagnosticEvents(input: readonly unknown[]): TraceEvent[] {
  return input.slice(0, 5000).flatMap(raw => {
    const event = sanitizeTraceEvent(raw)
    return event ? [event] : []
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
}

export function buildDiagnosticReport(input: readonly unknown[]) {
  const events = safeDiagnosticEvents(input)
  const cases = [...new Set(events.flatMap(e => e.caseRunId ? [e.caseRunId] : []))]
  const aliases = new Map(cases.map((id,index)=>[id,`案件 ${index+1}`]))
  const alias = (event: TraceEvent) => event.caseRunId ? aliases.get(event.caseRunId)! : '未归属'
  const grouped = new Map<string,Map<string,{stepIndex:number|undefined;events:TraceEvent[]}>>()
  for (const event of events) if(event.caseRunId) {
    const steps=grouped.get(event.caseRunId)??new Map<string,{stepIndex:number|undefined;events:TraceEvent[]}>()
    const key=JSON.stringify([event.traceId,event.stepIndex])
    const step=steps.get(key)??{stepIndex:event.stepIndex,events:[]}
    step.events.push(event);steps.set(key,step);grouped.set(event.caseRunId,steps)
  }
  const evidence = groupDiagnosticRequests(events).map(group=>({id:group.id,...analyzeEvidence(group.events)}))
  const authoritative = (event:TraceEvent)=>event.source==='application' && event.phase==='business.validated' && ['confirmed','completed'].includes(event.businessStatus??'') && event.evidenceCodes?.some(code=>['BUSINESS_RECEIPT_VERIFIED','DRAFT_LIST_MATCHED'].includes(code))
  const failure = events.find(e => e.businessStatus === 'rejected' || (e.httpStatus != null && e.httpStatus >= 400) || ['network_error', 'rpc_error', 'timeout', 'aborted'].includes(e.transportStatus ?? '') || ['invalid_xml', 'invalid_mime', 'empty', 'jsf_error', 'jsf_validation_failed', 'unsupported'].includes(e.protocolStatus ?? ''))
  const uncertain = events.filter(e => e.certainty === 'unknown' || ['unknown', 'unconfirmed'].includes(e.businessStatus ?? '') || e.phase === 'step.uncertain')
  const terminal = new Map<string,number>()
  const stepIdentity=(event:TraceEvent)=>JSON.stringify([event.caseRunId,event.traceId,event.stepIndex])
  events.forEach((event,index)=>{if(event.traceId&&authoritative(event))terminal.set(stepIdentity(event),index)})
  const fingerprints = [...new Set(events.flatMap(e => e.protocolFingerprint ? [e.protocolFingerprint] : []))]
  // A failed body/XML analysis has no jsf.parsed event, but still prevents a
  // complete comparison. Successful body companions and AST skips do not.
  const missingObservation = (event: TraceEvent) => (event.phase === 'body.observed' && event.bodyStatus !== 'body_available') || (event.phase === 'analysis.skipped' && event.analysisKind === 'xml')
  const observations = events.filter(e => e.phase === 'jsf.parsed' || e.driftStatus || (e.protocolFingerprint && e.phase !== 'protocol.analyzed') || missingObservation(e))
  const compared = (event: TraceEvent) => event.driftCompared === true && !!event.baselineVersion && ['no_drift', 'drift_detected'].includes(event.driftStatus ?? '')
  const baselineVersions = [...new Set(observations.flatMap(e => e.baselineVersion ? [e.baselineVersion] : []))].sort()
  const statuses = observations.map(e => missingObservation(e) ? 'unresolved' : compared(e) ? e.driftStatus : e.baselineVersion || (e.driftStatus && e.driftStatus !== 'baseline_missing') ? 'unresolved' : 'baseline_missing')
  const driftPartial = baselineVersions.length > 1 || statuses.some(status => status === 'unresolved' || status === 'baseline_missing')
  const driftStatus = statuses.includes('drift_detected') ? 'drift_detected'
    : !statuses.length || statuses.every(status => status === 'baseline_missing') ? 'baseline_missing'
      : driftPartial ? 'unresolved' : 'no_drift'
  const baselineVersion = baselineVersions.length === 1 ? baselineVersions[0] : undefined

  return {
    version: 1 as const,
    events,
    evidence,
    summary: {
      eventCount: events.length, caseCount: cases.length,
      firstProvenFailure: failure ?? null,
      firstUncertainEvent: uncertain[0] ?? null,
      hasUncertainty: events.some((event,index) => (event.certainty === 'unknown' || ['unknown','unconfirmed'].includes(event.businessStatus ?? '') || event.phase === 'step.uncertain') && (!event.traceId || (terminal.get(stepIdentity(event)) ?? -1) <= index)),
      confirmedSuccess: events.some(authoritative),
      cdpMissing: !events.some(e => e.source === 'cdp'),
      sideEffectMayHaveOccurred: events.some(e => e.sideEffectMayHaveOccurred === true),
      recoveryDecision: [...events].reverse().find(e => e.recoveryDecision)?.recoveryDecision ?? 'unknown',
      missingEvidence: [!events.some(e => e.source === 'cdp') ? 'CDP 数据缺失' : '', !events.some(authoritative) ? '权威业务回执证据缺失' : ''].filter(Boolean),
      protocolFingerprints: fingerprints,
      driftStatus,
      driftPartial,
      baselineVersions,
      baselineVersion: baselineVersion ?? null
    },
    timeline: events.map(event => ({ alias: alias(event), event })),
    tree: [...grouped].map(([caseRunId,steps]) => ({ alias: aliases.get(caseRunId)!, caseRunId,
      steps: [...steps.values()].map(step=>({...step,requests:groupDiagnosticRequests(step.events),evidence:analyzeEvidence(step.events,{traceId:step.events[0]?.traceId,caseRunId,stepIndex:step.stepIndex})})),
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
    `协议指纹：${report.summary.protocolFingerprints.join(', ') || '未采集'}；漂移状态：${report.summary.driftStatus}`,
    `基线版本：${report.summary.baselineVersions.join(', ') || '无'}；部分或不可比结论：${report.summary.driftPartial}`,
    `恢复决定：${report.summary.recoveryDecision}`, '', '| 案件 | 阶段 | HTTP | 协议 | 业务 | 关联置信度 |', '| --- | --- | --- | --- | --- | --- |',
    ...report.timeline.map(({ alias, event: e }) => `| ${alias} | ${e.phase} | ${e.httpStatus ?? '未知'} | ${e.protocolStatus ?? '未知'} | ${e.businessStatus ?? '未知'} | ${e.correlationConfidence ?? (e.source === 'application' ? 'application-trace' : 'unmatched')} |`),
    '', '## 分层证据与缺失证据', ...report.evidence.map(item=>item.explanation),
  ].join('\n')
}

