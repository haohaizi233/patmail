import { HAGUE_ARBITRATION_SKILL } from '../agent/hague-skill'
export interface AssistantJobRequest {
  id: string; skill: typeof HAGUE_ARBITRATION_SKILL; message: string; label: string; signal?: AbortSignal; accepted: boolean
  onStart?: () => void; resolve(text: string): void; reject(error: Error): void
}
export function requestAssistantJob(message: string, label: string, signal?: AbortSignal, onStart?: () => void): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new Error('已停止')); return }
    let settled = false
    const finish = (text?: string, error?: Error) => {
      if (settled) return
      settled = true; signal?.removeEventListener('abort', abort)
      if (error) reject(error); else resolve(text ?? '')
    }
    const abort = () => finish(undefined, new Error('已停止'))
    signal?.addEventListener('abort', abort, { once: true })
    const request: AssistantJobRequest = { id: crypto.randomUUID(), skill: HAGUE_ARBITRATION_SKILL, message, label, signal, onStart, accepted: false, resolve: text => finish(text), reject: error => finish(undefined, error) }
    window.dispatchEvent(new CustomEvent('patmail-agent-workflow', { detail: request }))
    if (!request.accepted) finish(undefined, new Error('AI 助手尚未就绪，请打开助手后重试本案。'))
  })
}
