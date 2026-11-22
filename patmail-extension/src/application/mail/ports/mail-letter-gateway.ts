import type { FileManageSubmitItem } from '../../../customer/file-manage-submit'
import type { LimitMailSubmitItem, LimitMailSubmitResult } from '../../../customer/limit-mail-submit'

export type DeadlineGates = Record<string, 'open' | 'pending' | 'done'>

export interface MailLetterGateway {
  submitFile(operatorId: string, item: FileManageSubmitItem): Promise<string>
  submitDeadline(
    operatorId: string,
    item: LimitMailSubmitItem,
    gates: DeadlineGates,
  ): Promise<{ text: string; results: LimitMailSubmitResult[] }>
}
