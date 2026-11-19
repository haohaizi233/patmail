import generalUrl from '../assets/billing/qingkuan-general-foreign.xlsx?url'
import mideaForeignUrl from '../assets/billing/qingkuan-midea-foreign.xlsx?url'
import mideaPctUrl from '../assets/billing/qingkuan-midea-pct.xlsx?url'
import type { BillingTemplateId } from './templates'

const URLS: Record<BillingTemplateId, string> = {
  'general-foreign': generalUrl,
  'midea-foreign': mideaForeignUrl,
  'midea-pct': mideaPctUrl
}

/** 内置的三份请款表模板（随扩展打包，只读）。 */
export async function loadBillingTemplate(id: BillingTemplateId): Promise<Uint8Array> {
  const response = await fetch(URLS[id])
  if (!response.ok) throw new Error(`请款表模板读取失败（HTTP ${response.status}）。`)
  return new Uint8Array(await response.arrayBuffer())
}
