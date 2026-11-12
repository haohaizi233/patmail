import { nativeStreamArchive } from './stream-download'
import { writeDocuments, type DocumentExportFormat, type PdfDocumentSource } from './document-export'
import { registerNativeDownloadTarget, releaseNativeDownloadTarget } from '../browser-download/native-navigation'
import { DOCUMENT_EXPORT_CHANNEL, documentExportOwner, safeExportFileName } from '../shared/document-export'
import type { BackgroundResponse } from '../shared/message'
import type { FileDownloadProgress } from '../shared/download-progress'
export async function downloadDocuments(
  format: DocumentExportFormat,
  sources: PdfDocumentSource[],
  fileName: string,
  options: { taskId?: string; report?: (progress: FileDownloadProgress) => void } = {},
) {
  if (!safeExportFileName(fileName) || !fileName.toLowerCase().endsWith('.' + format))
    throw new Error('导出文件名与格式不符。')
  const taskId = options.taskId ?? crypto.randomUUID()
  const targetId = await registerNativeDownloadTarget(taskId, documentExportOwner(chrome.runtime.id))
  let downloadId: number | undefined
  try {
    const bytes = await nativeStreamArchive(
      fileName,
      (sink, signal) => writeDocuments(format, sources, sink, signal),
      options.report ?? (() => {}),
      {
        backend: 'browser',
        taskId,
        targetId,
        manifest: { format, items: sources.map(s => ({ fileName: s.name })) },
        request: command =>
          chrome.runtime.sendMessage<unknown, BackgroundResponse>({ channel: DOCUMENT_EXPORT_CHANNEL, command }),
        onDownloadId: id => {
          downloadId = id
        },
      },
    )
    if (downloadId === undefined) throw new Error('导出文件已写入，但缺少浏览器下载记录，请检查下载列表。')
    return { taskId, downloadId, bytes }
  } finally {
    releaseNativeDownloadTarget(taskId)
  }
}
