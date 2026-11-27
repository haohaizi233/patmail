import { trustedOrigin } from '../api/config'
import type { FeeReduceCheckpointPhase, FeeReduceSubmitRequest } from '../api/fee-reduce-types'
import { isQueryGuid } from '../query/query-validator'
import type { ExpectedAccountScope } from '../shared/connection'
import { FEE_REDUCE_CHECKPOINT } from '../shared/fee-reduce-checkpoint'
import { isRecord } from '../shared/guards'
import { isMessage, MessageType } from '../shared/message'

export type FeeReduceProgress =
  | { phase: 'preflight' | 'creating' }
  | { phase: 'draft' | 'submitting'; filingId: string }

export function canResumeFeeReduce(value: unknown): value is FeeReduceProgress {
  return isRecord(value) && (value.phase === 'preflight' ||
    (value.phase === 'draft' && typeof value.filingId === 'string' && isQueryGuid(value.filingId)))
}

interface ActiveRun {
  account: ExpectedAccountScope
  process: Pick<FeeReduceSubmitRequest, 'caseId' | 'procId'>
  progress: FeeReduceProgress
  save(progress: FeeReduceProgress): Promise<void>
  canWrite(): Promise<boolean>
  checking?: boolean
}

const activeRuns = new Map<string, ActiveRun>()

export async function withFeeReduceCheckpoint(
  run: ActiveRun,
  dispatch: (token: string, resumeFilingId?: string) => Promise<unknown>
): Promise<unknown> {
  const token = crypto.randomUUID()
  activeRuns.set(token, run)
  try {
    const result = await dispatch(token, run.progress.phase === 'draft' ? run.progress.filingId : undefined)
    if (isMessage(result) && result.type === MessageType.SubmitFeeReduceFilingResult && result.payload.ok) {
      const { data } = result.payload
      if (data.outcome === 'already_completed') {
        if ((run.progress.phase !== 'preflight' && run.progress.phase !== 'draft') ||
            data.caseId.toLowerCase() !== run.process.caseId.toLowerCase() ||
            data.procId.toLowerCase() !== run.process.procId.toLowerCase() || !await run.canWrite()) {
          throw new Error('费减回查结果与当前执行上下文不符，请到 EASY 核对。')
        }
      } else if (run.progress.phase !== 'submitting' || data.filingId.toLowerCase() !== run.progress.filingId.toLowerCase()) {
        throw new Error('费减提交回执与 WAL 不一致，请到 EASY 核对。')
      }
    } else if (run.progress.phase === 'creating' || run.progress.phase === 'submitting') {
      throw new Error('EASY 未返回明确成功回执。')
    }
    return result
  } catch (error) {
    if (run.progress.phase === 'creating' || run.progress.phase === 'submitting') {
      const stage = run.progress.phase === 'creating' ? '建单' : '最终提交'
      throw new Error(`费减${stage}结果未确认，请到 EASY 核对。`, { cause: error })
    }
    throw error
  } finally {
    activeRuns.delete(token)
  }
}

async function advance(
  token: string, run: ActiveRun, phase: FeeReduceCheckpointPhase, filingId?: string
): Promise<void> {
  const { progress } = run
  const isCreated = progress.phase === 'creating' && phase === 'draft' && filingId
  let next: FeeReduceProgress
  if (progress.phase === 'preflight' && phase === 'creating') {
    next = { phase }
  } else if (isCreated || (progress.phase === 'draft' && filingId === progress.filingId && phase !== 'creating')) {
    next = { phase: phase === 'submitting' ? 'submitting' : 'draft', filingId: filingId }
  } else {
    throw new Error('费减 WAL 阶段不匹配，已停止派发。')
  }

  // Receipt belongs to the already-dispatched creation even if the account has since changed.
  if (isCreated) {
    await run.save(next)
    run.progress = next
  }
  if (!await run.canWrite() || activeRuns.get(token) !== run) {
    throw new Error('EASY 登录账号或写开关已变化，费减递交已停止。')
  }
  if (!isCreated && progress.phase !== next.phase) {
    await run.save(next)
    run.progress = next
  }
}

export function handleFeeReduceCheckpoint(
  message: unknown, sender: chrome.runtime.MessageSender, respond: (reply: unknown) => void
): boolean {
  if (!isRecord(message) || message.type !== FEE_REDUCE_CHECKPOINT) return false
  const { token, phase, filingId } = message
  const run = typeof token === 'string' ? activeRuns.get(token) : undefined
  if (!run || typeof token !== 'string' ||
      sender.id !== chrome.runtime.id || sender.tab?.id !== run.account.easyTabId ||
      trustedOrigin(sender.url ?? '') !== run.account.easyOrigin ||
      (phase !== 'creating' && phase !== 'draft' && phase !== 'submitting') ||
      (phase === 'creating' ? filingId !== undefined : typeof filingId !== 'string' || !isQueryGuid(filingId))) {
    respond({ ok: false, error: '费减 WAL 执行上下文已失效，请重新核对。' })
    return true
  }
  if (run.checking) {
    respond({ ok: false, error: '上一笔费减 WAL 检查点尚未完成。' })
    return true
  }
  run.checking = true
  void advance(token, run, phase, typeof filingId === 'string' ? filingId : undefined).then(
    () => { run.checking = false; respond({ ok: true }) },
    (error: unknown) => {
      run.checking = false
      respond({ ok: false, error: error instanceof Error ? error.message : '费减检查点写入失败。' })
    }
  )
  return true
}
