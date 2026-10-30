import { expect, it } from 'vitest'
import { caseScope, deduplicateNamedFiles, deduplicateSelectedFiles, finalDownloadNameKey, newestFirstSelected, sanitizedDownloadName } from '../../../src/mail/deduplicate'
import type { SelectedPatentFile } from '../../../src/mail/types'
import { toSelectedFile } from '../../../src/mail/selection'
const file = (id: string, name: string, date = '', caseId = 'case-a'): SelectedPatentFile => ({ fileId: id, fileName: name, uploadTime: date, caseId, fileDescription: '', customerName: '' })
const selected = (...files: SelectedPatentFile[]) => Object.fromEntries(files.map(f => [f.fileId, f]))
it('查询行转成跨页勾选时保留案件身份和上传时间', () => {
  expect(toSelectedFile({ fileId: 'a', fileName: 'a.doc', caseId: 'case-a', uploadTime: '2026-10-30' })).toMatchObject({ caseId: 'case-a', uploadTime: '2026-10-30' })
})
it('同案件重名或doc/docx保留上传最新', () => {
  const a = file('a', '说明书.doc', '2026-01-01'), b = file('b', '说明书.docx', '2026-02-01')
  expect(Object.keys(deduplicateSelectedFiles(selected(b, a)))).toEqual(['b'])
})
it('文件名中的数字括号属于正文名称，不能按浏览器或ZIP后缀删除', () => {
  const a = file('a', '说明书.doc'), b = file('b', '说明书 (2).docx')
  expect(Object.keys(deduplicateSelectedFiles(selected(a, b)))).toEqual(['a', 'b'])
  expect(finalDownloadNameKey('说明书 (2).docx')).toBe('说明书 (2).word')
})
it('按最终DIY名称去重：原名相同但DIY名不同保留，原名不同但DIY名相同留最新', () => {
  const a = file('a', '原名.doc', '2026-01-01'), b = file('b', '原名.doc', '2026-02-01'), c = file('c', '其他.doc', '2026-03-01')
  expect(Object.keys(deduplicateNamedFiles(selected(a, b), { a: '甲.doc', b: '乙.doc' }, false))).toEqual(['a', 'b'])
  expect(Object.keys(deduplicateNamedFiles(selected(a, b, c), { a: '甲.doc', b: '乙.doc', c: '甲.docx' }, false))).toEqual(['b', 'c'])
})
it('未解析的最终名不参与去重，不退回原始文件名', () => {
  const a = file('a', '相同.doc'), b = file('b', '相同.doc'), c = file('c', '相同.doc')
  expect(Object.keys(deduplicateNamedFiles(selected(a, b, c), { a: ' ', b: '已知.doc' }, false))).toEqual(['a', 'b', 'c'])
})
it('最终名称使用ZIP相同的Windows安全字符处理，大小写及doc/docx合并但PDF分开', () => {
  expect(sanitizedDownloadName(' ..甲:/乙.doc. ')).toBe('甲_乙.doc')
  expect(sanitizedDownloadName('... ')).toBe('文件')
  expect(finalDownloadNameKey(' ..A:/B.DOC. ')).toBe('a_b.word')
  const files = selected(file('a', 'a', '2026-01-01'), file('b', 'b', '2026-02-01'), file('c', 'c'))
  expect(Object.keys(deduplicateNamedFiles(files, { a: 'A:/B.doc', b: 'a_b.DOCX. ', c: 'a_b.pdf' }, false))).toEqual(['b', 'c'])
})
it('勾选去申请号点时按去点后最终名去重，只改变申请号校验点', () => {
  const files = selected(file('a', 'a'), file('b', 'b', '2026-02-01'))
  const names = { a: '202610026334.9-v1.2.doc', b: '2026100263349-v1.2.docx' }
  expect(Object.keys(deduplicateNamedFiles(files, names, false))).toEqual(['a', 'b'])
  expect(Object.keys(deduplicateNamedFiles(files, names, true))).toEqual(['b'])
  expect(finalDownloadNameKey(names.a, true)).toBe('2026100263349-v1.2.word')
})
it('案件隔离优先caseId，再客户加卷号，再客户加申请号，最后独立文件ID', () => {
  expect(caseScope({ ...file('a', 'a'), caseVolume: 'V1' })).toBe(caseScope({ ...file('b', 'b'), caseVolume: 'V2' }))
  const a = { ...file('a', 'a', '', ''), caseVolume: 'V1', customerName: '甲' }
  const b = { ...file('b', 'b', '', ''), caseVolume: 'V1', customerName: '乙' }
  const c = { ...file('c', 'c', '', ''), customerName: '甲', applicationNo: '202610026334.9' }
  const d = { ...file('d', 'd', '', ''), customerName: '甲', applicationNo: '2026100263349' }
  expect(caseScope(a)).not.toBe(caseScope(b))
  expect(caseScope(c)).toBe(caseScope(d))
  const files = selected(a, b, c, d, file('e', 'e', '', ''), file('f', 'f', '', ''))
  expect(Object.keys(deduplicateNamedFiles(files, Object.fromEntries(Object.keys(files).map(id => [id, '统一.doc'])), false))).toEqual(['a', 'b', 'c', 'e', 'f'])
})
it('按上传时间降序排列，时区日期可比较，无效日期最后且相同日期按ID稳定排序', () => {
  const files = selected(file('z', 'z', '2026-02-30'), file('c', 'c', '2026/10/29 10:00:00'), file('b', 'b', '2026-10-29T11:00:00+01:00'), file('a', 'a', '2026-10-30'), file('d', 'd'))
  expect(newestFirstSelected(files).map(f => f.fileId)).toEqual(['a', 'b', 'c', 'd', 'z'])
})
it('不同案件、不同正文名和不同格式不误合并；无案件标识不猜测', () => {
  const files = [file('a', '说明书.pdf'), file('b', '说明书.docx'), file('c', '说明书.docx', '', 'case-b'), file('d', '权利要求.docx'), file('e', '说明书.docx', '', ''), file('f', '说明书.docx', '', '')]
  expect(Object.keys(deduplicateSelectedFiles(selected(...files)))).toHaveLength(6)
})
it('有效上传时间优先，缺失日期和相同日期用稳定ID打破平局，不受页返回顺序影响', () => {
  const a = file('a', '附件.pdf', '2026/10/29 10:00:00'), b = file('b', '附件.pdf', '2026-10-29 10:00:00'), c = file('c', '附件.pdf', '')
  expect(Object.keys(deduplicateSelectedFiles(selected(c, b, a)))).toEqual(['a'])
  expect(Object.keys(deduplicateSelectedFiles(selected(a, c, b)))).toEqual(['a'])
})
it('案件编号可作隔离依据，普通结尾数字与版本名保留', () => {
  const a = { ...file('a', '附件2.docx', '', ''), caseVolume: 'A001' }, b = { ...file('b', '附件.docx', '', ''), caseVolume: 'A001' }
  expect(Object.keys(deduplicateSelectedFiles(selected(a, b)))).toHaveLength(2)
})
