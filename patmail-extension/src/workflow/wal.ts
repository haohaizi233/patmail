import type { RecoveryTransport } from '../recovery/client'
import { isRecord } from '../shared/guards'

/** New workflow writes use this entry point so dispatch always follows a durable intent. */
export abstract class WorkflowWal<Result, Progress = never> {
  private readonly active = new Set<string>()

  constructor(private readonly journal: RecoveryTransport) {}

  protected abstract completed(result: Result): boolean

  async run(
    scope: string,
    once: boolean,
    step: string,
    canDispatch: () => boolean | Promise<boolean>,
    dispatch: (checkpoint: (progress: Progress) => Promise<void>, progress: Progress | undefined) => Promise<Result>,
    recovery?: { initial: Progress; canResume(value: unknown): value is Progress }
  ): Promise<Result> {
    if (this.active.has(scope)) throw new Error('该工作流正在执行，请等待当前结果。')
    this.active.add(scope)
    try {
      return await this.runLocked(scope, once, step, canDispatch, dispatch, recovery)
    } finally {
      this.active.delete(scope)
    }
  }

  private async runLocked(
    scope: string,
    once: boolean,
    step: string,
    canDispatch: () => boolean | Promise<boolean>,
    dispatch: (checkpoint: (progress: Progress) => Promise<void>, progress: Progress | undefined) => Promise<Result>,
    recovery?: { initial: Progress; canResume(value: unknown): value is Progress }
  ): Promise<Result> {
    const key = { slot: 'workflow-write' as const, scope }
    const head = await this.journal({ ...key, op: 'get' })
    const previous = head.payload ?? null
    let progress = recovery?.initial
    if (previous !== null) {
      if (!isRecord(previous) || !['pending', 'completed', 'not-sent'].includes(String(previous.state))) {
        throw new Error('工作流 WAL 记录无效，已停止发送。')
      }
      const resumed = recovery?.canResume(previous.progress) === true
      if (resumed) progress = previous.progress as Progress
      if (previous.state === 'pending' && !resumed) {
        throw new Error('上次工作流写入结果未确认，已拦截重复执行。请先到 EASY 核对。')
      }
      if (once && previous.state === 'completed') throw new Error('该工作流写入已完成，请刷新状态。')
    }

    let revision = head.revision ?? 0
    const save = async (state: 'pending' | 'not-sent' | 'completed', next = progress) => {
      const reply = await this.journal({
        ...key, op: 'put', expectedRevision: revision,
        payload: { step, at: Date.now(), state, ...(next === undefined ? {} : { progress: next }) }
      })
      if (reply.revision === undefined) throw new Error('工作流 WAL 没有返回提交版本，已停止发送。')
      revision = reply.revision
      progress = next
    }
    await save('pending')
    if (!(await canDispatch())) {
      await save('not-sent')
      throw new Error('发送前会话或写开关已变化，工作流没有发送。')
    }
    const result = await dispatch(next => save('pending', next), progress)
    if (this.completed(result)) {
      await save('completed')
    }
    return result
  }
}
