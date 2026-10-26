import { emptyMailRules } from '../../src/mail/repository'
import type { MailRuleBundle } from '../../src/mail/types'

export const userA = 'aaaaaaaa-1111-4111-8111-111111111111'
export const userB = 'bbbbbbbb-1111-4111-8111-111111111111'

export function mailRuleBundle(overrides: Partial<MailRuleBundle> = {}): MailRuleBundle {
  return { ...emptyMailRules(overrides.ownerId ?? userA), ...overrides }
}
