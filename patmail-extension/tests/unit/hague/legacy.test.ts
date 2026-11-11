import { expect, it } from 'vitest'
import { discoverCases, parseLegacyFilingText } from '../../../src/hague/materials'
import { readLegacyDocText } from '../../../src/hague/legacy-doc'

const text = 'Locarno Class (optional): 12\rNo.\x07Total\x07Product(s)\x07Subclass\x07\x071\x0710\x07Motor vehicle\x078\x07\x07\r3. Description\rMain usage for transportation.\r4. Legends\r1 Perspective\x073 Back\x079 Unfolded\x0712 Enlarged\x07\rNo.\x07Code\x07Legend\x071.1\x072\x07\x071.10\x0712\x07\x07\r'
it('recognizes doc and docx cases including PA references without losing nested folders', () => {
  const file = (path: string) => Object.assign(new File([''], path.split('/').pop()!), { webkitRelativePath: path })
  const cases = discoverCases(['root/JL-PO2530287HAGUE-V2/form.doc', 'root/JL-PA2532115CN-HAGUE-V1/form.doc', 'root/PO2631874HAGUE/form.docx'].map(file))
  expect(cases.map(c => c.caseVolume)).toEqual(['PA2532115CN-HAGUE', 'PO2530287HAGUE', 'PO2631874HAGUE'])
  expect(cases.every(c => c.documents.length === 1)).toBe(true)
})
it('parses legacy table delimiters and the document-specific code 12', () => {
  const result = parseLegacyFilingText(text)
  expect(result.issues).toEqual([])
  expect(result.products).toEqual([['1', '10', 'Motor vehicle', '8']])
  expect(result.views[1]).toEqual({ number: '1.10', code: '12', label: 'Enlarged' })
})
function compoundDoc(mini = false): Uint8Array {
  const data = new Uint8Array(19 * 512), d = new DataView(data.buffer)
  const u16 = (at: number, n: number) => d.setUint16(at, n, true), u32 = (at: number, n: number) => d.setUint32(at, n, true)
  u32(0, 0xe011cfd0); u32(4, 0xe11ab1a1); u16(30, 9); u16(32, 6); u32(44, 1); u32(48, 1); u32(56, 4096); u32(60, 0xfffffffe); u32(68, 0xfffffffe)
  for (let i = 0; i < 109; i++) u32(76 + i * 4, 0xffffffff)
  u32(76, 0)
  for (let i = 0; i < 128; i++) u32(512 + i * 4, 0xffffffff)
  u32(512, 0xfffffffd); u32(516, 0xfffffffe)
  for (let i = 2; i < 18; i++) u32(512 + i * 4, i === 9 || i === 17 ? 0xfffffffe : i + 1)
  for (const [i, name, type, start, size] of [[0, 'Root Entry', 5, 0xfffffffe, 0], [1, 'WordDocument', 2, 2, 4096], [2, '1Table', 2, 10, 4096]] as const) {
    const at = 1024 + i * 128
    for (let j = 0; j < name.length; j++) u16(at + j * 2, name.charCodeAt(j))
    u16(at + 64, (name.length + 1) * 2); data[at + 66] = type; u32(at + 116, start); u32(at + 120, size)
  }
  const word = 1536, table = 5632
  u16(word, 0xa5ec); u16(word + 10, 512); u16(word + 32, 14); u16(word + 62, 22); u32(word + 76, text.length); u16(word + 152, 93); u32(word + 418, 0); u32(word + 422, 21)
  for (let i = 0; i < text.length; i++) u16(word + 512 + i * 2, text.charCodeAt(i))
  data[table] = 2; u32(table + 1, 16); u32(table + 5, 0); u32(table + 9, text.length); u32(table + 15, 512)
  if (mini) {
    u32(60, 11); u32(64, 1); u32(1024 + 116, 10); u32(1024 + 120, 64)
    u32(1280 + 116, 0); u32(1280 + 120, 21); u32(512 + 10 * 4, 0xfffffffe); u32(512 + 11 * 4, 0xfffffffe)
    u32(6144, 0xfffffffe)
  }
  return data
}
it('extracts text from an actual CFB WordDocument piece table and rejects corrupt files', () => {
  expect(readLegacyDocText(compoundDoc())).toBe(text)
  expect(readLegacyDocText(compoundDoc(true))).toBe(text)
  expect(() => readLegacyDocText(new Uint8Array(512))).toThrow('不是有效')
})
