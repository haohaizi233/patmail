import { expect, it } from 'vitest'
import { runBatch, type HagueRow } from '../../../src/hague/workflow'
import { PermitPool } from '../../../src/utils/permit-pool'
import type { Decision } from '../../../src/hague/arbitration'

it('starts reading/arbitration before the last document parses and serializes AI alone', async () => {
  const rows: HagueRow[] = Array.from({ length: 3 }, (_, i) => ({ folder: { path: `${i}`, caseVolume: `PO${i}HAGUE`, documents: [], images: [], issues: [] }, state: 'parsing', confirmed: false, error: '' }))
  let unblockLast!: () => void, finishAi!: () => void, ai = 0, peak = 0, reads = 0
  const gate = new PermitPool(1)
  const running = runBatch(rows, {
    parse: async row => { if (row === rows[2]) await new Promise<void>(resolve => { unblockLast = resolve }) },
    validate: () => [], read: async () => { reads++; return 'source' },
    decide: (_row, signal, onStart) => gate.run(async () => { onStart?.(); peak = Math.max(peak, ++ai); await new Promise<void>(resolve => { finishAi = resolve }); ai--; return {} as Decision }, signal)
  }, new AbortController().signal, () => {})
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(reads).toBe(2); expect(rows[0].state).toBe('arbitrating'); expect(rows[2].state).toBe('parsing')
  unblockLast(); await new Promise(resolve => setTimeout(resolve, 0)); expect(reads).toBe(3)
  for (let i = 0; i < 3; i++) { finishAi(); await new Promise(resolve => setTimeout(resolve, 0)) }
  const result = await running
  expect(peak).toBe(1); expect(result.succeeded).toBe(3); expect(result.totalUnits).toBe(9)
})
