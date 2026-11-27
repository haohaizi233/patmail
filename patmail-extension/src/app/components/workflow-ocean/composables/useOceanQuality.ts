import { ref } from 'vue'
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
  return 'balanced'
}

export function useOceanQuality() {
  const quality = ref<OceanQuality>(readStoredQuality())
  const webglUnavailable = ref(false)

  function setQuality(next: OceanQuality): void {
    quality.value = next
    try {
      globalThis.localStorage?.setItem(QUALITY_STORAGE_KEY, next)
    } catch {
      // 忽略受限存储上下文
    }
  }

  function markWebglUnavailable(): void {
    webglUnavailable.value = true
  }

  return {
    quality,
    webglUnavailable,
    setQuality,
    markWebglUnavailable
  }
}
