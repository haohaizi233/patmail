import { recoveryLedger, rememberRecovery, type RecoverySlot } from './wal-ledger'
import { yieldToMain } from '../utils/idle'

const PREFIXES: Array<[string, RecoverySlot]> = [
  ['patmail.workflow.exec.v1:', 'workflow-exec'],
  ['patmail.mail.exec.v1:', 'mail-exec']
]

/** 把已经写在扩展本地的流程执行记录再抄进恢复账本。登录掉了本地还在时，这一步只是多留一份。 */
export async function mirrorLocalExecutions(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  const stored = await chrome.storage.local.get(null)
  let mirrored = 0
  for (const [prefix, slot] of PREFIXES) {
    for (const [key, value] of Object.entries(stored)) {
      if (!key.startsWith(prefix) || value == null) continue
      await rememberRecovery(slot, key, value)
      // 抄档是启动那一瞬的活，抄一段让一让，别把首屏压在整批底下。
      mirrored += 1
      if (mirrored % 20 === 0) await yieldToMain()
    }
  }
}

/** 本地那份丢了时，用账本里的记录补回去。已经有的不覆盖。 */
export async function restoreLocalExecutions(): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return
  const ledger = await recoveryLedger()
  if (!ledger) return
  let restored = 0
  for (const [, slot] of PREFIXES) {
    for (const head of await ledger.heads(slot)) {
      if (!head.scope.startsWith('patmail.')) continue
      const current = await chrome.storage.local.get(head.scope)
      if (current[head.scope] == null) {
        await chrome.storage.local.set({ [head.scope]: head.payload })
        restored += 1
        if (restored % 20 === 0) await yieldToMain()
      }
    }
  }
}
