import type { NoticeActionRequest } from '../api/notice-types'
import type { RecoveryTransport } from '../recovery/client'
import { isWriteSwitchOpen } from '../settings/write-switch'
import { isRecord } from '../shared/guards'
import { isMessage, MessageType } from '../shared/message'
import type { PctNoticeWriteTag } from '../shared/pct-notice-run'
import { WorkflowWal } from '../workflow/wal'
import { dispatchRecoveryRequest } from './recovery'

interface PctWriteProgress {
  runId: string
  confirmed: Record<string, string[]>
  pending: { step: string; ids: string[] } | null
}

function hasWriteReceipt(result: unknown): boolean {
  return isMessage(result) && result.type === MessageType.NoticeActionResult && result.payload.ok === true &&
    isRecord(result.payload.data) && result.payload.data.ok === true && !result.payload.data.needCpcLogin &&
    result.payload.data.isErrorFee !== true
}

function hasResumableProgress(value: unknown): value is PctWriteProgress {
  return isRecord(value) && typeof value.runId === 'string' && value.pending === null && isRecord(value.confirmed) &&
    Object.values(value.confirmed).every(ids => Array.isArray(ids) && ids.every((id: unknown) => typeof id === 'string'))
}

function selectTargets(request: NoticeActionRequest, run: PctNoticeWriteTag) {
  if ((request.action === 'importNotice' || request.action === 'importCloseCase') && run.importRound) {
    return {
      key: JSON.stringify([request.action, run.importRound]),
      ids: request.oaIds,
      pick: (indices: number[]): NoticeActionRequest => ({ ...request, oaIds: indices.map(index => request.oaIds[index]) })
    }
  }
  if (request.action === 'deleteDownloadOa' && !run.importRound) {
    return {
      key: request.action, ids: request.fids,
      pick: (indices: number[]): NoticeActionRequest => ({ ...request, fids: indices.map(index => request.fids[index]) })
    }
  }
  if (request.action === 'downloadTzsList' && request.isReplay && !run.importRound && request.fids?.length &&
      request.xlh?.length === request.fids.length) {
    const { fids, xlh } = request
    return {
      key: JSON.stringify([request.action, request.account]), ids: fids,
      pick: (indices: number[]): NoticeActionRequest => ({
        ...request, fids: indices.map(index => fids[index]), xlh: indices.map(index => xlh[index])
      })
    }
  }
  throw new Error('PCT 写操作的批次或目标不明确，已停止派发。')
}

export class PctNoticeWal extends WorkflowWal<unknown, PctWriteProgress> {
  constructor(journal: RecoveryTransport) { super(journal) }

  protected completed(result: unknown): boolean { return hasWriteReceipt(result) }

  runAction(
    request: NoticeActionRequest,
    tag: PctNoticeWriteTag,
    sameAccount: () => Promise<boolean>,
    send: (request: NoticeActionRequest) => Promise<unknown>
  ): Promise<unknown> {
    const targets = selectTargets(request, tag)
    if (!Array.isArray(targets.ids) || !targets.ids.length ||
        targets.ids.some(id => typeof id !== 'string' || !id.trim())) {
      throw new Error('PCT 写操作没有有效目标。')
    }
    // Share the legacy account scope so older uncertain writes remain fenced.
    const scope = JSON.stringify(['pct-notice', tag.origin, tag.operatorId.toLowerCase(), ''])
    const initial: PctWriteProgress = { runId: tag.runId, confirmed: {}, pending: null }
    return this.run(scope, false, targets.key, () => true, async (save, previous) => {
      const progress = previous?.runId === tag.runId ? previous : initial
      const known = new Set(progress.confirmed[targets.key] ?? [])
      const selected = new Set(known)
      const indices = targets.ids.flatMap((id, index) => {
        const key = id.trim()
        if (selected.has(key)) return []
        selected.add(key)
        return [index]
      })
      if (!indices.length) return {
        type: MessageType.NoticeActionResult,
        payload: { ok: true, data: { ok: true, message: '本批次已确认完成这些目标。' } }
      }
      const ids = indices.map(index => targets.ids[index].trim())
      await save({ ...progress, pending: { step: targets.key, ids } })
      if (!isWriteSwitchOpen() || !await sameAccount().catch(() => false) || !isWriteSwitchOpen()) {
        await save(progress)
        throw new Error('PCT 写开关或原 EASY 账号已变化，本批请求没有发送。')
      }
      const result = await send(targets.pick(indices))
      if (hasWriteReceipt(result)) {
        await save({ ...progress, confirmed: { ...progress.confirmed, [targets.key]: [...selected] } })
      } else if (isMessage(result) && result.type === MessageType.NoticeActionResult && result.payload.ok &&
          isRecord(result.payload.data) && result.payload.data.ok === true && result.payload.data.isErrorFee === true) {
        throw new Error('PCT 导入回执包含费用异常，请到 EASY 核对这批目标。')
      }
      return result
    }, { initial, canResume: hasResumableProgress })
  }
}

export const pctNoticeWal = new PctNoticeWal(dispatchRecoveryRequest)
