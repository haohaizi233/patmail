import {
  FILE_MANAGE_BATCH,
  planFileManageLetters,
  senderAddress,
  type FileManageLetterPlan,
} from '../../customer/file-manage-plan'
import { fileIdsOf, fileManageSubmitShouldHalt, type FileManageSubmitItem } from '../../customer/file-manage-submit'
import {
  limitMailItems,
  limitMailLetterLabel,
  limitMailProcIds,
  limitMailSubmitShouldHalt,
  runMailLetterPool,
  selectionNeedsAddressChoice,
  type LimitMailSubmitItem,
  type LimitMailSubmitResult,
} from '../../customer/limit-mail-submit'
import type { MailSender } from '../../customer/mailset'
import type { DeadlineGates, MailLetterGateway } from './ports/mail-letter-gateway'

export const planFileMail = (input: Parameters<typeof planFileManageLetters>[0]) => planFileManageLetters(input)
export const planDeadlineMail = (input: Parameters<typeof limitMailItems>[0]) => limitMailItems(input)
export const fileMailIds = (item: FileManageSubmitItem) => fileIdsOf(item)
export const fileMailSenderAddress = (sender: Parameters<typeof senderAddress>[0]) => senderAddress(sender)
export const deadlineMailIds = (item: Parameters<typeof limitMailProcIds>[0]) => limitMailProcIds(item)
export const deadlineMailLabel = (...args: Parameters<typeof limitMailLetterLabel>) => limitMailLetterLabel(...args)
export const needsDeadlineAddressChoice = (...args: Parameters<typeof selectionNeedsAddressChoice>) =>
  selectionNeedsAddressChoice(...args)

export function prepareFileMail(
  letter: FileManageLetterPlan,
  options: {
    sender: Pick<MailSender, 'id' | 'name' | 'email'> | null
    reviewer: { userId: string; name: string } | null
    signature: FileManageSubmitItem['signature'] | null
    singleFile: boolean
    addresses?: FileManageSubmitItem['addresses']
  },
): FileManageSubmitItem | null {
  const { sender, reviewer, signature } = options
  const fileId = letter.files[0]?.fileId
  if (!sender || !reviewer || !signature || !fileId || !letter.mailTypeId || !letter.subject || letter.blocked)
    return null
  return {
    fileId,
    fileIds: letter.files.map(file => file.fileId),
    fileNames: letter.files.map(file => file.fileName),
    mailTypeId: letter.mailTypeId,
    mailStyle: options.singleFile ? '2' : '1',
    subject: letter.subject,
    senderId: sender.id,
    senderName: sender.name,
    senderEmail: sender.email,
    reviewerId: reviewer.userId,
    reviewerName: reviewer.name,
    signature,
    addresses: options.addresses,
  }
}

export function splitFileMailBatch(items: FileManageSubmitItem[]) {
  return { batch: items.slice(0, FILE_MANAGE_BATCH), overflow: items.slice(FILE_MANAGE_BATCH) }
}

export class MailLetterUseCases {
  constructor(private readonly gateway: MailLetterGateway) {}

  submitFiles(
    operatorId: string,
    items: FileManageSubmitItem[],
    concurrency: number,
    events: {
      start(item: FileManageSubmitItem): void
      receipt(item: FileManageSubmitItem, text: string): Promise<void>
    },
  ) {
    return runMailLetterPool(items, concurrency, async item => {
      events.start(item)
      const text = await this.gateway.submitFile(operatorId, item)
      await events.receipt(item, text)
      return fileManageSubmitShouldHalt(text)
    })
  }

  submitDeadlines(
    operatorId: string,
    items: LimitMailSubmitItem[],
    concurrency: number,
    events: {
      gates(item: LimitMailSubmitItem): DeadlineGates | Promise<DeadlineGates>
      receipt(item: LimitMailSubmitItem, text: string, results: LimitMailSubmitResult[]): void
    },
  ) {
    return runMailLetterPool(items, concurrency, async item => {
      const gates = await events.gates(item)
      const { text, results } = await this.gateway.submitDeadline(operatorId, item, gates)
      events.receipt(item, text, results)
      return limitMailSubmitShouldHalt(text)
    })
  }
}
