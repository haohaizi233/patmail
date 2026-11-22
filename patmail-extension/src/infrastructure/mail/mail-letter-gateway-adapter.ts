import type { MailLetterGateway } from '../../application/mail/ports/mail-letter-gateway'
import { runFileManageSubmit } from '../../customer/file-manage-submit'
import { runLimitMailSubmit, type LimitMailSubmitResult } from '../../customer/limit-mail-submit'
import type { MessageBridge } from '../../shared/message'

/** Preserve the legacy ledger and read-before-submit policies behind the letter port. */
export function createMailLetterGateway(bridge: MessageBridge): MailLetterGateway {
  return {
    submitFile: (operatorId, item) => runFileManageSubmit(bridge, operatorId, [item]),
    async submitDeadline(operatorId, item, gates) {
      const results: LimitMailSubmitResult[] = []
      const text = await runLimitMailSubmit(bridge, operatorId, [item], gates, result => results.push(result))
      return { text, results }
    },
  }
}
