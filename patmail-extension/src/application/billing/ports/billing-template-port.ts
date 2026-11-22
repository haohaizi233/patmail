import type { BillingTemplateId } from '../../../billing/templates'

/** 读取内置或外部请款单 Excel 模板原始字节的端口。 */
export interface BillingTemplatePort {
  loadTemplate(id: BillingTemplateId): Promise<Uint8Array>
}
