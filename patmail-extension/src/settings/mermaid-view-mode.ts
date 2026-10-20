/** A user-wide reading preference, independent of the EASY account/session. */
export const MERMAID_VIEW_MODE_KEY = 'patmail.mermaidViewMode.v1'
export type MermaidViewMode = 'window' | 'width' | 'original'

let current: MermaidViewMode = 'window'
let revision = 0
let writes = Promise.resolve(true)

function storage(): chrome.storage.LocalStorageArea | undefined {
  return typeof chrome === 'undefined' ? undefined : chrome.storage?.local
}

function normalize(value: unknown): MermaidViewMode {
  return value === 'width' || value === 'original' ? value : 'window'
}

export async function loadMermaidViewMode(): Promise<MermaidViewMode> {
  const mine = revision
  const area = storage()
  if (!area) return current
  try {
    // A viewer can close/reopen faster than chrome.storage finishes its write.
    await writes
    const saved = await area.get(MERMAID_VIEW_MODE_KEY)
    if (mine === revision) current = normalize(saved[MERMAID_VIEW_MODE_KEY])
  } catch {
    // Keep this page's last choice if extension storage is temporarily unavailable.
  }
  return current
}

export function saveMermaidViewMode(next: MermaidViewMode): Promise<boolean> {
  current = normalize(next)
  revision += 1
  const chosen = current
  const area = storage()
  if (!area) return Promise.resolve(false)
  // Serial writes ensure a slow older click cannot overwrite the latest choice.
  writes = writes.then(async () => {
    try {
      await area.set({ [MERMAID_VIEW_MODE_KEY]: chosen })
      return true
    } catch {
      return false
    }
  })
  return writes
}
