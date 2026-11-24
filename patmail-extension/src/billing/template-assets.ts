import generalUrl from '../assets/billing/qingkuan-general-foreign.xlsx?url'
import mideaForeignUrl from '../assets/billing/qingkuan-midea-foreign.xlsx?url'
import mideaPctUrl from '../assets/billing/qingkuan-midea-pct.xlsx?url'
import type { BillingTemplateId } from './templates'

const URLS: Record<BillingTemplateId, string> = {
  'general-foreign': generalUrl,
  'midea-foreign': mideaForeignUrl,
  'midea-pct': mideaPctUrl
}

const templateCache = new Map<BillingTemplateId, Promise<Uint8Array>>()

/** 内置的三份请款表模板（随扩展打包，只读），按模板 ID 缓存在内存中。 */
export function loadBillingTemplate(id: BillingTemplateId): Promise<Uint8Array> {
  const cached = templateCache.get(id)
  if (cached) return cached
  const pending = fetch(URLS[id])
    .then(async response => {
      if (!response.ok) throw new Error(`请款表模板读取失败（HTTP ${response.status}）。`)
      return new Uint8Array(await response.arrayBuffer())
    })
    .catch(error => {
      if (templateCache.get(id) === pending) templateCache.delete(id)
      throw error
    })
  templateCache.set(id, pending)
  return pending
}
