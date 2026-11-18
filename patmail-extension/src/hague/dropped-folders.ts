/**
 * 把拖进页面的文件夹展开成与 `<input webkitdirectory>` 一致的 File 列表：
 * 每个 File 都带「总文件夹/案件文件夹/文件」形式的 webkitRelativePath，
 * discoverCases 就能沿用完全相同的目录分组规则。
 *
 * 注意：DataTransfer.items 只在 drop 事件的同步阶段可访问。必须在事件处理器里
 * 立即调用本函数（同步取完 entry 之后才进入异步遍历），否则条目会失效。
 */
const DEFAULT_MAX_FILES = 5000

function directoryEntries(dataTransfer: DataTransfer): FileSystemDirectoryEntry[] {
  const entries: FileSystemDirectoryEntry[] = []
  for (const item of Array.from(dataTransfer.items)) {
    if (item.kind !== 'file' || typeof item.webkitGetAsEntry !== 'function') continue
    const entry = item.webkitGetAsEntry()
    // 单个文件（非文件夹）不构成案件目录，交给调用方提示「请拖入总文件夹」。
    if (entry?.isDirectory) entries.push(entry as FileSystemDirectoryEntry)
  }
  return entries
}

function readBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => reader.readEntries(resolve, reject))
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject))
}

async function walk(entry: FileSystemEntry, prefix: string, out: File[], maxFiles: number): Promise<void> {
  const path = prefix ? `${prefix}/${entry.name}` : entry.name
  if (entry.isFile) {
    const file = await fileOf(entry as FileSystemFileEntry)
    Object.defineProperty(file, 'webkitRelativePath', { value: path, configurable: true })
    out.push(file)
    if (out.length > maxFiles) throw new Error(`拖入的文件夹超过 ${maxFiles} 个文件，请分几次导入。`)
    return
  }
  if (!entry.isDirectory) return
  const reader = (entry as FileSystemDirectoryEntry).createReader()
  // readEntries 一次最多返回 100 条，必须读到空数组才算读完整个目录。
  for (;;) {
    const batch = await readBatch(reader)
    if (!batch.length) break
    for (const child of batch) await walk(child, path, out, maxFiles)
  }
}

export async function readDroppedFolders(
  dataTransfer: DataTransfer,
  { maxFiles = DEFAULT_MAX_FILES }: { maxFiles?: number } = {}
): Promise<File[]> {
  const roots = directoryEntries(dataTransfer)
  const files: File[] = []
  for (const root of roots) await walk(root, '', files, maxFiles)
  return files
}
