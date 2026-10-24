/** 不急的活排到空闲里跑（恢复账本开库、搬执行记录这类），别跟首屏抢主线程。 */
export function runWhenIdle(task: () => void, timeout = 2_000): void {
  const globals = globalThis as {
    scheduler?: { postTask?: (callback: () => void, options?: { priority?: string }) => unknown }
    requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number
  }
  // requestIdleCallback 带 timeout 才不会在忙页里一直失约；没有它再退到 postTask。
  if (typeof globals.requestIdleCallback === 'function') {
    globals.requestIdleCallback(task, { timeout })
    return
  }
  if (globals.scheduler?.postTask) {
    globals.scheduler.postTask(task, { priority: 'background' })
    return
  }
  setTimeout(task, 0)
}

/**
 * 长活干一截就把主线程让回去。行档里现成的件会一口气涌进来、
 * 账本一片接一片读进来，不让的话浏览器整段插不进渲染和点击。
 */
export function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler
  if (scheduler?.yield) return scheduler.yield()
  return new Promise(resolve => { setTimeout(resolve, 0) })
}
