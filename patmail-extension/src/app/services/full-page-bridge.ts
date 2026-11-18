import { MessageType, type ContentResponse, type MessageBridge } from '../../shared/message'
import { fileSearchTimeoutMs } from '../../api/file-search-params'
import { sendToBackground } from '../../utils/runtime'
import { waitForDownloadJob } from '../../utils/download-job'

/** 完整页面只通过后台把有类型的请求送到已绑定的 EASY 标签页。 */
export function createFullPageBridge(): MessageBridge {
  const bridge: MessageBridge = {
    async request(message, signal): Promise<ContentResponse> {
      if (message.type === MessageType.DiscardDownload || message.type === MessageType.PauseDownload) {
        const response = await sendToBackground(message)
        return response?.type === MessageType.DiscardDownloadResult || response?.type === MessageType.PauseDownloadResult || response?.type === MessageType.Error
          ? response : { type: MessageType.Error, payload: { message: '本机下载任务没有响应。' } }
      }
      if (message.type === MessageType.DownloadFiles && message.payload.progressId && !message.payload.detached) {
        return waitForDownloadJob(message.payload.progressId, () => bridge.request({
          ...message, payload: { ...message.payload, detached: true }
        }), signal)
      }
      const lookupFlow = message.type === MessageType.LookupIcFlow
      const contactExport = message.type === MessageType.ExportCaseContacts
      // 提交一封信要串完建单、联系人、保存和提交流程，并成几件的信更长。原站高峰期 30 秒不够，放宽到 3 分钟。
      const submitWait = message.type === MessageType.SubmitLimitMail || message.type === MessageType.SubmitFileManage ? 180_000 : 0
      // 新界面只等短受理，最终结果走独立任务消息；旧调用保留原等待预算。
      const downloadWait = message.type === MessageType.DownloadFiles ? (message.payload.detached ? 70_000 : 1_800_000) : 0
      const slow = contactExport || submitWait > 0 || message.type === MessageType.SearchFiles || message.type === MessageType.SearchLimitMonitor
        || message.type === MessageType.ReadHagueCase
        || message.type === MessageType.ListMailProcesses || message.type === MessageType.ListFlowReviewers
        || message.type === MessageType.ReadCaseDemands
        || message.type === MessageType.ReadCaseBusFlow
        || message.type === MessageType.ReadCustomerDemands
        || message.type === MessageType.ReadCustomerDirectory
        || message.type === MessageType.ReadMailContacts
        || message.type === MessageType.DiagnoseExistingMail
        || message.type === MessageType.LoadDictionary || message.type === MessageType.LoadFeeInit || message.type === MessageType.ScanFileSearchForm || message.type === MessageType.ScanFilingForm
      const searchWait = message.type === MessageType.SearchFiles || message.type === MessageType.SearchLimitMonitor || message.type === MessageType.SearchFiling || message.type === MessageType.SearchFee || message.type === MessageType.SearchFeeAmount || message.type === MessageType.ExportFee
        ? fileSearchTimeoutMs(message.payload.timeoutMs) + 15_000 : 0
      const response = await sendToBackground({ type: MessageType.Workspace, payload: { action: 'forward', message } }, message.type === MessageType.ReadHagueCase || message.type === MessageType.ResolveDownloadNames ? 300_000 : lookupFlow ? 300_000 : contactExport ? 180_000 : submitWait || downloadWait || searchWait || (slow ? 70_000 : 30_000))
      if (response?.type === MessageType.Error) return response
      const forwarded = response?.type === MessageType.WorkspaceResult ? response.payload.forwarded : null
      if (forwarded && forwarded.type === MessageType.Error) return forwarded
      if (!response || response.type !== MessageType.WorkspaceResult || !forwarded || forwarded.type === MessageType.WorkspaceResult) {
        const text = response?.type === MessageType.WorkspaceResult ? response.payload.message : ''
        return { type: MessageType.Error, payload: { message: text || 'EASY 通道没有返回结果。' } }
      }
      return forwarded as ContentResponse
    }
  }
  return bridge
}
