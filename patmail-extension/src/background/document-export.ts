import { isRecord } from '../shared/guards'
import { MessageType, isMessage } from '../shared/message'
import type { StreamDownloadCommand } from '../shared/message'
import { documentExportOwner, safeExportFileName, safePdfFileName } from '../shared/document-export'
import type { BrowserStreamDownloads } from './browser-download'
/** Local app-produced artifacts use a separate lease manager from EASY account downloads. */
export async function handleDocumentExport(
  message: unknown,
  sender: chrome.runtime.MessageSender,
  downloads: Pick<BrowserStreamDownloads, 'command'>,
) {
  try {
    const url = new URL(sender.url ?? '')
    if (
      sender.id !== chrome.runtime.id ||
      url.protocol !== 'chrome-extension:' ||
      url.hostname !== chrome.runtime.id ||
      url.pathname !== '/app.html'
    )
      throw new Error('导出调用方无效。')
    const command = (message as { command?: StreamDownloadCommand }).command
    if (!command) throw new Error('导出命令无效。')
    const validation =
      command.action === 'start' ? { ...command, fileName: 'Export.zip', manifest: undefined } : command
    if (!isMessage({ type: MessageType.BrowserStreamDownload, payload: validation })) throw new Error('导出命令无效。')
    if (command.action === 'start') {
      const manifest = command.manifest as { format?: unknown; items?: unknown }
      if (
        !manifest ||
        !['pdf', 'zip'].includes(String(manifest.format)) ||
        !Array.isArray(manifest.items) ||
        !manifest.items.length ||
        manifest.items.length > 2000 ||
        (manifest.format === 'pdf' && manifest.items.length !== 1) ||
        JSON.stringify(manifest).length > 1000000 ||
        !command.fileName?.toLowerCase().endsWith('.' + String(manifest.format))
      )
        throw new Error('导出清单无效。')
      for (const item of manifest.items)
        if (!isRecord(item) || !safePdfFileName(item.fileName)) throw new Error('导出条目无效。')
    }
    if (command.action === 'start' && !safeExportFileName(command.fileName)) throw new Error('导出文件名无效。')
    const payload = await downloads.command(command, sender.tab?.id ?? -1, documentExportOwner(chrome.runtime.id))
    return { type: MessageType.StreamDownloadResult, payload }
  } catch (error) {
    return { type: MessageType.Error, payload: { message: error instanceof Error ? error.message : '导出失败。' } }
  }
}
