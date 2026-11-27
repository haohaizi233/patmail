import type { ExpectedAccountScope } from '../shared/connection'

export type FeeReduceCheckpointPhase = 'creating' | 'draft' | 'submitting'
export type FeeReduceCheckpoint = (phase: FeeReduceCheckpointPhase, filingId?: string) => Promise<void>

export type FeeReduceCaseInspectState =
  | 'completed'
  | 'ready'
  | 'not_found'
  | 'missing_proc'
  | 'other_status'
  | 'error'

export interface FeeReduceCaseInspectItem {
  caseVolume: string
  caseId: string
  caseName: string
  appNo: string
  procId: string
  procName: string
  procStatus: string
  state: FeeReduceCaseInspectState
  reason: string
}

export interface FeeReduceInspectResult {
  items: FeeReduceCaseInspectItem[]
}

export interface FeeReduceReviewerOption {
  userId: string
  name: string
  count: number | null
}

export type FeeReduceReviewerStrategy = 'first' | 'least_busy' | 'specific'

export interface FeeReduceReviewersResult {
  reviewers: FeeReduceReviewerOption[]
  nodeName: string
  message: string
}

export interface FeeReduceSubmitRequest {
  caseVolume: string
  caseId: string
  procId: string
  oaName?: string
  remark?: string
  reviewerStrategy?: FeeReduceReviewerStrategy
  defaultReviewerId?: string
  overrideReviewerId?: string
  resumeFilingId?: string
  expectedScope?: ExpectedAccountScope
}

interface FeeReduceFiledResult {
  outcome?: 'submitted'
  caseVolume: string
  caseId: string
  procId: string
  filingId: string
  reviewerId: string
  reviewerName: string
  convertedFiles: string[]
  warnings: string[]
  message: string
}

export type FeeReduceSubmitResult = FeeReduceFiledResult | {
  outcome: 'already_completed'
  caseVolume: string
  caseId: string
  procId: string
  procStatus: '完成' | '递交中'
  message: string
}
