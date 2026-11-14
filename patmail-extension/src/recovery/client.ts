import type { RecoveryHead, RecoverySlot } from './wal-ledger'
export const RECOVERY_RPC = 'PATMAIL_RECOVERY_RPC'
export type RecoveryRequest = { op: 'get' | 'put' | 'latest' | 'heads' | 'checkpoint'; slot?: RecoverySlot; scope?: string; payload?: unknown; expectedRevision?: number }
export interface RecoveryReply { payload?: unknown; revision?: number }
export type RecoveryTransport = (request: RecoveryRequest) => Promise<RecoveryReply>
export function createRecoveryClient(transport: RecoveryTransport = async request => {
  if (!globalThis.chrome?.runtime?.sendMessage) throw new Error('恢复账本不可用，当前工作尚未保护。')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- 存量豁免：外部 XML/JSON any 数据流，类型收口待后续
  const response = await chrome.runtime.sendMessage({ type: RECOVERY_RPC, request })
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
  if (!response?.ok) throw new Error(response?.error || '恢复账本未提交。')
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- 存量豁免：多项历史存量，理由见 docs/ci/quality-gates.md
  return response.value
}) {
  const revisions = new Map<string, number>()
  let chain = Promise.resolve()
  const key = (slot: RecoverySlot, scope: string) => JSON.stringify([slot, scope])
  const ordered = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work)
    chain = run.then(() => undefined, () => undefined)
    return run
  }
  async function read(slot: RecoverySlot, scope: string) {
    const reply = await transport({ op: 'get', slot, scope })
    revisions.set(key(slot, scope), reply.revision ?? 0)
    return reply.payload ?? null
  }
  async function write(slot: RecoverySlot, scope: string, payload: unknown) {
    const id = key(slot, scope)
    if (!revisions.has(id)) await read(slot, scope)
    const reply = await transport({ op: 'put', slot, scope, payload, expectedRevision: revisions.get(id)! })
    revisions.set(id, reply.revision!)
  }
  return {
    get: (slot: RecoverySlot, scope: string) => ordered(() => read(slot, scope)),
    put: (slot: RecoverySlot, scope: string, payload: unknown) => ordered(() => write(slot, scope, payload)),
    forget: (slot: RecoverySlot, scope: string) => ordered(() => write(slot, scope, { forgotten: true })),
    latest: (slot: RecoverySlot) => ordered(async () => { const head = (await transport({ op: 'latest', slot })).payload as RecoveryHead | null; if (head?.revision !== undefined) revisions.set(key(slot, head.scope), head.revision); return head }),
    heads: (slot: RecoverySlot) => ordered(async () => { const heads = (await transport({ op: 'heads', slot })).payload as RecoveryHead[]; for (const head of heads) if (head.revision !== undefined) revisions.set(key(slot, head.scope), head.revision); return heads }),
    checkpoint: () => ordered(async () => { await transport({ op: 'checkpoint' }) })
  }
}
