import { expect, it } from 'vitest'
import { loadHagueCase } from '../../../src/hague/easy'
import { hagueReadFailure, hagueReadResponse } from '../../../src/hague/read-error'
import { isMessage } from '../../../src/shared/message'

it('keeps the actual no-match reason across the content boundary instead of generic page failure', async () => {
  for (const volume of ['PO2530287HAGUE', 'PA2532115CN']) {
    const reply = await hagueReadResponse(() => loadHagueCase(volume, async () => ({ ok: true, data: { ClientInfo: { IsLogin: true }, TableRows: [] } })))
    expect(isMessage(reply)).toBe(true)
    expect(reply.type).toBe('ERROR')
    if (reply.type === 'ERROR') {
      const message = reply.payload.message
      expect(message).toContain(volume)
      expect(message).toContain('大客户/中小客户')
      expect(message).not.toContain('页面读取失败')
    }
  }
})
it('does not expose arbitrary exception details through the error channel', () => {
  expect(hagueReadFailure(new Error('private diagnostic details'))).not.toContain('private diagnostic')
})
