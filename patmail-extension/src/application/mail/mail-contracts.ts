import type { CustomerQueryProfile, PctTaskRow } from '../../customer/types'
import type { PctRecipientMode } from '../../customer/pct-recipients'
import type { AssembledMail, RuleFill } from '../../mail/assemble'
import type { MailRuleBundle, SelectedPatentFile, SelectionSnapshot } from '../../mail/types'
import type { EasyMailGateway } from './ports/easy-mail-gateway'

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

export interface ApplyRulesToDraftCommand {
  customer: CustomerQueryProfile
  files: SelectedPatentFile[]
  rules: MailRuleBundle | null
  operatorId: string
  signatureText?: string
}

export type ApplyRulesToDraftResult = RuleFill

export interface PreviewAssembledMailCommand {
  customer: CustomerQueryProfile | null
  mailTypeId: string
  mailTypeName: string
  files: SelectedPatentFile[]
  to: string
  cc: string
  subject: string
  body: string
  rules?: MailRuleBundle | null
  reviewer?: { userId: string; name: string } | null
  sender?: { mailsetId: string; label: string } | null
}

export type WorkflowBatchPolicy = 'per_row'

export interface PreviewWorkflowRowsCommand {
  rows: PctTaskRow[]
  customers: CustomerQueryProfile[]
  rules: MailRuleBundle | null
  operatorId: string
  signatureText: string
  specials: ReadonlySet<string>
  recipientMode: PctRecipientMode
  sender: { mailsetId: string; label: string } | null
  batchPolicy?: WorkflowBatchPolicy
}

export interface PreviewWorkflowRowItem {
  row: PctTaskRow
  mail: AssembledMail
}

export interface PreviewWorkflowRowsResult {
  ok: boolean
  status: string
  batchPolicy: WorkflowBatchPolicy
  items: PreviewWorkflowRowItem[]
}

export interface PlanSelectionDraftsCommand {
  files: SelectedPatentFile[]
  rules: MailRuleBundle
  customers: CustomerQueryProfile[]
  operatorId: string
  origin: string
  selectedAt?: string
  snapshot?: SelectionSnapshot
}

export interface CheckReviewersCommand {
  operatorId: string
  gateway: EasyMailGateway
}

export interface SubmitLimitMailCommand {
  operatorId: string
  writeSwitchOpen: boolean
  files: SelectedPatentFile[]
  deadlines: LimitDeadlineRef[]
  caseVolume: string
  account: MailAccountSnapshot | (() => Promise<MailAccountSnapshot>)
  gateway: EasyMailGateway
}

export type SubmitLimitMailOutcomeStatus = 'submitted' | 'blocked' | 'held' | 'rejected' | 'unknown' | 'failed'

export interface SubmitLimitMailOutcome {
  ok: boolean
  status: SubmitLimitMailOutcomeStatus
  message: string
}
