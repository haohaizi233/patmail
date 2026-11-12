export const DOCUMENT_EXPORT_CHANNEL = 'PATMAIL_DOCUMENT_EXPORT'
export const documentExportOwner = (extensionId: string) => JSON.stringify(['extension-export', extensionId])
export function safePdfFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 180 &&
    /\.pdf$/i.test(value) &&
    !/[\\/]/.test(value) &&
    [...value].every(c => c.charCodeAt(0) >= 32)
  )
}
export function safeExportFileName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 180 &&
    /\.(?:pdf|zip)$/i.test(value) &&
    !/[\\/]/.test(value) &&
    [...value].every(c => c.charCodeAt(0) >= 32)
  )
}
