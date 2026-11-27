import { computed, inject, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { OceanQuality } from '../rendering/render-scheduler'

export function useOceanLifecycle(options: {
  sceneEl: Ref<HTMLElement | null>
  screenActive: Ref<boolean>
  quality: Ref<OceanQuality>
  webglUnavailable: Ref<boolean>
}) {
  const activeRoute = inject<Ref<string>>('activeRoute', ref('/workflow'))
  const routeIsWorkflow = computed(() => activeRoute.value === '/workflow')
  const documentIsVisible = ref(typeof document !== 'undefined' ? !document.hidden : true)
  const sceneIsVisible = ref(true)
  const reducedMotion = ref(false)

  let intersectionObserver: IntersectionObserver | null = null
  let mediaQuery: MediaQueryList | null = null

  const onVisibilityChange = () => {
    documentIsVisible.value = typeof document !== 'undefined' ? !document.hidden : true
  }

  const onMotionChange = (event: MediaQueryListEvent) => {
    reducedMotion.value = event.matches
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.value = mediaQuery.matches
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', onMotionChange)
    }
  }

  watch(
    options.sceneEl,
    el => {
      intersectionObserver?.disconnect()
      intersectionObserver = null
      if (!el || typeof IntersectionObserver === 'undefined') {
        sceneIsVisible.value = true
        return
      }
      intersectionObserver = new IntersectionObserver(
        entries => {
          const entry = entries[0]
          if (entry) {
            sceneIsVisible.value = entry.isIntersecting || entry.intersectionRatio > 0
          }
        },
        { threshold: 0.02 }
      )
      intersectionObserver.observe(el)
    },
    { immediate: true }
  )

  const renderingActive = computed(
    () =>
      routeIsWorkflow.value &&
      options.screenActive.value &&
      documentIsVisible.value &&
      sceneIsVisible.value &&
      !reducedMotion.value &&
      options.quality.value !== 'static' &&
      !options.webglUnavailable.value
  )

  onBeforeUnmount(() => {
    intersectionObserver?.disconnect()
    intersectionObserver = null
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
    if (mediaQuery && typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', onMotionChange)
    }
  })

  return {
    routeIsWorkflow,
    documentIsVisible,
    sceneIsVisible,
    reducedMotion,
    renderingActive
  }
}
