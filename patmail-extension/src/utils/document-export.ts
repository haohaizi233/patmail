import { safePdfFileName } from '../shared/document-export'
import { ZipWriter, Uint8ArrayReader } from '@zip.js/zip.js'
export type DocumentExportFormat = 'pdf' | 'zip'
export interface PdfDocumentSource {
  name: string
  open(): Promise<Uint8Array>
}
/** One source at a time; the destination's backpressure bounds ZIP output. */
export async function writeDocuments(
  format: DocumentExportFormat,
  sources: PdfDocumentSource[],
  sink: WritableStream<Uint8Array>,
  signal: AbortSignal,
): Promise<void> {
  if (!sources.length || (format === 'pdf' && sources.length !== 1))
    throw new Error('单个 PDF 导出需要且仅能包含一份文档。')
  if (format !== 'pdf' && format !== 'zip') throw new Error('不支持的导出格式。')
  const used = new Set<string>()
  for (const source of sources) {
    if (!safePdfFileName(source.name) || used.has(source.name.toLowerCase())) throw new Error('PDF 文件名无效或重复。')
    used.add(source.name.toLowerCase())
  }
  const output = sink.getWriter()
  const zip =
    format === 'zip'
      ? new ZipWriter(new WritableStream<Uint8Array>({ write: chunk => output.write(chunk) }), {
          level: 0,
          zip64: true,
          useWebWorkers: false,
          bufferedWrite: false,
        })
      : undefined
  try {
    for (const source of sources) {
      signal.throwIfAborted()
      const bytes = await source.open()
      signal.throwIfAborted()
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') throw new Error('文档未返回有效 PDF。')
      if (zip) await zip.add(source.name, new Uint8ArrayReader(bytes), { signal })
      else
        for (let offset = 0; offset < bytes.length; offset += 256 * 1024) {
          signal.throwIfAborted()
          await output.write(bytes.subarray(offset, offset + 256 * 1024))
        }
    }
    if (zip) await zip.close()
    await output.close()
  } catch (error) {
    await output.abort(error).catch(() => {})
    throw error
  } finally {
    output.releaseLock()
  }
}
