import type { EasyConnectionContext } from '../shared/connection'
import { trustedOrigin } from '../api/config'
import { indexedRecoveryStore, isSlot, openRecoveryLedger, type RecoveryLedger } from '../recovery/wal-ledger'
import { RECOVERY_RPC, type RecoveryReply, type RecoveryRequest } from '../recovery/client'

/** The only production SQLite writer. Cold replay and every read/write share this queue. */
export class RecoveryAuthority {
  private ledger: Promise<RecoveryLedger> | undefined
  private chain: Promise<void> = Promise.resolve()
  constructor(private readonly open: () => Promise<RecoveryLedger>) {}
  dispatch(request: RecoveryRequest): Promise<RecoveryReply> {
    const run = this.chain.then(async () => {
      this.ledger ??= this.open().catch(error => { this.ledger = undefined; throw error })
      const ledger = await this.ledger
      if (request.op === 'checkpoint') { await ledger.checkpoint(); return {} }
      if (!request.slot || !isSlot(request.slot)) throw new Error('恢复槽位无效。')
      const slot = request.slot
      if (request.op === 'heads') return { payload: await ledger.heads(slot) }
      if (request.op === 'latest') return { payload: await ledger.latest(slot) }
      if (typeof request.scope !== 'string' || !request.scope || request.scope.length > 16384) throw new Error('恢复范围无效。')
      if (request.op === 'put') {
        if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision! < 0) throw new Error('缺少恢复版本。')
        await ledger.put(slot, request.scope, request.payload, request.expectedRevision)
      } else if (request.op !== 'get') throw new Error('恢复操作无效。')
      return { payload: await ledger.get(slot, request.scope), revision: await ledger.revision(slot, request.scope) }
    })
    this.chain = run.then(() => undefined, () => undefined)
    return run
  }
}
const authority = new RecoveryAuthority(async () => {
  const store = indexedRecoveryStore()
  if (!store) throw new Error('恢复账本不可用。')
  return openRecoveryLedger(store)
})
export const dispatchRecoveryRequest = (request: RecoveryRequest) => authority.dispatch(request)
/** Return false for other messages; respond asynchronously only to our validated extension-page RPC. */
export function handleRecoveryMessage(message: unknown, sender: chrome.runtime.MessageSender, sendResponse: (reply: unknown) => void, connection?: EasyConnectionContext): boolean {
  if (!message || typeof message !== 'object' || (message as { type?: unknown }).type !== RECOVERY_RPC) return false
  const ownUrl = chrome.runtime.getURL('')
  const request = (message as { request?: unknown }).request
  if (!request || typeof request !== 'object' || !['get', 'put', 'heads', 'latest', 'checkpoint'].includes(String((request as RecoveryRequest).op))) {
    sendResponse({ ok: false, error: '恢复请求无效。' }); return false
  }
  const rpc = request as RecoveryRequest
  const extensionPage = sender.url?.startsWith(ownUrl)
  const owner = connection?.operatorId || connection?.lastOperatorId
  const contentScope = owner && connection ? JSON.stringify([connection.easyOrigin, owner, 'floating-files']) : ''
  const contentPage = connection && sender.tab?.id === connection.easyTabId && trustedOrigin(sender.url ?? '') === connection.easyOrigin &&
    rpc.slot === 'file-query' && (rpc.op === 'get' || rpc.op === 'put') && Boolean(contentScope) && typeof rpc.scope === 'string' &&
    (rpc.scope === contentScope || rpc.scope.startsWith(`${contentScope}:page:`))
  if (sender.id !== chrome.runtime.id || rpc.slot === 'limit-mail-intent' || (!extensionPage && !contentPage)) {
    sendResponse({ ok: false, error: '恢复请求来源或账号范围无效。' }); return false
  }
  void authority.dispatch(request as RecoveryRequest).then(value => sendResponse({ ok: true, value }), error => sendResponse({ ok: false, error: error instanceof Error ? error.message : '恢复账本未提交。' }))
  return true
}
