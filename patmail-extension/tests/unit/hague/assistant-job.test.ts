import { expect, it } from 'vitest'
import { requestAssistantJob, type AssistantJobRequest } from '../../../src/app/assistant-job'
it('uses the assistant event protocol and fails promptly when the assistant is absent', async () => {
  await expect(requestAssistantJob('materials', 'batch')).rejects.toThrow('助手尚未就绪')
  const listener = (e: Event) => { const job = (e as CustomEvent<AssistantJobRequest>).detail; job.accepted = true; job.resolve('reply') }
  window.addEventListener('patmail-agent-workflow', listener)
  try { await expect(requestAssistantJob('materials', 'batch')).resolves.toBe('reply') }
  finally { window.removeEventListener('patmail-agent-workflow', listener) }
})
