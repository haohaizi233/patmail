export function observeDownload<T>(
  page: { waitForEvent(event: 'download', options: { timeout: number }): Promise<T> },
  onFailure: (error: unknown) => void,
  timeout?: number,
): Promise<T>
export function waitForControllingWorker(
  page: {
    waitForFunction(
      callback: (expected: string) => boolean,
      arg: string,
      options: { timeout: number },
    ): Promise<unknown>
  },
  scriptUrl: string,
  timeout?: number,
): Promise<void>
