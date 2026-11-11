import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ZipWriter, Uint8ArrayWriter, TextReader } from '@zip.js/zip.js'

export async function createHagueFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'patmail-hague-preview-'))
  const folder = path.join(root, 'PO2631874HAGUE')
  await mkdir(folder)
  const p = text => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
  const table = rows => `<w:tbl>${rows.map(row => `<w:tr>${row.map(c => `<w:tc>${p(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`
  const codes = ['1', '2', '3', '6', '7', '4', '5', '1']
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p('Locarno Class: 28')}${table([['No.', 'Total', 'Product(s)', 'Subclass'], ['1', '8', 'Preview fixture', '03']])}${p('3. Description')}${p('Synthetic offline preview fixture.')}${p('4. Legends')}${table(codes.map((c, i) => [`1.${i + 1}`, c, '']))}</w:body></w:document>`
  const writer = new ZipWriter(new Uint8ArrayWriter())
  await writer.add('word/document.xml', new TextReader(xml))
  await writeFile(path.join(folder, 'PO2631909HAGUE.docx'), await writer.close())
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1sAAAAASUVORK5CYII=', 'base64')
  for (let i = 1; i <= 8; i++) await writeFile(path.join(folder, `1.${i}.png`), png)
  return { root, cleanup: async () => {
    const target = path.resolve(root), base = path.resolve(tmpdir()) + path.sep
    if (!target.startsWith(base) || !path.basename(target).startsWith('patmail-hague-preview-')) throw new Error('Unsafe fixture cleanup path')
    await rm(target, { recursive: true, force: true })
  } }
}
