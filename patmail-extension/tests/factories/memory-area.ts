import type { LocalArea } from '../../src/background/account-data'

export interface MemoryArea extends LocalArea {
  remove(key: string): Promise<void>
  dump(): Record<string, unknown>
}

export function memoryArea(): MemoryArea {
  const store: Record<string, unknown> = {}
  return {
    async get(key) { return { [key]: store[key] } },
    async set(items) { Object.assign(store, items) },
    async remove(key) { delete store[key] },
    dump: () => store
  }
}
