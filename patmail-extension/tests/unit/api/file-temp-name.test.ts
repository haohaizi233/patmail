import { describe, expect, it } from 'vitest'
import { fileTempDeleteParams, fileTempSaveParams, readFileTempNameList } from '../../../src/api/file-temp-name'

const ID = '045eb1fc-e77a-4d50-98df-cbfcc9e5f4e7'
const RECIPE = { new_filename: 'app_no;-;case_name;-;file_desc', file_name_type: 'colname;txt;colname;txt;colname' }
const ROW = { id: ID, temp_name: '季华官文', user_id: '9eda7e30-4477-4a33-8d2b-433898b3e12f', ...RECIPE }

describe('下载文件名模板的保存与删除请求', () => {
  it('保存按原站表单拼 SaveFileTepmName，Tepm 是页面原文', () => {
    const params = fileTempSaveParams({ tempName: '季华官文', newFilename: RECIPE.new_filename, fileNameType: RECIPE.file_name_type })
    expect(params.ok).toBe(true)
    if (!params.ok) return
    expect([...params.data.entries()]).toEqual([
      ['Call', 'SaveFileTepmName'],
      ['new_filename', RECIPE.new_filename],
      ['temp_name', '季华官文'],
      ['file_name_type', RECIPE.file_name_type],
      ['log_pagename', 'FileSearch.aspx']
    ])
  })

  it('模板名为空、段数对不上或段类型不明都拒绝发送', () => {
    expect(fileTempSaveParams({ tempName: '  ', newFilename: 'app_no', fileNameType: 'colname' }).ok).toBe(false)
    expect(fileTempSaveParams({ tempName: '名字', newFilename: 'app_no;-', fileNameType: 'colname' }).ok).toBe(false)
    expect(fileTempSaveParams({ tempName: '名字', newFilename: 'app_no', fileNameType: 'txt;txt' }).ok).toBe(false)
    expect(fileTempSaveParams({ tempName: 'x'.repeat(81), newFilename: 'app_no', fileNameType: 'colname' }).ok).toBe(false)
  })

  it('删除按原站表单拼 DeleteTemp，只收模板 ID', () => {
    const params = fileTempDeleteParams(` ${ID} `)
    expect(params.ok).toBe(true)
    if (!params.ok) return
    expect([...params.data.entries()]).toEqual([
      ['Call', 'DeleteTemp'], ['temp_id', ID], ['log_pagename', 'FileSearch.aspx']
    ])
    expect(fileTempDeleteParams('temp-1').ok).toBe(false)
    expect(fileTempDeleteParams('').ok).toBe(false)
  })
})

describe('下载文件名模板的写响应', () => {
  it('成功时带回完整模板列表和配方', () => {
    const result = readFileTempNameList({ ClientInfo: { IsLogin: true, Status: true, Result: true, Message: null }, TempNameList: [ROW] })
    expect(result).toEqual({ ok: true, data: { templates: [{ id: ID, tempName: '季华官文', newFilename: RECIPE.new_filename, fileNameType: RECIPE.file_name_type }] } })
  })

  it('Result 为 false 时把原站 Message 带出来', () => {
    const failed = readFileTempNameList({ ClientInfo: { IsLogin: true, Result: false, Message: '模板名称已存在！' }, TempNameList: [ROW] })
    expect(failed.ok).toBe(false)
    if (!failed.ok) expect(failed.error).toMatchObject({ code: 'BUSINESS_ERROR', message: '模板名称已存在！' })
  })

  it('掉登录、空列表和畸形列表分开处理', () => {
    const expired = readFileTempNameList({ ClientInfo: { IsLogin: false, Result: false }, TempNameList: null })
    expect(expired.ok).toBe(false)
    if (!expired.ok) expect(expired.error.code).toBe('SESSION_EXPIRED')
    expect(readFileTempNameList({ ClientInfo: { IsLogin: true, Result: true }, TempNameList: null })).toEqual({ ok: true, data: { templates: [] } })
    expect(readFileTempNameList({ ClientInfo: { IsLogin: true, Result: true } })).toEqual({ ok: true, data: { templates: [] } })
    expect(readFileTempNameList({ ClientInfo: { IsLogin: true, Result: true }, TempNameList: 'x' }).ok).toBe(false)
    expect(readFileTempNameList({ ClientInfo: { Result: true }, TempNameList: [{ temp_name: '没有 id' }] })).toEqual({ ok: true, data: { templates: [] } })
    expect(readFileTempNameList('nope').ok).toBe(false)
  })
})
