import { expect, it } from 'vitest'
import { DownloadNameRequests } from '../../../src/api/download-name-requests'
import type { ApiResult } from '../../../src/api/types'
const params = (ids: string) => new URLSearchParams({ Call: 'GetFileName', file_ids: ids, new_filename: 'case_name', file_name_type: 'colname' })
const reply = (names: string): ApiResult<unknown> => ({ ok: true, data: { ClientInfo: { IsLogin: true, Status: true }, file_names: names } })
it('预览与下载乱序重叠共享在途请求，已完成结果复用', async () => {
  const cache = new DownloadNameRequests(); let finish!: (v: ApiResult<unknown>) => void, calls = 0
  const first = cache.post(params('a;b'), undefined, async () => { calls++; return new Promise(resolve => { finish = resolve }) })
  const second = cache.post(params('b;a'), undefined, async () => { calls++; throw Error('cannot repeat') })
  finish(reply('A.docx;B.doc'))
  expect(await first).toMatchObject({ ok: true, data: { file_names: 'A.docx;B.doc' } })
  expect(await second).toMatchObject({ ok: true, data: { file_names: 'B.doc;A.docx' } })
  await cache.post(params('a'), undefined, async () => { calls++; return reply('wrong') })
  expect(calls).toBe(1)
})
it('clear隔离旧请求，新上下文不能被晚到结果污染', async () => {
  const cache = new DownloadNameRequests(); let finish!: (v: ApiResult<unknown>) => void
  const old = cache.post(params('a'), undefined, () => new Promise(resolve => { finish = resolve }))
  cache.clear()
  await cache.post(params('a'), undefined, async () => reply('new.pdf'))
  finish(reply('old.pdf')); await old
  expect(await cache.post(params('a'), undefined, async () => { throw Error('already cached') })).toMatchObject({ data: { file_names: 'new.pdf' } })
})
it('错误不缓存，登录失效保持原错误类型', async () => {
  const cache = new DownloadNameRequests()
  expect(await cache.post(params('a'), undefined, async () => ({ ok: true, data: { ClientInfo: { IsLogin: false, Status: false } } }))).toMatchObject({ ok: false, error: { code: 'SESSION_EXPIRED' } })
  expect(await cache.post(params('a'), undefined, async () => reply('ok.pdf'))).toMatchObject({ ok: true })
})
