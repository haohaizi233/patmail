import { onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * 统一的容器级指针视差与卡片方向性光照调度：
 * 1. 使用 ResizeObserver + 被动 scroll/resize 缓存容器矩形，绝不在 pointermove 热路径调用 getBoundingClientRect()；
 * 2. 使用 requestAnimationFrame 合并高频更新，同步写入场景节点与 .workspace 祖先的 CSS 自定义属性；
 * 3. 为悬停卡片写入受控角度（±3°）与高光坐标，失活或卸载时严格对称注销监听器与 RAF。
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
  let pendingClientX = 0
  let pendingClientY = 0
  let hasPointerClient = false
  let attachedEl: HTMLElement | null = null
  let scrollHostEl: HTMLElement | null = null
  let resizeObserver: ResizeObserver | null = null
  let finePointerMql: MediaQueryList | null = null
  let activeCardEl: HTMLElement | null = null

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

  function clearActiveCard(): void {
    if (!activeCardEl) return
    activeCardEl.style.removeProperty('--card-rx')
    activeCardEl.style.removeProperty('--card-ry')
    activeCardEl.style.removeProperty('--card-lx')
    activeCardEl.style.removeProperty('--card-ly')
    activeCardEl = null
  }

  function setParallaxVars(px: string, py: string): void {
    const el = options.sceneEl.value
    if (!el) return
    el.style.setProperty('--ocean-px', px)
    el.style.setProperty('--ocean-py', py)
    const workspace = el.closest<HTMLElement>('.workspace')
    if (workspace) {
      workspace.style.setProperty('--ocean-px', px)
      workspace.style.setProperty('--ocean-py', py)
    }
  }

  function flush(): void {
    rafId = 0
    const el = options.sceneEl.value
    if (!el) return
    setParallaxVars(`${(pendingX * 10).toFixed(2)}px`, `${(pendingY * 8).toFixed(2)}px`)
    options.onPointerTarget?.(pendingX, pendingY)

    if (hasPointerClient && activeCardEl) {
      const rect = activeCardEl.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        const cx = Math.max(-0.5, Math.min(0.5, (pendingClientX - rect.left) / rect.width - 0.5)) * 2
        const cy = Math.max(-0.5, Math.min(0.5, (pendingClientY - rect.top) / rect.height - 0.5)) * 2
        activeCardEl.style.setProperty('--card-rx', `${(-cy * 3).toFixed(2)}deg`)
        activeCardEl.style.setProperty('--card-ry', `${(cx * 3).toFixed(2)}deg`)
        activeCardEl.style.setProperty('--card-lx', `${((cx * 0.5 + 0.5) * 100).toFixed(1)}%`)
        activeCardEl.style.setProperty('--card-ly', `${((cy * 0.5 + 0.5) * 100).toFixed(1)}%`)
      }
    }
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

    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('.ocean-card') : null
    if (target !== activeCardEl) {
      clearActiveCard()
      activeCardEl = target
    }
    pendingClientX = event.clientX
    pendingClientY = event.clientY
    hasPointerClient = true

    const nx = Math.max(-0.5, Math.min(0.5, (event.clientX - cachedLeft) / cachedWidth - 0.5)) * 2
    const ny = Math.max(-0.5, Math.min(0.5, (event.clientY - cachedTop) / cachedHeight - 0.5)) * 2
    schedule(nx, ny)
  }

  const onPointerLeave = () => {
    hasPointerClient = false
    clearActiveCard()
    schedule(0, 0)
  }

  const onViewportChange = () => {
    updateRectCache()
  }

  const onFinePointerChange = () => {
    if (!isFinePointer()) {
      detach()
    }
  }

  function detach(): void {
    if (attachedEl) {
      attachedEl.removeEventListener('pointermove', onPointerMove)
      attachedEl.removeEventListener('pointerleave', onPointerLeave)
      attachedEl = null
    }
    if (scrollHostEl) {
      scrollHostEl.removeEventListener('scroll', onViewportChange)
      scrollHostEl = null
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', onViewportChange)
    }
    if (finePointerMql && typeof finePointerMql.removeEventListener === 'function') {
      finePointerMql.removeEventListener('change', onFinePointerChange)
      finePointerMql = null
    }
    resizeObserver?.disconnect()
    resizeObserver = null
    if (rafId && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    hasPointerClient = false
    clearActiveCard()
    setParallaxVars('0px', '0px')
    options.onPointerTarget?.(0, 0)
  }

  watch(
    [options.sceneEl, options.active, options.reducedMotion],
    ([el, active, reduced]) => {
      if (!el || !active || reduced || !isFinePointer()) {
        detach()
        return
      }
      if (attachedEl === el) {
        updateRectCache()
        return
      }
      detach()
      updateRectCache()
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          updateRectCache()
        })
        resizeObserver.observe(el)
      }
      const workspace = el.closest<HTMLElement>('.workspace')
      if (workspace) {
        workspace.addEventListener('scroll', onViewportChange, { passive: true })
        scrollHostEl = workspace
      }
      if (typeof window !== 'undefined') {
        window.addEventListener('resize', onViewportChange, { passive: true })
        if (typeof window.matchMedia === 'function') {
          finePointerMql = window.matchMedia('(pointer: fine)')
          if (typeof finePointerMql.addEventListener === 'function') {
            finePointerMql.addEventListener('change', onFinePointerChange)
          }
        }
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
