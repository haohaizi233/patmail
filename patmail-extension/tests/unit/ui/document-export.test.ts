import { expect, it } from 'vitest'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { writeDocuments } from '../../../src/utils/document-export'
const pdf = new TextEncoder().encode('%PDF-1.7\nexample')
async function output(mode: 'pdf' | 'zip', count = 1) {
  const chunks: Uint8Array[] = []
  let opened = 0
  const sink = new WritableStream<Uint8Array>({
    write(b) {
      chunks.push(b)
    },
  })
  await writeDocuments(
    mode,
    Array.from({ length: count }, (_, i) => ({
      name: `${i}.pdf`,
      open: async () => {
        opened++
        return pdf
      },
    })),
    sink,
    new AbortController().signal,
  )
  const bytes = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0))
  let offset = 0
  for (const b of chunks) {
    bytes.set(b, offset)
    offset += b.length
  }
  return { bytes, opened }
}
it('downloads one PDF unchanged', async () => {
  expect(Array.from((await output('pdf')).bytes)).toEqual(Array.from(pdf))
})
it('streams multiple PDFs into a valid ZIP', async () => {
  const { bytes, opened } = await output('zip', 2)
  expect(opened).toBe(2)
  const reader = new ZipReader(new Uint8ArrayReader(bytes))
  const entries = await reader.getEntries()
  expect(entries.map(e => e.filename)).toEqual(['0.pdf', '1.pdf'])
  for (const e of entries)
    if (!e.directory) expect(Array.from(await e.getData(new Uint8ArrayWriter()))).toEqual(Array.from(pdf))
  await reader.close()
})
it('rejects multiple documents for raw PDF', async () => {
  await expect(output('pdf', 2)).rejects.toThrow()
})
it('does not fetch later PDFs when the sink fails', async () => {
  let opened = 0
  const items = Array.from({ length: 3 }, (_, i) => ({
    name: `${i}.pdf`,
    open: async () => {
      opened++
      return pdf
    },
  }))
  await expect(
    writeDocuments(
      'zip',
      items,
      new WritableStream({
        write() {
          throw new Error('cancelled')
        },
      }),
      new AbortController().signal,
    ),
  ).rejects.toThrow()
  expect(opened).toBeLessThan(3)
})
