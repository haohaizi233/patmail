import { MailLetterUseCases } from '../../application/mail/mail-letter-usecases'
import { createMailLetterGateway } from '../../infrastructure/mail/mail-letter-gateway-adapter'
import type { MessageBridge } from '../../shared/message'

export function useMailSubmission(bridge: MessageBridge): MailLetterUseCases {
  return new MailLetterUseCases(createMailLetterGateway(bridge))
}
