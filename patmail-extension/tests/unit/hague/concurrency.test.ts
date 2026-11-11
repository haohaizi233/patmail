import { expect, it } from 'vitest'
import { PermitPool } from '../../../src/utils/permit-pool'

it('caps only admitted work and immediately hands a released permit to queued work', async () => {
  const pool = new PermitPool(6), releases: (() => void)[] = []
  let active = 0, peak = 0, started = 0
  const tasks = Array.from({ length: 9 }, async () => pool.run(async () => {
    started++; peak = Math.max(peak, ++active)
    await new Promise<void>(resolve => releases.push(resolve)); active--
  }))
  await Promise.resolve(); await Promise.resolve(); expect(started).toBe(6)
  releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0))
  expect(started).toBe(7); expect(peak).toBe(6)
  while (releases.length) { releases.shift()!(); await new Promise(resolve => setTimeout(resolve, 0)) }
  await Promise.all(tasks); expect(active).toBe(0)
})
it('removes cancelled waiters without stealing a permit', async () => {
  const pool = new PermitPool(1), first = await pool.acquire(), controller = new AbortController()
  const cancelled = pool.acquire(controller.signal)
  controller.abort(); await expect(cancelled).rejects.toThrow('已停止')
  first(); const next = await pool.acquire(); next()
})
