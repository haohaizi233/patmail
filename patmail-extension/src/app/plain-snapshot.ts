import { toRaw } from 'vue'

/**
 * 将含 Vue Proxy 的对象树剥离为可被 `structuredClone` / `chrome.runtime.sendMessage`
 * 直接发送的纯 JS 对象，避免大快照反复走 `JSON.parse(JSON.stringify(...))`。
 */
export function toPlainCloneable<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  const raw = toRaw(value)
  if (raw instanceof Date) return new Date(raw.getTime()) as unknown as T
  if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) return raw
  if (Array.isArray(raw)) {
    const out: unknown[] = new Array<unknown>(raw.length)
    for (let i = 0; i < raw.length; i += 1) {
      out[i] = toPlainCloneable(raw[i])
    }
    return out as T
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(raw as Record<string, unknown>)) {
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') continue
    out[key] = toPlainCloneable(item)
  }
  return out as T
}
