import type { CustomerQueryProfile } from '../../customer/types'
import type { MailRuleBundle, SelectedPatentFile } from '../../mail/types'
import type { ContentRequest } from '../../shared/message'

export type MailForwardPort = (message: ContentRequest) => Promise<unknown>

export interface MailAccountSnapshot {
  customers: CustomerQueryProfile[]
  rules: MailRuleBundle | null
}

export interface LimitDeadlineRef {
  procId: string
  caseId: string
  caseVolume: string
  ctrlProc?: string
}

export interface DraftMailCommand {
  operatorId: string
  files: SelectedPatentFile[]
  customerName: string
  account: MailAccountSnapshot
}

export type DraftMailResult =
  | {
      ok: true
      letters: number
      subject: string
      body: string
      notes: string[]
      who: string
    }
  | {
      ok: false
      message: string
    }

export interface CheckReviewersCommand {
  operatorId: string
  forward: MailForwardPort
}

export interface SubmitLimitMailCommand {
  operatorId: string
  writeSwitchOpen: boolean
  files: SelectedPatentFile[]
  deadlines: LimitDeadlineRef[]
  caseVolume: string
  account: MailAccountSnapshot
  forward: MailForwardPort
}

export type SubmitLimitMailOutcomeStatus = 'submitted' | 'blocked' | 'held' | 'rejected' | 'failed'

export interface SubmitLimitMailOutcome {
  ok: boolean
  status: SubmitLimitMailOutcomeStatus
  message: string
}
