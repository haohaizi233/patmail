import { computed, ref } from 'vue'
import type { OceanQuality } from '../rendering/render-scheduler'

const QUALITY_STORAGE_KEY = 'patmail.workflow.ocean-quality.v1'

function readStoredQuality(): OceanQuality {
  try {
    const raw = globalThis.localStorage?.getItem(QUALITY_STORAGE_KEY)
    if (raw === 'cinema' || raw === 'balanced' || raw === 'eco' || raw === 'static') {
      return raw
    }
  } catch {
    // 忽略受限存储上下文
  }
  return 'static'
}

export function useOceanQuality() {
  const preferredQuality = ref<OceanQuality>(readStoredQuality())
  const overrideQuality = ref<OceanQuality | null>(null)
  const fallbackReason = ref<string | null>(null)
  const webglUnavailable = ref(false)

  const effectiveQuality = computed<OceanQuality>(() => {
    if (preferredQuality.value === 'static') return 'static'
    if (webglUnavailable.value) return 'static'
    return overrideQuality.value ?? preferredQuality.value
  })

  function setQuality(next: OceanQuality): void {
    preferredQuality.value = next
    overrideQuality.value = null
    if (next === 'static') {
      fallbackReason.value = null
    }
    try {
      globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, next)
    } catch {
      // 忽略受限存储上下文
    }
  }

  function setEffectiveOverride(next: OceanQuality, reason: string | null): void {
    if (preferredQuality.value === 'static') return
    overrideQuality.value = next
    fallbackReason.value = reason
  }

  function clearOverride(): void {
    overrideQuality.value = null
    fallbackReason.value = null
  }

  function markWebglUnavailable(reason = 'webgl-unavailable'): void {
    webglUnavailable.value = true
    overrideQuality.value = 'static'
    fallbackReason.value = reason
  }

  function resetForRetry(): void {
    webglUnavailable.value = false
    overrideQuality.value = null
    fallbackReason.value = null
  }

  return {
    quality: preferredQuality,
    preferredQuality,
    effectiveQuality,
    fallbackReason,
    webglUnavailable,
    setQuality,
    setEffectiveOverride,
    clearOverride,
    markWebglUnavailable,
    resetForRetry
  }
}
