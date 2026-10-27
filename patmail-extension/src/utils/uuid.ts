/** crypto.randomUUID 只在安全上下文可用，EASY 是 http 页面，内容脚本里拿不到；getRandomValues 到处都有。 */
export function newUuid(): string {
  const api = globalThis.crypto
  if (typeof api?.randomUUID === 'function') return api.randomUUID()
  const hex = Array.from(api.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
