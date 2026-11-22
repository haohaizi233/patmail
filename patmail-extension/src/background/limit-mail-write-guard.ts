import { limitMailProcIds, type LimitMailSubmitItem, type LimitMailSubmitResult } from '../customer/limit-mail-submit'
import { isRecord } from '../shared/guards'
import { isMessage, MessageType } from '../shared/message'

type Mark = { state: 'submitted' | 'created' | 'unknown'; mailId: string; at: number }
type Marks = Record<string, Mark>

export interface LimitMailWriteJournal {
  load(scope: string): Promise<unknown>
  save(scope: string, marks: Marks): Promise<void>
}

function parseMarks(raw: unknown): Marks {
  if (raw === null || raw === undefined) return {}
  if (!isRecord(raw)) throw new Error('发文恢复记录格式无效。')
  const entries: Array<[string, Mark]> = []
  for (const [id, mark] of Object.entries(raw)) {
    if (
      !isRecord(mark) ||
      (mark.state !== 'submitted' && mark.state !== 'created' && mark.state !== 'unknown') ||
      typeof mark.mailId !== 'string' ||
      typeof mark.at !== 'number'
    ) {
      throw new Error('发文恢复记录格式无效。')
    }
    entries.push([id, { state: mark.state, mailId: mark.mailId, at: mark.at }])
  }
  return Object.fromEntries(entries)
}

export function createLimitMailWriteGuard(journal: LimitMailWriteJournal) {
  let queue = Promise.resolve()
  function update<T>(scope: string, change: (marks: Marks) => T | Promise<T>): Promise<T> {
    const next = queue.then(async () => {
      const marks = parseMarks(await journal.load(scope))
      const result = await change(marks)
      await journal.save(scope, marks)
      return result
    })
    queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return async function guard(
    scope: string,
    items: LimitMailSubmitItem[],
    isSameAccount: () => boolean,
    writeEnabled: () => boolean,
    send: (eligible: LimitMailSubmitItem[]) => Promise<unknown>,
    allowsNewLetter?: (procId: string, caseId: string) => Promise<boolean>,
  ) {
    const results: LimitMailSubmitResult[] = []
    const previous = new Map<string, Mark | undefined>()
    const eligible: LimitMailSubmitItem[] = []
    const resultMessage = () => ({
      type: MessageType.SubmitLimitMailResult,
      payload: { stopped: false, results },
    })
    const finishItem = (item: LimitMailSubmitItem, state: LimitMailSubmitResult['state'], message: string) => {
      for (const procId of limitMailProcIds(item)) results.push({ procId, mailId: '', state, message })
    }
    const canDispatch = () => isSameAccount() && writeEnabled()
    const requestedIds = items.flatMap(item => limitMailProcIds(item).map(id => id.toLowerCase()))
    if (requestedIds.length !== new Set(requestedIds).size) {
      for (const item of items) finishItem(item, 'failed', '批次内存在重复事项，没有发送。')
      return resultMessage()
    }
    try {
      if (!canDispatch()) {
        for (const item of items) finishItem(item, 'failed', '派发前会话或写开关已变化，没有发送。')
        return resultMessage()
      }
      await update(scope, async marks => {
        for (const item of items) {
          const ids = limitMailProcIds(item).map(id => id.toLowerCase())
          let conflict: Mark | undefined = ids.map(id => marks[id]).find(mark => mark?.state === 'unknown')
          if (!conflict) for (const id of ids) {
            const mark = marks[id]
            if (!mark || (mark.state === 'created' && mark.mailId && mark.mailId === item.mailId)) continue
            const caseId = item.caseIdsByProc?.[id]
            if (!item.mailId && mark.state === 'submitted' && caseId && allowsNewLetter &&
                await allowsNewLetter(id, caseId).catch(() => false)) continue
            conflict = mark
            break
          }
          if (conflict) {
            finishItem(
              item,
              conflict.state === 'unknown' ? 'unknown' : 'failed',
              conflict.state === 'unknown' ? '原写入结果未确认，已拦截再次提交。' : '已有发文记录，当前流程没有确认可再发。',
            )
            continue
          }
          eligible.push(item)
          for (const id of ids) {
            previous.set(id, marks[id])
            marks[id] = { state: 'unknown', mailId: item.mailId ?? '', at: Date.now() }
          }
        }
      })
    } catch {
      results.length = 0
      for (const item of items) finishItem(item, 'failed', '没有建立发文恢复记录，没有发送。')
      return resultMessage()
    }

    if (!eligible.length) return resultMessage()
    const restore = (marks: Marks, id: string) => {
      const prior = previous.get(id)
      if (prior) marks[id] = prior
      else delete marks[id]
    }
    if (!canDispatch()) {
      await update(scope, marks => {
        for (const id of previous.keys()) restore(marks, id)
      }).catch(() => undefined)
      for (const item of eligible) finishItem(item, 'failed', '派发前会话或写开关已变化，没有发送。')
      return resultMessage()
    }

    let receipt: unknown
    try {
      receipt = await send(eligible)
    } catch {
      // A persisted intent survives a lost reply or a Service Worker restart.
    }
    const returned =
      isMessage(receipt) && receipt.type === MessageType.SubmitLimitMailResult && isSameAccount()
        ? receipt.payload
        : null
    const received = new Map<string, LimitMailSubmitResult>()
    for (const entry of returned?.results ?? []) {
      const id = entry.procId.toLowerCase()
      if (!previous.has(id)) continue
      received.set(
        id,
        received.has(id)
          ? { procId: entry.procId, state: 'unknown', mailId: '', message: '返回了重复的事项回执。' }
          : entry,
      )
    }
    for (const item of eligible) {
      for (const procId of limitMailProcIds(item)) {
        results.push(
          received.get(procId.toLowerCase()) ?? {
            procId,
            mailId: item.mailId ?? '',
            state: 'unknown',
            message: '未确认该事项写入结果，请核对 EASY。',
          },
        )
      }
    }
    await update(scope, marks => {
      for (const [id, entry] of received) {
        if (entry.state === 'failed') restore(marks, id)
        else marks[id] = { state: entry.state, mailId: entry.mailId, at: Date.now() }
      }
    }).catch(() => undefined)
    return { type: MessageType.SubmitLimitMailResult, payload: { stopped: returned?.stopped ?? true, results } }
  }
}
