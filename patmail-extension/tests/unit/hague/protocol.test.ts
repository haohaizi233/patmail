import { expect, it, vi } from 'vitest'
import { isMessage, workspaceForwardBlock, MessageType } from '../../../src/shared/message'
import { EasyRuntime } from '../../../src/api/client'

it('accepts scoped read/cancel requests and rejects unbounded payloads', () => {
  const read = { type: MessageType.ReadHagueCase, payload: { caseVolume: 'PO1HAGUE', batchId: 'batch-1' } }
  expect(isMessage(read)).toBe(true); expect(workspaceForwardBlock(read)).toBe('')
  expect(isMessage({ ...read, payload: { ...read.payload, url: 'http://example.test' } })).toBe(false)
  const cancel = { type: MessageType.CancelHagueRead, payload: { batchId: 'batch-1' } }
  expect(isMessage(cancel)).toBe(true); expect(workspaceForwardBlock(cancel)).toBe('')
  expect(isMessage({ ...cancel, payload: { batchId: '../all' } })).toBe(false)
})
it('cancels a batch even when its read message arrives after the cancellation', async () => {
  const fetcher = vi.fn<typeof fetch>()
  const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
  runtime.cancelHagueRead('batch-1')
  await expect(runtime.readHagueCase('PO1HAGUE', 'batch-1')).rejects.toThrow('已停止')
  expect(fetcher).not.toHaveBeenCalled()
})
