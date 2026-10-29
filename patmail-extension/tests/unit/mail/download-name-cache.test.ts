import { expect, it } from 'vitest'
import { resolveDownloadFileNames } from '../../../src/mail/download-name'
import type { EasyTransport } from '../../../src/api/transport'
it('已验证身份后恢复持久命名批次，不要求缓存伪造原站ClientInfo也不重新命名', async () => {
  const transport = { post: async () => { throw new Error('缓存完整时不能重新命名') } } as unknown as EasyTransport
  const response = await resolveDownloadFileNames(transport, ['00000000-0000-4000-8000-000000000001'],
    { newFilename: 'file_name', fileNameType: 'colname' }, { resolvedBatches: { '0': ['cached.pdf'] } })
  expect(response).toEqual({ ok: true, data: ['cached.pdf'] })
})
