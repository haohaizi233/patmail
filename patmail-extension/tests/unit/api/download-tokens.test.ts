import { describe, expect, it } from 'vitest'
import { DownloadTokens } from '../../../src/api/download-tokens'

describe('动态下载令牌', () => {
  it('共享六个额度，释放幂等，按最新队列需求调度且同类先到先得', async () => {
    let preferred: 'naming' | 'download' = 'naming'
    const pool = new DownloadTokens(() => preferred)
    const signal = new AbortController().signal
    const held = await Promise.all(Array.from({ length: 6 }, () => pool.acquire('download', signal)))
    const order: string[] = []
    const name = pool.acquire('naming', signal).then(release => { order.push('name'); return release })
    const first = pool.acquire('download', signal).then(release => { order.push('first'); return release })
    const second = pool.acquire('download', signal).then(release => { order.push('second'); return release })
    await Promise.resolve(); expect(order).toEqual([])
    preferred = 'download'
    held[0](); held[0]()
    const releaseFirst = await first
    expect(order).toEqual(['first'])
    releaseFirst(); const releaseSecond = await second
    expect(order).toEqual(['first', 'second'])
    releaseSecond(); (await name)()
    held.slice(1).forEach(release => release())
  })
  it('取消排队者不消耗额度，也不阻塞后续申请', async () => {
    const pool = new DownloadTokens(() => 'download')
    const controller = new AbortController()
    const held = await Promise.all(Array.from({ length: 6 }, () => pool.acquire('download', controller.signal)))
    const cancelled = new AbortController()
    const rejected = expect(pool.acquire('naming', cancelled.signal)).rejects.toThrow()
    cancelled.abort(); await rejected
    held[0]()
    const release = await pool.acquire('download', controller.signal)
    release(); held.slice(1).forEach(done => done())
  })
})
