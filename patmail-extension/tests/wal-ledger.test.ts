import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { holdRecovery, memoryRecoveryStore, openRecoveryLedger, peekRecovery, systemScope, useRecoveryWasm, type StoredFrame } from '../src/recovery/wal-ledger'

const wasmFile = readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))
useRecoveryWasm(wasmFile.buffer.slice(wasmFile.byteOffset, wasmFile.byteOffset + wasmFile.byteLength))

describe('SQLite WAL 恢复账本', () => {
  it('以 WAL 记下工作面，重新打开还能读到', async () => {
    const store = memoryRecoveryStore()
    const ledger = await openRecoveryLedger(store)
    expect(ledger.journalMode).toBe('wal')
    await ledger.put('workflow-desk', 'user-1', { rows: ['PA1'], phase: 'run' })
    await ledger.put('limit-query', 'page', { total: 2 })
    await ledger.checkpoint()
    const again = await openRecoveryLedger(store)
    expect(await again.get('workflow-desk', 'user-1')).toEqual({ rows: ['PA1'], phase: 'run' })
    expect(await again.get('limit-query', 'page')).toEqual({ total: 2 })
    expect(await again.get('workflow-desk', 'user-2')).toBeNull()
  })

  it('库文件还没写完时，下一回按 WAL 里的那一笔补上', async () => {
    const store = memoryRecoveryStore()
    const ledger = await openRecoveryLedger(store)
    await ledger.put('limit-mail', 'local', [{ procId: 'a', state: 'created' }])
    await ledger.checkpoint()
    const checkpoint = await store.readCheckpoint()
    const crashed = memoryRecoveryStore()
    if (checkpoint) await crashed.writeCheckpoint(checkpoint)
    const frame: StoredFrame = {
      seq: 2,
      slot: 'limit-mail',
      scope: 'local',
      payload: JSON.stringify([{ procId: 'a', state: 'unknown' }]),
      at: '2026-10-13T10:00:00.000Z'
    }
    await crashed.appendFrame(frame)
    const restored = await openRecoveryLedger(crashed)
    expect(await restored.get('limit-mail', 'local')).toEqual([{ procId: 'a', state: 'unknown' }])
    expect(await crashed.readFrames()).toEqual([])
  })

  it('连写多笔只折一次库，帧都留在账本里等折', async () => {
    // 一笔一导出是 O(库大小) 的写放大：写回合并要把导出攒到折库那一把。
    const inner = memoryRecoveryStore()
    let exports = 0
    const counting = {
      ...inner,
      async writeCheckpoint(bytes: Uint8Array) {
        exports += 1
        await inner.writeCheckpoint(bytes)
      }
    }
    const ledger = await openRecoveryLedger(counting)
    await ledger.put('workflow-desk', 'a', { n: 1 })
    await ledger.put('workflow-desk', 'b', { n: 2 })
    await ledger.put('limit-query', 'c', { n: 3 })
    expect(exports).toBe(0)
    expect((await inner.readFrames()).length).toBe(3)
    await ledger.checkpoint()
    expect(exports).toBe(1)
    expect(await inner.readFrames()).toEqual([])
    const again = await openRecoveryLedger(inner)
    expect(await again.get('workflow-desk', 'b')).toEqual({ n: 2 })
    expect(await again.get('limit-query', 'c')).toEqual({ n: 3 })
  })

  it('折掉暂存行之后序号不回头，新笔压得过旧 head', async () => {
    // wal 表折掉后 max(seq) 若只看 wal，序号会从头来，新笔的 seq 压不过旧 head。
    const store = memoryRecoveryStore()
    const ledger = await openRecoveryLedger(store)
    await ledger.put('file-desk', 'local', { letters: 1 })
    await ledger.checkpoint()
    await ledger.put('file-desk', 'local', { letters: 2 })
    await ledger.checkpoint()
    const again = await openRecoveryLedger(store)
    expect(await again.get('file-desk', 'local')).toEqual({ letters: 2 })
  })

  it('抹掉的槽位不会被更早的一笔补回来，也不收登录凭据', async () => {
    const store = memoryRecoveryStore()
    const ledger = await openRecoveryLedger(store)
    await ledger.put('file-desk', 'local', { letters: 1 })
    await ledger.forget('file-desk', 'local')
    expect(await ledger.get('file-desk', 'local')).toBeNull()
    expect(await ledger.latest('file-desk')).toBeNull()
    await expect(ledger.put('workflow-desk', 'local', { cookie: 'secret' })).rejects.toThrow('登录凭据')
  })

  it('两个系统的工作面分开记，切回来先用内存里的那份', () => {
    const large = systemScope('http://183.36.43.66:88', 'page')
    const sme = systemScope('http://183.36.43.44:88/', 'workflow')
    expect(large).not.toBe(sme)
    expect(systemScope('http://183.36.43.44:88/', 'workflow')).toBe('http://183.36.43.44:88|workflow')
    holdRecovery('limit-query', large, { rows: ['PA1'] })
    holdRecovery('limit-query', sme, null)
    expect(peekRecovery('limit-query', large)).toEqual({ rows: ['PA1'] })
    expect(peekRecovery('limit-query', sme)).toBeNull()
    expect(peekRecovery('limit-query', systemScope('http://other', 'page'))).toBeUndefined()
  })
})
