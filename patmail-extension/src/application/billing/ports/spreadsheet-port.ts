import type { BillingInput, BillingResult, BillingTemplateId } from '../../../billing/templates'

/** Excel 工作簿填充端口，隔离具体 OOXML 解析实现。 */
export interface SpreadsheetPort {
  fill(templateId: BillingTemplateId, templateBytes: Uint8Array, input: BillingInput): Promise<BillingResult>
}
