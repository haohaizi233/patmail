import { expect, it } from 'vitest'
import { runBatch, transition, type HagueRow } from '../../../src/hague/workflow'
import type { Decision } from '../../../src/hague/arbitration'

const row = (): HagueRow => ({ folder: { path: 'A', caseVolume: 'PO1HAGUE', documents: [], images: [], issues: [] }, state: 'ready', error: '', confirmed: false })
it('isolates failures and progresses monotonically to settled, not fabricated success', async () => {
  const rows = [row(), row()], steps: number[] = []
  const summary = await runBatch(rows, { validate: () => [], read: async r => { if (r === rows[0]) throw new Error('网络失败'); return '{}' }, decide: async () => ({} as Decision) }, new AbortController().signal, p => steps.push(p.doneUnits))
  expect(rows.map(r => r.state)).toEqual(['failed', 'review'])
  expect(summary).toMatchObject({ settled: 2, succeeded: 1, failed: 1, phase: 'completed' })
  expect(steps).toEqual([...steps].sort((a, b) => a - b))
  expect(steps.at(-1)).toBe(4)
})
it('stops in-flight arbitration and resumes with retained source without re-reading', async () => {
  const r = row(), controller = new AbortController()
  await runBatch([r], { validate: () => [], read: async () => 'source', decide: async () => { controller.abort(); return {} as Decision } }, controller.signal, () => {})
  expect(r.state).toBe('stopped'); expect(r.source).toBe('source'); expect(r.decision).toBeUndefined()
  let reads = 0
  await runBatch([r], { validate: () => [], read: async () => { reads++; return 'other' }, decide: async () => ({} as Decision) }, new AbortController().signal, () => {})
  expect(reads).toBe(0); expect(r.state).toBe('review')
})
it('does not mark pending cases stopped or start arbitration after a read is cancelled', async () => {
  const rows = [row(), row()], controller = new AbortController()
  let decisions = 0
  const result = await runBatch(rows, { validate: () => [], read: async () => { controller.abort(); return 'already-read' }, decide: async () => { decisions++; return {} as Decision } }, controller.signal, () => {})
  expect(rows.map(r => r.state)).toEqual(['stopped', 'ready'])
  expect(decisions).toBe(0)
  expect(result).toMatchObject({ phase: 'stopped', settled: 0, succeeded: 0 })
})
it('blocks invalid material without reading and disallows impossible state transitions', async () => {
  const r = row(); let reads = 0
  await runBatch([r], { validate: () => ['缺少图片'], read: async () => { reads++; return '' }, decide: async () => ({} as Decision) }, new AbortController().signal, () => {})
  expect(reads).toBe(0); expect(r.state).toBe('blocked')
  expect(() => transition(r, 'confirmed')).toThrow('无效案件状态')
})
it('holds prepared cases until third-party login verification, without querying EASY or the model', async () => {
  const r = row(); let reads = 0
  const dependencies = { canRead: () => false, validate: () => [], read: async () => { reads++; return 'source' }, decide: async () => ({} as Decision) }
  const result = await runBatch([r], dependencies, new AbortController().signal, () => {})
  expect(r.state).toBe('waiting-session'); expect(reads).toBe(0)
  expect(result).toMatchObject({ phase: 'waiting', failed: 0, settled: 0 })
  await runBatch([r], { ...dependencies, canRead: () => true }, new AbortController().signal, () => {})
  expect(r.state).toBe('review'); expect(reads).toBe(1)
})
