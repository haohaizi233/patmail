import { describe, expect, it } from 'vitest'
import { indexedRecoveryStore } from '../../../src/recovery/wal-ledger'
function controllableIdb() {
  const requests: Array<{ onsuccess?: () => void; result?: unknown }> = []
  const transactions: Array<{ oncomplete?: () => void; onabort?: () => void; onerror?: () => void; error?: Error; names: string | string[]; objectStore(name: string): unknown }> = []
  const database = { transaction(names: string | string[]) {
    const tx = { names, objectStore(_name: string) { return {
      add() { const request = {}; requests.push(request); return request },
      put() { const request = {}; requests.push(request); return request },
      openCursor() { const request = { result: null }; requests.push(request); return request }
    } } }
    transactions.push(tx)
    return tx
  } }
  const factory = { open() { const request = { result: database, onsuccess: undefined as (() => void) | undefined }; queueMicrotask(() => request.onsuccess?.()); return request } } as unknown as IDBFactory
  return { store: indexedRecoveryStore(factory)!, transactions, requests }
}
async function settle() { for (let i = 0; i < 8; i++) await Promise.resolve() }
describe('IndexedDB commit boundary', () => {
  it('does not ACK request success, and reports a later abort', async () => {
    const db = controllableIdb()
    let acknowledged = false
    const operation = db.store.appendFrame({ seq: 1, slot: 'file-query', scope: 'a', payload: '{}', at: '' }).then(() => { acknowledged = true })
    const rejection = expect(operation).rejects.toThrow('disk failure')
    await settle()
    db.requests[0].onsuccess?.()
    await settle()
    expect(acknowledged).toBe(false)
    db.transactions[0].error = new Error('disk failure')
    db.transactions[0].onabort?.()
    await rejection
  })
  it('commits checkpoint and frame deletion in the same transaction, ACKs only oncomplete', async () => {
    const db = controllableIdb()
    let acknowledged = false
    const operation = db.store.commitCheckpoint!(new Uint8Array([1]), 5).then(() => { acknowledged = true })
    await settle()
    expect(db.transactions).toHaveLength(1)
    expect(db.transactions[0].names).toEqual(['checkpoint', 'wal'])
    db.requests.forEach(request => request.onsuccess?.())
    await settle()
    expect(acknowledged).toBe(false)
    db.transactions[0].oncomplete?.()
    await operation
    expect(acknowledged).toBe(true)
  })
})
