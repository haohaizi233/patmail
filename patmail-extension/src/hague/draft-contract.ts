import type { Applicant, Priority } from './arbitration'
export const HAGUE_DRAFT_CHANNEL = 'PATMAIL_HAGUE_DRAFT'
export type DraftCommand =
  | { op: 'inspect' | 'prepare' | 'create' | 'closeDesign' | 'summary' | 'backToApplication' | 'saveDraft' }
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
export interface DraftReceipt { ok: boolean; error?: string; documentId?: string; reference?: string; page?: 'portfolio'|'application'|'summary'|'other'; applicants?: number; creators?: number; priorities?: number; designs?: number; reproductions?: number; printUrl?: string; downloadId?:number; warnings?: string[]; draftSaved?:boolean }
export interface DraftCheckpoint { reference?: string; documentId?: string; tabId: number; next: number; total: number; status: 'running'|'stopped'|'uncertain'|'saved'|'failed'; stage: string; error?: string; warnings?:string[]; planKey?:string; downloadId?:number; generatedPriorities?:Priority[] }
