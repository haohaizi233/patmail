import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { memoryRecoveryStore, openRecoveryLedger, useRecoveryWasm } from '../../../src/recovery/wal-ledger'
import { createRecoveryClient } from '../../../src/recovery/client'
import { RecoveryAuthority } from '../../../src/background/recovery'
const wasm = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
useRecoveryWasm(wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength))
describe('background recovery authority', () => {
  it('serializes two callers, rejects stale revisions and replays before a cold read', async () => {
    const store = memoryRecoveryStore()
    const authority = new RecoveryAuthority(() => openRecoveryLedger(store))
    const [a, b] = await Promise.all([
      authority.dispatch({ op: 'put', slot: 'file-query', scope: 'a', payload: { n: 1 }, expectedRevision: 0 }),
      authority.dispatch({ op: 'put', slot: 'file-query', scope: 'b', payload: { n: 2 }, expectedRevision: 0 })
    ])
    expect(a.revision).not.toBe(b.revision)
    await expect(authority.dispatch({ op: 'put', slot: 'file-query', scope: 'a', payload: { n: 3 }, expectedRevision: 0 })).rejects.toThrow('RECOVERY_CONFLICT')
    const cold = new RecoveryAuthority(() => openRecoveryLedger(store))
    expect((await cold.dispatch({ op: 'get', slot: 'file-query', scope: 'a' })).payload).toEqual({ n: 1 })
    expect((await cold.dispatch({ op: 'get', slot: 'file-query', scope: 'b' })).payload).toEqual({ n: 2 })
  })
  it('does not publish failed appends and orders reads after pending writes', async () => {
    const inner = memoryRecoveryStore()
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const store = { ...inner, async appendFrame() { await gate; throw new Error('aborted') } }
    const authority = new RecoveryAuthority(() => openRecoveryLedger(store))
    const write = authority.dispatch({ op: 'put', slot: 'file-query', scope: 'a', payload: {}, expectedRevision: 0 })
    const rejected = expect(write).rejects.toThrow('aborted')
    const read = authority.dispatch({ op: 'get', slot: 'file-query', scope: 'a' })
    release()
    await rejected
    expect((await read).payload).toBeNull()
  })
})


it('two production clients cannot overwrite the same stale work surface', async () => {
  const store = memoryRecoveryStore()
  const authority = new RecoveryAuthority(() => openRecoveryLedger(store))
  const first = createRecoveryClient(request => authority.dispatch(request))
  const second = createRecoveryClient(request => authority.dispatch(request))
  await Promise.all([first.get('file-query', 'owner'), second.get('file-query', 'owner')])
  await first.put('file-query', 'owner', { selected: ['a'] })
  await expect(second.put('file-query', 'owner', { selected: ['b'] })).rejects.toThrow('RECOVERY_CONFLICT')
  expect(await first.get('file-query', 'owner')).toEqual({ selected: ['a'] })
  await second.get('file-query', 'owner')
  await second.put('file-query', 'owner', { selected: ['a', 'b'] })
  expect(await first.get('file-query', 'owner')).toEqual({ selected: ['a', 'b'] })
})
