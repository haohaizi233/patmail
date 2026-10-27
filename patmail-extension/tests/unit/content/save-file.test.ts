import { describe, expect, it } from 'vitest'
import { startArchiveDownload } from '../../../src/content/save-file'

describe('下载兜底', () => {
  it('挂隐藏 iframe 到取包地址，浏览器自己下载并留记录', () => {
    startArchiveDownload(document, 'http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=2a3a60dc-a32c-409e-947e-26c7a5400234')
    const frame = document.querySelector('iframe')
    expect(frame?.getAttribute('src')).toBe('http://183.36.43.66:88/AjaxServers/FileHandler.ashx?guid=2a3a60dc-a32c-409e-947e-26c7a5400234')
    expect(frame?.style.display).toBe('none')
  })
})
