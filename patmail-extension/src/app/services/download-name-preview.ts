import type { FileDownloadSelection } from '../../mail/download-name'
import { MessageType, type MessageBridge } from '../../shared/message'

export function downloadNameRecipeKey(selection: FileDownloadSelection | null): string {
  return JSON.stringify(selection ? [selection.templateId ?? '', selection.newFilename ?? '', selection.fileNameType ?? '', selection.column ?? '', selection.fixedText ?? ''] : null)
}

export interface DownloadNamePreviewState {
  names: Record<string, string>
  done: number
  total: number
  pending: boolean
  error: string
}

/** Each generation owns its requests; late bridge replies cannot alter the current recipe. */
export function createDownloadNamePreview(bridge: MessageBridge, changed: (state: DownloadNamePreviewState) => void) {
  const cache = new Map<string, Record<string, string>>()
  const inFlight = new Map<string, Promise<Record<string, string>>>()
  let generation = 0
  let context = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  function cancel() {
    generation++
    if (timer) clearTimeout(timer)
  }
  function clear() {
    cancel()
    context++
    cache.clear()
    inFlight.clear()
    changed({ names: {}, done: 0, total: 0, pending: false, error: '' })
  }
  function refresh(ids: string[], selection: FileDownloadSelection | null, enabled = true) {
    cancel()
    const current = generation
    const owner = context
    const key = downloadNameRecipeKey(selection)
    let known = cache.get(key)
    if (!known) {
      known = {}
      cache.set(key, known)
      if (cache.size > 8) cache.delete(cache.keys().next().value!)
    }
    const names = known
    const unique = [...new Set(ids)]
    const missing = unique.filter(id => !names[id])
    let failure = ''
    const publish = (pending: boolean) => {
      if (current !== generation) return
      const available = Object.fromEntries(unique.filter(id => names[id]).map(id => [id, names[id]]))
      changed({ names: available, done: Object.keys(available).length, total: unique.length, pending, error: failure })
    }
    publish(Boolean(selection && enabled && missing.length))
    if (!selection || !enabled || !missing.length) return
    const frozen = { ...selection }
    // The visible edited recipe is authoritative; do not reload its saved template.
    if (frozen.newFilename && frozen.fileNameType) delete frozen.templateId
    function resolveBatch(batch: string[]): Promise<Record<string, string>> {
      const requestKey = JSON.stringify([owner, key, batch])
      const existing = inFlight.get(requestKey)
      if (existing) return existing
      const request = (async () => {
        const response = await bridge.request({ type: MessageType.ResolveDownloadNames, payload: { fileIds: batch, selection: frozen } })
        if (response.type !== MessageType.ResolveDownloadNamesResult || !response.payload.ok) throw new Error(response.type === MessageType.Error ? response.payload.message : response.type === MessageType.ResolveDownloadNamesResult && !response.payload.ok ? response.payload.error.message : '下载名称预览失败。')
        const resolved = response.payload.data.names
        if (resolved.length !== batch.length) throw new Error('下载名称预览数量不一致。')
        return Object.fromEntries(batch.map((id, index) => [id, resolved[index]]))
      })().finally(() => { inFlight.delete(requestKey) })
      inFlight.set(requestKey, request)
      return request
    }
    timer = setTimeout(() => {
      let cursor = 0
      async function worker() {
        while (current === generation && cursor < missing.length) {
          const batch = missing.slice(cursor, cursor += 40)
          try {
            const resolved = await resolveBatch(batch)
            // Each subscriber merges into its own cache record, including after LRU eviction.
            // Replies belonging to a previous account/query cannot seed this context.
            if (owner !== context) return
            Object.assign(names, resolved)
            publish(true)
          } catch (error) {
            if (current !== generation) return
            failure = error instanceof Error ? error.message : '下载名称预览失败。'
          }
        }
      }
      void Promise.all(Array.from({ length: Math.min(6, Math.ceil(missing.length / 40)) }, worker)).then(() => publish(false))
    }, 250)
  }
  return { refresh, cancel, clear }
}
