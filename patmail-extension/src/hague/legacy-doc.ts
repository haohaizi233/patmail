// Local, read-only MS-CFB / MS-DOC extraction. No Office instance or upload required.
// Text piece algorithm: https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/01d5d8c4-cf9c-4ef9-80fd-439e763cfe01
export function readLegacyDocText(bytes: Uint8Array): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const u16 = (at: number) => view.getUint16(at, true), u32 = (at: number) => view.getUint32(at, true)
  if (bytes.length < 512 || u32(0) !== 0xe011cfd0 || u32(4) !== 0xe11ab1a1) throw new Error('不是有效的旧版 Word 文档')
  const sectorSize = 2 ** u16(30), miniSize = 2 ** u16(32)
  if (![512, 4096].includes(sectorSize) || miniSize !== 64) throw new Error('不支持的 Word 存储格式')
  const count = Math.floor(bytes.length / sectorSize) - 1
  const sector = (id: number) => {
    if (id < 0 || id >= count) throw new Error('Word 存储扇区越界')
    return bytes.subarray((id + 1) * sectorSize, (id + 2) * sectorSize)
  }
  const words = (data: Uint8Array) => { const d = new DataView(data.buffer, data.byteOffset, data.byteLength); return Array.from({ length: data.length / 4 }, (_, i) => d.getUint32(i * 4, true)) }
  const fatIds = Array.from({ length: 109 }, (_, i) => u32(76 + i * 4)).filter(id => id < 0xfffffffa)
  let difat = u32(68)
  for (let i = 0; i < u32(72); i++) { if (i > count) throw new Error('Word DIFAT 损坏'); const list = words(sector(difat)); fatIds.push(...list.slice(0, -1).filter(id => id < 0xfffffffa)); difat = list.at(-1)! }
  const fat = fatIds.slice(0, u32(44)).flatMap(id => words(sector(id)))
  function chain(start: number, table: number[], unit: number, get: (id: number) => Uint8Array, size?: number): Uint8Array {
    const chunks: Uint8Array[] = [], seen = new Set<number>()
    for (let id = start; id < 0xfffffffa; id = table[id]) {
      if (id === undefined || seen.has(id) || seen.size > count * (sectorSize / miniSize)) throw new Error('Word 存储链损坏')
      seen.add(id); chunks.push(get(id))
      if (size !== undefined && chunks.length * unit >= size) break
    }
    const length = size ?? chunks.length * unit
    if (length > chunks.length * unit || length > 20 * 1024 * 1024) throw new Error('Word 数据不完整或过大')
    const result = new Uint8Array(length)
    chunks.forEach((c, i) => { if (i * unit < length) result.set(c.subarray(0, length - i * unit), i * unit) })
    return result
  }
  const directory = chain(u32(48), fat, sectorSize, sector)
  const entries: { name: string; type: number; start: number; size: number }[] = []
  for (let at = 0; at + 128 <= directory.length; at += 128) {
    const d = new DataView(directory.buffer, at, 128), length = d.getUint16(64, true)
    if (!length || length > 64) continue
    entries.push({ name: new TextDecoder('utf-16le').decode(directory.subarray(at, at + length - 2)), type: directory[at + 66], start: d.getUint32(116, true), size: Number(d.getBigUint64(120, true)) })
  }
  const root = entries.find(e => e.type === 5)
  const miniFat = u32(64) ? words(chain(u32(60), fat, sectorSize, sector, u32(64) * sectorSize)) : []
  let miniStream: Uint8Array | undefined
  const stream = (name: string): Uint8Array => {
    const e = entries.find(e => e.name === name && e.type === 2)
    if (!e) throw new Error(`Word 缺少 ${name} 数据流`)
    if (e.size >= u32(56)) return chain(e.start, fat, sectorSize, sector, e.size)
    if (!root) throw new Error('Word 缺少根存储')
    miniStream ??= chain(root.start, fat, sectorSize, sector, root.size)
    return chain(e.start, miniFat, miniSize, id => {
      if ((id + 1) * miniSize > miniStream!.length) throw new Error('Word 小数据流越界')
      return miniStream!.subarray(id * miniSize, (id + 1) * miniSize)
    }, e.size)
  }
  const word = stream('WordDocument'), w = new DataView(word.buffer)
  if (w.getUint16(10, true) & 0x8100) throw new Error('暂不支持加密 Word，请先解除密码')
  const table = stream(w.getUint16(10, true) & 0x200 ? '1Table' : '0Table'), t = new DataView(table.buffer)
  let pos = 32
  pos += 2 + w.getUint16(pos, true) * 2
  const lw = pos + 2
  pos += 2 + w.getUint16(pos, true) * 4
  const fc = w.getUint32(pos + 2 + 33 * 8, true), length = w.getUint32(pos + 2 + 33 * 8 + 4, true)
  if (!length || fc + length > table.length) throw new Error('Word 正文索引不完整')
  let at = fc
  while (table[at] === 1) { at += 3 + t.getUint16(at + 1, true); if (at >= fc + length) throw new Error('Word 正文索引损坏') }
  if (table[at] !== 2) throw new Error('不支持的 Word 正文索引')
  const plcLength = t.getUint32(at + 1, true), plc = at + 5, pieces = (plcLength - 4) / 12
  if (!Number.isInteger(pieces) || pieces < 1 || plc + plcLength > fc + length) throw new Error('Word 正文分段损坏')
  const textLength = w.getUint32(lw + 12, true)
  let text = ''
  for (let i = 0; i < pieces; i++) {
    const start = t.getUint32(plc + i * 4, true), end = Math.min(t.getUint32(plc + (i + 1) * 4, true), textLength)
    if (end <= start) continue
    const encoded = t.getUint32(plc + (pieces + 1) * 4 + i * 8 + 2, true), compressed = !!(encoded & 0x40000000)
    const offset = (encoded & 0x3fffffff) / (compressed ? 2 : 1), size = (end - start) * (compressed ? 1 : 2)
    if (offset + size > word.length) throw new Error('Word 正文越界')
    text += new TextDecoder(compressed ? 'windows-1252' : 'utf-16le').decode(word.subarray(offset, offset + size))
  }
  return text
}
