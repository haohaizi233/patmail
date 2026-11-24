import { reactive } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createLeadingFrameCoalescer } from '../../../src/app/frame-coalesce'
import { toPlainCloneable } from '../../../src/app/plain-snapshot'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('createLeadingFrameCoalescer', () => {
  it('flushes leading trigger immediately and coalesces same-frame bursts into one trailing flush', () => {
    let nextId = 1
    const rafQueue = new Map<number, () => void>()
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      const id = nextId++
      rafQueue.set(id, cb)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      rafQueue.delete(id)
    })

    let count = 0
    const flushed: number[] = []
    const coalescer = createLeadingFrameCoalescer(() => {
      flushed.push(count)
    })

    count = 1
    coalescer.trigger()
    expect(flushed).toEqual([1])
    expect(rafQueue.size).toBe(1)

    for (let i = 2; i <= 25; i += 1) {
      count = i
      coalescer.trigger()
    }
    expect(flushed).toEqual([1])

    // Next frame flushes once for the entire burst, then settles when no trailing dirtiness remains.
    const firstEntry = [...rafQueue.entries()][0]
    expect(firstEntry).toBeDefined()
    if (!firstEntry) throw new Error('expected queued animation frame')
    rafQueue.delete(firstEntry[0])
    firstEntry[1]()
    expect(flushed).toEqual([1, 25])
    expect(rafQueue.size).toBe(1)

    const secondEntry = [...rafQueue.entries()][0]
    expect(secondEntry).toBeDefined()
    if (!secondEntry) throw new Error('expected idle animation frame')
    rafQueue.delete(secondEntry[0])
    secondEntry[1]()
    expect(flushed).toEqual([1, 25])
    expect(rafQueue.size).toBe(0)
  })

  it('supports immediate boundary flushes, flushNow(), and cancel() with timer fallback', () => {
    vi.useFakeTimers()
    vi.stubGlobal('requestAnimationFrame', undefined)
    vi.stubGlobal('cancelAnimationFrame', undefined)

    let latest = 0
    const flushed: number[] = []
    const coalescer = createLeadingFrameCoalescer(() => {
      flushed.push(latest)
    })

    latest = 10
    coalescer.trigger()
    latest = 20
    coalescer.trigger()
    latest = 30
    coalescer.trigger(true)
    expect(flushed).toEqual([10, 30])

    latest = 40
    coalescer.trigger()
    expect(flushed).toEqual([10, 30])
    coalescer.flushNow()
    expect(flushed).toEqual([10, 30, 40])

    latest = 50
    coalescer.trigger()
    latest = 60
    coalescer.trigger()
    coalescer.cancel()
    vi.advanceTimersByTime(50)
    expect(flushed).toEqual([10, 30, 40, 50])
  })
})

describe('toPlainCloneable', () => {
  it('strips Vue proxies and non-cloneable fields for structuredClone without JSON round-trip', () => {
    const state = reactive({
      title: '测试账单',
      when: new Date('2026-11-24T00:00:00Z'),
      bytes: new Uint8Array([1, 2, 3]),
      rows: [{ id: '1', nested: { ok: true } }],
      ignoredFn: () => 42,
      ignoredUndef: undefined,
    })

    const plain = toPlainCloneable(state)
    expect(plain.title).toBe('测试账单')
    expect(plain.when).toBeInstanceOf(Date)
    expect(plain.bytes).toBeInstanceOf(Uint8Array)
    expect('ignoredFn' in plain).toBe(false)
    expect('ignoredUndef' in plain).toBe(false)

    const cloned = structuredClone(plain)
    expect(cloned.rows).toEqual([{ id: '1', nested: { ok: true } }])
    expect(Array.from(cloned.bytes)).toEqual([1, 2, 3])
  })
})
