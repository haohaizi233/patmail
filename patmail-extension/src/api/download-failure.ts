/** 仅在正文确认不可用后使用；原站error_message本身不能判定附件失败。 */
export class UnavailableDownloadFileError extends Error {
  constructor(message: string) { super(message); this.name = 'UnavailableDownloadFileError' }
}

export function sourceUnavailableError(notice: string): UnavailableDownloadFileError | undefined {
  return /文件不存在|权限不足/.test(notice) ? new UnavailableDownloadFileError(notice.slice(0, 1000)) : undefined
}
