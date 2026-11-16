import type {DiagnosticErrorData} from './diagnostics/trace'
import type { Applicant, Priority } from './arbitration'
export const HAGUE_DRAFT_CHANNEL = 'PATMAIL_HAGUE_DRAFT'

/** Recover the indexed objects produced when Chrome serializes Proxy arrays. */
export function draftWarnings(value: unknown): string[] {
  if (value == null) return []
  if (typeof value === 'string') return value ? [value] : []
  let values: unknown[]
  if (Array.isArray(value)) values = Array.from(value)
  else if (typeof value === 'object') {
    const entries: Array<[string, unknown]> = Object.entries(value)
    if (entries.some(([key]) => !/^(0|[1-9]\d*)$/.test(key))) return ['历史草稿提示格式异常，请核对原记录。']
    values = entries.sort(([a], [b]) => Number(a) - Number(b)).map(([, item]) => item)
  } else return ['历史草稿提示格式异常，请核对原记录。']
  const notes = values.filter((item): item is string => typeof item === 'string')
  if (notes.length !== values.length) notes.push('历史草稿提示格式异常，请核对原记录。')
  return notes
}

/** Chrome Storage does not preserve Vue/Proxy array identity. Copy all nested
 * checkpoint containers before crossing the API boundary, preserving identity,
 * acknowledgements, plan fingerprints and recovery budgets. */
export function draftCheckpointSnapshot(value: DraftCheckpoint): DraftCheckpoint {
  const generated=value.generatedPriorities
  let priorities:Priority[]|undefined
  if(generated){
    if(Array.isArray(generated))priorities=Array.from(generated)
    else{
      const entries=Object.entries(generated).sort(([a],[b])=>Number(a)-Number(b))
      if(entries.length>10000||entries.some(([key],index)=>key!==String(index)))throw new Error('历史草稿优先权格式异常，请核对原检查点。')
      priorities=entries.map(([,priority])=>priority as Priority)
    }
  }
  return {
    ...value, warnings: draftWarnings(value.warnings),
    ...(value.planIdentity?{planIdentity:{version:value.planIdentity.version,steps:[...value.planIdentity.steps]}}:{}),
    ...(priorities ? { generatedPriorities: priorities.map(priority => ({ ...priority })) } : {}),
    ...(value.recoveryAttempts ? { recoveryAttempts: { ...value.recoveryAttempts } } : {}),
    ...(value.recoveryRetries ? { recoveryRetries: { ...value.recoveryRetries } } : {}),
    ...(value.acknowledged ? { acknowledged: { ...value.acknowledged } } : {}),
    ...(value.recoveryDecision ? { recoveryDecision: { ...value.recoveryDecision } } : {}),
    ...(value.designNumberCorrection ? { designNumberCorrection: { ...value.designNumberCorrection } } : {}),
    ...(value.diagnosticError ? { diagnosticError: { ...value.diagnosticError } } : {}),
  }
}
export type DraftCommand =
  | { op: 'inspect' | 'prepare' | 'create' | 'summary' | 'backToApplication' | 'saveDraft' }
  | { op:'closeDesign';index?:number;count?:number;subclass?:string;product?:string }
  | { op:'print'; caseVolume:string }
  | { op: 'applicant'; data: Applicant; index: number; email: string }
  | { op: 'representative'; data: Applicant & { email: string } }
  | { op: 'parties'; codes: string[] }
  | { op: 'locarno'; value: string }
  | { op: 'design'; index: number; subclass: string; product: string }
  | { op: 'openDesign'; index: number }
  | { op: 'upload'; name: string; base64: string; mime: string; count: number }
  | { op: 'legend'; name: string; label: string }
  | { op: 'description'; text: string }
  | { op: 'creator'; index: number; givenName: string; familyName: string; address: Applicant }
  | { op: 'priority'; index: number; data: Priority }
  | { op: 'publication'; months: number }
  | { op: 'signature'; reference: string; representative: string }
export interface DraftReceipt { summaryKey?:string; diagnosticState?:Pick<DiagnosticErrorData,'httpStatus'|'protocolStatus'|'transportStatus'>; diagnosticError?:DiagnosticErrorData; ok: boolean; error?: string; documentId?: string; reference?: string; page?: 'portfolio'|'application'|'summary'|'other'; applicants?: number; creators?: number; priorities?: number; designs?: number; reproductions?: number; printUrl?: string; downloadId?:number; warnings?: string[]; draftSaved?:boolean }
export interface DraftRecovery { outcome:'completed'|'retry'|'unknown'; receipt?:DraftReceipt; reason?:string; diagnosticError?:DiagnosticErrorData }
export interface DraftCheckpoint { planIdentity?:import('./plan-identity').PlanIdentity; summaryKey?:string; caseRunId?:string;lastTraceId?:string;diagnosticError?:DiagnosticErrorData; transport?: 'http'|'page'; reference?: string; documentId?: string; tabId: number; next: number; total: number; status: 'running'|'stopped'|'uncertain'|'saved'|'failed'; stage: string; error?: string; warnings?:string[]; designNumberCorrection?:{inputKey:string;note:string}; planKey?:string; downloadId?:number; generatedPriorities?:Priority[]; recoveryAttempts?:Record<string,number>; recoveryRetries?:Record<string,number>; acknowledged?:{next:number;op:DraftCommand['op'];page?:DraftReceipt['page']}; recoveryDecision?:{next:number;reference:string;outcome:'retry'} }

