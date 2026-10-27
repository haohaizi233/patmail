import { describe, expect, it } from 'vitest'
import { EasyRuntime } from '../../../src/api/client'

const TEMPLATE = 'd9896997-1e83-4c7d-9a49-da69ba56e7aa'
const FILE = '603ca943-a07a-4894-9461-29dff2d60c4b'
const GUID = '85ebabc1-cf99-490e-b5f7-298a77742012'
const authenticated = { ClientInfo: { IsLogin: true, Status: true, Result: true } }

describe('文件下载', () => {
  it('按下载名称生成文件名、去掉申请号校验点，打包后给出取包地址', async () => {
    let downloadBody = ''
    const fetcher: typeof fetch = async (url, init) => {
      const call = new URLSearchParams(String(init?.body ?? '')).get('Call') ?? ''
      if (call === 'GetUserModel') return new Response(JSON.stringify(authenticated))
      if (call === 'GetFileTempNameList') {
        return new Response(JSON.stringify({
          TempNameList: [{ id: TEMPLATE, new_filename: 'app_no;-;file_desc', file_name_type: 'colname;txt;colname' }],
          ClientInfo: { IsLogin: true, Status: true }
        }))
      }
      if (call === 'GetFileName') {
        return new Response(JSON.stringify({
          file_names: '202610026334.9-专利申请受理通知书.pdf',
          ClientInfo: { IsLogin: true, Status: true, Result: false }
        }))
      }
      if (call === 'DownLoad') {
        downloadBody = String(init?.body ?? '')
        return new Response(JSON.stringify({
          error: true,
          error_message: '文件不存在或权限不足,您共0个文件下载失败！',
          ClientInfo: { IsLogin: true, Status: true, Result: false },
          file_guid: GUID
        }))
      }
      return new Response(JSON.stringify(authenticated))
    }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
    await runtime.checkSession()
    const downloaded = await runtime.downloadFiles(
      [{ fileId: FILE, fileNo: 'A00110397537', fileName: 'PA25111422CND-YS-专利申请受理通知书.pdf' }],
      { templateId: TEMPLATE },
      true
    )
    expect(downloaded.ok).toBe(true)
    if (!downloaded.ok) return
    expect(downloaded.data.fileCount).toBe(1)
    expect(downloaded.data.notice).toBe('')
    expect(downloaded.data.fileName).toMatch(/^下载文件-\d{8}-\d{6}\.zip$/)
    // 取包地址交给浏览器落盘：下载记录和文件名都由它负责。
    expect(downloaded.data.downloadUrl).toBe(`http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=${GUID}`)
    const body = new URLSearchParams(downloadBody)
    expect(body.get('Call')).toBe('DownLoad')
    expect(body.get('file_no')).toBe('A00110397537')
    expect(body.get('file_name')).toBe('2026100263349-专利申请受理通知书.pdf')
    expect(body.get('model')).toBe('FILE')
  })

  it('不选下载名称就用查询原名，原名里的申请号同样去点，取包地址带 file_size', async () => {
    let downloadBody = ''
    const fetcher: typeof fetch = async (url, init) => {
      const call = new URLSearchParams(String(init?.body ?? '')).get('Call') ?? ''
      if (call === 'GetUserModel') return new Response(JSON.stringify(authenticated))
      if (call === 'DownLoad') {
        downloadBody = String(init?.body ?? '')
        return new Response(JSON.stringify({
          error_message: '文件不存在或权限不足,您共1个文件下载失败！',
          ClientInfo: { IsLogin: true, Status: true, Result: true },
          file_guid: GUID,
          file_size: 128
        }))
      }
      return new Response(JSON.stringify(authenticated))
    }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
    await runtime.checkSession()
    const downloaded = await runtime.downloadFiles(
      [{ fileId: FILE, fileNo: 'A00110397537', fileName: '202610026334.9-专利申请受理通知书.pdf' }],
      null,
      true
    )
    expect(downloaded).toMatchObject({
      ok: true,
      data: {
        fileCount: 1,
        notice: '文件不存在或权限不足,您共1个文件下载失败！',
        downloadUrl: `http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=${GUID}&file_size=128`
      }
    })
    expect(new URLSearchParams(downloadBody).get('file_name')).toBe('2026100263349-专利申请受理通知书.pdf')
  })

  it('去掉点的开关关掉时，文件名原样传给原站', async () => {
    let downloadBody = ''
    const fetcher: typeof fetch = async (url, init) => {
      const call = new URLSearchParams(String(init?.body ?? '')).get('Call') ?? ''
      if (call === 'GetUserModel') return new Response(JSON.stringify(authenticated))
      if (call === 'DownLoad') {
        downloadBody = String(init?.body ?? '')
        return new Response(JSON.stringify({
          ClientInfo: { IsLogin: true, Status: true, Result: false },
          file_guid: GUID
        }))
      }
      return new Response(JSON.stringify(authenticated))
    }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
    await runtime.checkSession()
    const downloaded = await runtime.downloadFiles(
      [{ fileId: FILE, fileNo: 'A00110397537', fileName: '202610026334.9-专利申请受理通知书.pdf' }],
      null,
      false
    )
    expect(downloaded.ok).toBe(true)
    expect(new URLSearchParams(downloadBody).get('file_name')).toBe('202610026334.9-专利申请受理通知书.pdf')
  })

  it('缺文件编号或原名时不发请求', async () => {
    let calls = 0
    const fetcher: typeof fetch = async (url, init) => {
      const call = new URLSearchParams(String(init?.body ?? '')).get('Call') ?? ''
      if (call !== 'GetUserModel') calls += 1
      return new Response(JSON.stringify(authenticated))
    }
    const runtime = new EasyRuntime('http://183.36.43.66:88', { fetcher })
    await runtime.checkSession()
    expect(await runtime.downloadFiles([{ fileId: FILE, fileNo: '', fileName: 'a.pdf' }], null, true))
      .toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } })
    expect(await runtime.downloadFiles([], null, true)).toMatchObject({ ok: false, error: { code: 'INVALID_QUERY' } })
    expect(calls).toBe(0)
  })
})
