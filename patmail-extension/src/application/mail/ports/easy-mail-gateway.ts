import type { LimitMailSubmitItem, LimitMailSubmitResult } from '../../../customer/limit-mail-submit'

export type CaseFlowGateState = 'open' | 'pending' | 'done' | 'unknown'

export type CaseFlowOutcome =
  | { ok: true; gate: 'open' | 'pending' | 'done' }
  | { ok: false; gate: CaseFlowGateState; message?: string }

export interface ReviewerOption {
  id: string
  name: string
}

export type ReviewerListOutcome =
  | { ok: true; reviewers: ReviewerOption[] }
  | { ok: false; message: string }

export type LimitMailSubmitReceipt =
  | {
      status: 'ok'
      stopped: boolean
      results: LimitMailSubmitResult[]
    }
  | {
      status: 'failed' | 'unknown'
      message: string
    }

/**
 * 邮件域与 EASY 原站通信的网关端口。
 * 应用服务只消费领域化回执，不得直接依赖 Chrome MessageType 或页面桥接细节。
 */
export interface EasyMailGateway {
  readCaseFlow(query: { caseId: string; procId: string }): Promise<CaseFlowOutcome>
  listReviewers(): Promise<ReviewerListOutcome>
  submitLimitMail(request: { operatorId: string; items: LimitMailSubmitItem[] }): Promise<LimitMailSubmitReceipt>
}
