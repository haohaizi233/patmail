import { expect, it, vi } from 'vitest'
import { handleDocumentExport } from '../../../src/background/document-export'
import { MessageType } from '../../../src/shared/message'
it('allows app PDF and ZIP manifests without opening the EASY download route', async () => {
  vi.stubGlobal('chrome', { runtime: { id: 'ext' } })
  try {
    const command = vi.fn(async () => ({ ok: true as const })),
      sender = { id: 'ext', url: 'chrome-extension://ext/app.html' }
    for (const format of ['pdf', 'zip'])
      expect(
        await handleDocumentExport(
          {
            command: {
              action: 'start',
              taskId: crypto.randomUUID(),
              targetId: crypto.randomUUID(),
              fileName: 'Summary.' + format,
              manifest: { format, items: [{ fileName: 'Summary.pdf' }] },
            },
          },
          sender,
          { command },
        ),
      ).toMatchObject({ type: MessageType.StreamDownloadResult })
    expect(command).toHaveBeenCalledTimes(2)
    for (const request of [
      { action: 'start', fileName: '../x.pdf' },
      { action: 'write', token: 'bad', sequence: 0, data: 'a' },
    ])
      expect(await handleDocumentExport({ command: request }, sender, { command })).toMatchObject({
        type: MessageType.Error,
      })
    expect(
      await handleDocumentExport(
        { command: { action: 'status', token: 'a'.repeat(64) } },
        { ...sender, url: 'https://evil.test/app.html' },
        { command },
      ),
    ).toMatchObject({ type: MessageType.Error })
    expect(command).toHaveBeenCalledTimes(2)
  } finally {
    vi.unstubAllGlobals()
  }
})
