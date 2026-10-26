import type { SelectedPatentFile } from '../../src/mail/types'

export function patentFile(overrides: Partial<SelectedPatentFile> = {}): SelectedPatentFile {
  return {
    fileId: 'file-a',
    fileName: 'a.pdf',
    fileDescription: '专利证书',
    customerName: '客户A',
    ...overrides
  }
}
