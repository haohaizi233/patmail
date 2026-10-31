/** 仅在正文确认不可用后使用；原站error_message本身不能判定附件失败。 */
export class UnavailableDownloadFileError extends Error {
  constructor(message: string) { super(message); this.name = 'UnavailableDownloadFileError' }
}

/** 已确认是单个附件的响应异常；在写入ZIP条目前允许换句柄重试。 */
export class RetryableDownloadFileError extends Error {
  constructor(message: string) { super(message); this.name = 'RetryableDownloadFileError' }
}

export function sourceUnavailableError(notice: string): UnavailableDownloadFileError | undefined {
  return /文件不存在|权限不足/.test(notice) ? new UnavailableDownloadFileError(notice.slice(0, 1000)) : undefined
}

/** 任意失败原因收窄成 Error 再抛出；Error 原样保留身份，便于调用方按类型匹配。 */
export function asError(reason: unknown): Error {
  if (reason instanceof Error) return reason
  return new Error(typeof reason === 'string' ? reason : '下载中断。')
}

// 可续跑中断：凭据失效、会话波动、工作台暂离与回执超时都不破坏本机持久缓存，
// 按同一任务重新启动即可从检查点继续。用户暂停、取消与接管不是恢复信号。
const RESUMABLE_DOWNLOAD_INTERRUPTION = /下载凭据已失效|来源页面或账号已离开|保存文件工作台未响应|回执超时|下载初始化已超时|本机下载流没有应答|保存文件尚未确认关闭/
const FROZEN_DOWNLOAD_INTERRUPTION = /下载已暂停，本机缓存|已由新的恢复请求接管|下载已取消|浏览器下载已取消|该任务已完成/

export function isResumableDownloadInterruption(error: unknown): boolean {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return !FROZEN_DOWNLOAD_INTERRUPTION.test(message) && RESUMABLE_DOWNLOAD_INTERRUPTION.test(message)
}

/** 流水下载遇可续跑中断时按同一持久任务自动续跑；次数用尽或不可恢复时上抛原错误。 */
export async function runWithDownloadRecovery<T>(
  run: (attempt: number) => Promise<T>,
  options: { attempts: number; delayMs?: (attempt: number) => number; onRetry?: (attempt: number, error: Error) => void }
): Promise<T> {
  const delayMs = options.delayMs ?? (attempt => 2000 * attempt)
  for (let attempt = 0; ; attempt++) {
    try {
      return await run(attempt)
    } catch (error) {
      const failure = asError(error)
      if (attempt >= options.attempts || !isResumableDownloadInterruption(failure)) throw failure
      options.onRetry?.(attempt + 1, failure)
      await new Promise<void>(resolve => setTimeout(resolve, delayMs(attempt + 1)))
    }
  }
}
