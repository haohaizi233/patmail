/** 仅在正文确认不可用后使用；原站error_message本身不能判定附件失败。 */
export class UnavailableDownloadFileError extends Error {
  constructor(message: string) { super(message); this.name = 'UnavailableDownloadFileError' }
}

export function sourceUnavailableError(notice: string): UnavailableDownloadFileError | undefined {
  return /文件不存在|权限不足/.test(notice) ? new UnavailableDownloadFileError(notice.slice(0, 1000)) : undefined
}

/** 任意失败原因收窄成 Error 再抛出；Error 原样保留身份，便于调用方按类型匹配。 */
export function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  return new Error(typeof reason === 'string' ? reason : '下载中断。')
}
