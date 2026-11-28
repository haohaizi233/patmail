import { PATENT_EXPORT_WORKFLOW_ID } from '../api/fee-export'
import { MessageType, isMessage, type ContentRequest } from '../shared/message'
import { isWriteSwitchOpen } from '../settings/write-switch'
import { isRecord } from '../shared/guards'
import { WorkflowWal } from '../workflow/wal'
import { dispatchRecoveryRequest } from './recovery'
import { canResumeFeeReduce, type FeeReduceProgress } from './fee-reduce-checkpoint'

class EasyWorkflowWal extends WorkflowWal<{ result: unknown; requestType: string }, FeeReduceProgress> {
  protected completed({ result, requestType }: { result: unknown; requestType: string }): boolean {
    if (!isMessage(result) || result.type !== `${requestType}_RESULT`) return false
    const payload: unknown = result.payload
    if (!isRecord(payload) || payload.ok !== true) return false
    if (result.type === MessageType.NoticeActionResult) {
      return isRecord(payload.data) && payload.data.ok === true && !payload.data.needCpcLogin
    }
    return true
  }
}

const wal = new EasyWorkflowWal(dispatchRecoveryRequest)

const READ_ONLY_WORKFLOW_REQUESTS = new Set<ContentRequest['type']>([
  MessageType.LoadNoticeInit, MessageType.SearchNotice, MessageType.ExportNotice,
  MessageType.InspectFeeReduceCases, MessageType.ReadFeeReduceReviewers
])

export function workflowWriteStep(message: ContentRequest, targeted: boolean, workflowId?: string) {
  const requestType = message.type
  if (message.type === MessageType.SubmitFeeReduceFiling) {
    return { workflow: 'fee-reduce', step: 'submit', target: message.payload.procId.toLowerCase(), once: true, requestType }
  }
  if ((targeted || workflowId) && message.type === MessageType.NoticeAction) {
    const { action } = message.payload
    if (action === 'deleteDownloadOa' || action === 'downloadTzsList' ||
        action === 'importNotice' || action === 'importCloseCase') {
      return { workflow: 'pct-notice', step: action, target: '', once: false, requestType }
    }
    if (action === 'importCheck') return null
    if (workflowId) return { workflow: workflowId, step: action, target: '', once: false, requestType }
  }
  if (message.type === MessageType.FeeExportConfig && message.payload.belongKey === 'ICSearch') {
    const { action, typeId } = message.payload
    if (action === 'list' || action === 'detail') return null
    return { workflow: PATENT_EXPORT_WORKFLOW_ID, step: action, target: typeId?.toLowerCase() || 'templates', once: false, requestType }
  }
  if (message.type === MessageType.ExportFee && message.payload.mode === 'patent') {
    return { workflow: PATENT_EXPORT_WORKFLOW_ID, step: 'export', target: '', once: false, requestType }
  }
  if (!workflowId || READ_ONLY_WORKFLOW_REQUESTS.has(requestType)) return null
  return { workflow: workflowId, step: requestType, target: '', once: false, requestType }
}

export async function runWorkflowWrite(
  write: NonNullable<ReturnType<typeof workflowWriteStep>>,
  account: { easyOrigin: string; operatorId: string },
  sameAccount: () => boolean | Promise<boolean>,
  dispatch: (checkpoint: (progress: FeeReduceProgress) => Promise<void>, progress: FeeReduceProgress | undefined) => Promise<unknown>
): Promise<unknown> {
  if (!isWriteSwitchOpen()) throw new Error('写开关已关闭，工作流没有发送。')
  const scope = JSON.stringify([write.workflow, account.easyOrigin, account.operatorId.toLowerCase(), write.target])
  const { result } = await wal.run(scope, write.once, write.step,
    async () => (await sameAccount()) && isWriteSwitchOpen(),
    async (checkpoint, progress) => ({ result: await dispatch(checkpoint, progress), requestType: write.requestType }),
    write.requestType === MessageType.SubmitFeeReduceFiling ? { initial: { phase: 'preflight' }, canResume: canResumeFeeReduce } : undefined)
  return result
}
