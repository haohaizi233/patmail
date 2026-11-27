import { onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * 统一的容器级指针视差调度：
 * 1. 使用 ResizeObserver 缓存容器矩形尺寸，绝不在 pointermove 中读取 getBoundingClientRect()；
 * 2. 使用 requestAnimationFrame 合并高频更新，直接写入 CSS 自定义属性；
 * 3. 失活或卸载时立刻注销监听器与 RAF。
 */
export function useOceanCamera(options: {
  sceneEl: Ref<HTMLElement | null>
  active: Ref<boolean>
  reducedMotion: Ref<boolean>
  onPointerTarget?: (nx: number, ny: number) => void
}) {
  let cachedWidth = 0
  let cachedHeight = 0
  let cachedLeft = 0
  let cachedTop = 0
  let rafId = 0
  let pendingX = 0
  let pendingY = 0
  let attachedEl: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null

  function isFinePointer(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia('(pointer: fine)').matches
  }

  function updateRectCache(): void {
    const el = options.sceneEl.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    cachedLeft = rect.left
    cachedTop = rect.top
    cachedWidth = rect.width
    cachedHeight = rect.height
  }

  function flush(): void {
    rafId = 0
    const el = options.sceneEl.value
    if (!el) return
    el.style.setProperty('--ocean-px', `${(pendingX * 10).toFixed(2)}px`)
    el.style.setProperty('--ocean-py', `${(pendingY * 8).toFixed(2)}px`)
    options.onPointerTarget?.(pendingX, pendingY)
  }

  function schedule(nx: number, ny: number): void {
    pendingX = nx
    pendingY = ny
    if (!rafId && typeof requestAnimationFrame === 'function') {
      rafId = requestAnimationFrame(flush)
    }
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!options.active.value || options.reducedMotion.value) return
    if (!cachedWidth || !cachedHeight) updateRectCache()
    if (!cachedWidth || !cachedHeight) return
    const nx = Math.max(-0.5, Math.min(0.5, (event.clientX - cachedLeft) / cachedWidth - 0.5)) * 2
    const ny = Math.max(-0.5, Math.min(0.5, (event.clientY - cachedTop) / cachedHeight - 0.5)) * 2
    schedule(nx, ny)
  }

  const onPointerLeave = () => {
    schedule(0, 0)
  }

  function detach(): void {
    if (attachedEl) {
      attachedEl.removeEventListener('pointermove', onPointerMove)
      attachedEl.removeEventListener('pointerleave', onPointerLeave)
      attachedEl = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    const el = options.sceneEl.value
    if (el) {
      el.style.setProperty('--ocean-px', '0px')
      el.style.setProperty('--ocean-py', '0px')
    }
    options.onPointerTarget?.(0, 0)
  }

  watch(
    [options.sceneEl, options.active, options.reducedMotion],
    ([el, active, reduced]) => {
      if (!el || !active || reduced || !isFinePointer()) {
        detach()
        return
      }
      if (attachedEl === el) return
      detach()
      updateRectCache()
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          updateRectCache()
        })
        resizeObserver.observe(el)
      }
      el.addEventListener('pointermove', onPointerMove, { passive: true })
      el.addEventListener('pointerleave', onPointerLeave, { passive: true })
      attachedEl = el
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    detach()
  })
}
