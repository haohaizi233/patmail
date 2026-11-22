import type {
  CaseFlowOutcome,
  EasyMailGateway,
  LimitMailSubmitReceipt,
  ReviewerListOutcome,
} from '../../application/mail/ports/easy-mail-gateway'
import type { LimitMailSubmitItem } from '../../customer/limit-mail-submit'
import { isRecord } from '../../shared/guards'
import { isMessage, MessageType, type ContentRequest } from '../../shared/message'

export type MailForwardPort = (message: ContentRequest) => Promise<unknown>

/** Set by a caller only while it can prove it has not handed off the request. */
export class MailWriteNotDispatched extends Error {}

function forwardErrorText(value: unknown): string | null {
  if (isRecord(value) && typeof value.error === 'string') return value.error
  if (!isMessage(value)) return 'EASY 没有返回可识别的结果。'
  return null
}

/**
 * 将工作台 PageForward（Chrome Message）适配为领域隔离的 EasyMailGateway。
 * 对未知响应与超时写入严格返回 explicit unknown，禁止自动重放写入。
 */
export function createEasyMailGateway(forward: MailForwardPort): EasyMailGateway {
  return {
    async listReviewers(): Promise<ReviewerListOutcome> {
      const found = await forward({ type: MessageType.ListFlowReviewers })
      const error = forwardErrorText(found)
      if (error) return { ok: false, message: error }
      if (!isMessage(found) || found.type !== MessageType.ListFlowReviewersResult) {
        return { ok: false, message: '审核人没有返回。' }
      }
      if (!found.payload.ok) {
        return { ok: false, message: found.payload.error.message }
      }
      return { ok: true, reviewers: found.payload.data.reviewers }
    },

    async readCaseFlow(query: { caseId: string; procId: string }): Promise<CaseFlowOutcome> {
      let gate: unknown
      try {
        gate = await forward({
          type: MessageType.ReadCaseBusFlow,
          payload: { caseId: query.caseId, procId: query.procId },
        })
      } catch {
        return { ok: false, gate: 'unknown', message: '暂时无法核对 EASY 流程状态。' }
      }
      if (isMessage(gate) && gate.type === MessageType.CaseBusFlowResult && gate.payload.ok) {
        return { ok: true, gate: gate.payload.data.gate }
      }
      const message = isRecord(gate) && typeof gate.error === 'string' ? gate.error : undefined
      return {
        ok: false,
        gate: 'pending',
        ...(message !== undefined ? { message } : {}),
      }
    },

    async submitLimitMail(request: {
      operatorId: string
      items: LimitMailSubmitItem[]
    }): Promise<LimitMailSubmitReceipt> {
      let found: unknown
      try {
        found = await forward({
          type: MessageType.SubmitLimitMail,
          payload: { userId: request.operatorId, items: request.items },
        })
      } catch (error) {
        if (error instanceof MailWriteNotDispatched) return { status: 'failed', message: error.message }
        return { status: 'unknown', message: 'EASY 写入回执中断，需先核对原站。' }
      }
      if (isRecord(found) && typeof found.error === 'string') {
        // The bridge uses this envelope both before dispatch and after losing a reply.
        return { status: 'unknown', message: found.error }
      }
      if (!isMessage(found)) {
        return { status: 'unknown', message: 'EASY 没有返回可识别的结果。' }
      }
      if (found.type !== MessageType.SubmitLimitMailResult) {
        return { status: 'unknown', message: '提交没有返回。' }
      }
      return {
        status: 'ok',
        stopped: found.payload.stopped,
        results: found.payload.results,
      }
    },
  }
}
