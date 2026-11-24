export interface FrameCoalescer {
  trigger: (immediate?: boolean) => void
  flushNow: () => void
  cancel: () => void
}

/**
 * 合并高频 UI 刷新洪峰：
 * - leading：空闲期首条事件立即执行，或传 `immediate = true` 跨越阶段边界时立即执行；
 * - trailing：帧窗口内重复触发只保留状态，下一渲染帧合并刷新一次，避免高频消息阻塞主线程。
 */
export function createLeadingFrameCoalescer(flush: () => void): FrameCoalescer {
  let pending = false
  let dirty = false
  let rafId: number | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const clearScheduled = (): void => {
    if (rafId !== undefined && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(rafId)
      rafId = undefined
    }
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }

  const onFrame = (): void => {
    rafId = undefined
    timer = undefined
    if (dirty) {
      dirty = false
      flush()
      schedule()
      return
    }
    pending = false
  }

  const schedule = (): void => {
    pending = true
    if (typeof globalThis.requestAnimationFrame === 'function') {
      rafId = globalThis.requestAnimationFrame(onFrame)
    } else {
      timer = setTimeout(onFrame, 16)
    }
  }

  return {
    trigger(immediate = false) {
      if (!pending || immediate) {
        clearScheduled()
        dirty = false
        flush()
        schedule()
        return
      }
      dirty = true
    },
    flushNow() {
      clearScheduled()
      pending = false
      if (!dirty) return
      dirty = false
      flush()
    },
    cancel() {
      clearScheduled()
      pending = false
      dirty = false
    },
  }
}
