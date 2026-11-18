import { expect, it } from 'vitest'
import { discoverCases } from '../../../src/hague/materials'
import { readDroppedFolders } from '../../../src/hague/dropped-folders'

function fileEntry(name: string): FileSystemFileEntry {
  return {
    name,
    fullPath: `/${name}`,
    isFile: true,
    isDirectory: false,
    file: (ok: (file: File) => void) => ok(new File(['x'], name))
  } as unknown as FileSystemFileEntry
}

function dirEntry(name: string, children: FileSystemEntry[], batchSize = 100): FileSystemDirectoryEntry {
  let cursor = 0
  return {
    name,
    fullPath: `/${name}`,
    isFile: false,
    isDirectory: true,
    createReader: () => ({
      readEntries: (ok: (entries: FileSystemEntry[]) => void) => {
        const batch = children.slice(cursor, cursor + batchSize)
        cursor += batch.length
        ok(batch)
      }
    })
  } as unknown as FileSystemDirectoryEntry
}

function dropOf(...entries: FileSystemEntry[]): DataTransfer {
  return {
    types: ['Files'],
    items: entries.map(entry => ({ kind: 'file', webkitGetAsEntry: () => entry }))
  } as unknown as DataTransfer
}

it('expands nested folders into webkitdirectory-style paths that discoverCases can group', async () => {
  const root = dirEntry('海牙总目录', [
    dirEntry('PO1HAGUE', [fileEntry('form.docx'), fileEntry('1.1.jpg'), fileEntry('1.2.png')], 2),
    dirEntry('PO2HAGUE', [fileEntry('form.docx'), fileEntry('1.1.tif')])
  ])
  const files = await readDroppedFolders(dropOf(root))
  expect(files.map(file => file.webkitRelativePath)).toEqual([
    '海牙总目录/PO1HAGUE/form.docx',
    '海牙总目录/PO1HAGUE/1.1.jpg',
    '海牙总目录/PO1HAGUE/1.2.png',
    '海牙总目录/PO2HAGUE/form.docx',
    '海牙总目录/PO2HAGUE/1.1.tif'
  ])
  expect(discoverCases(files).map(folder => folder.caseVolume)).toEqual(['PO1HAGUE', 'PO2HAGUE'])
})

it('accepts several dropped roots and ignores loose files and non-file items', async () => {
  const transfer = {
    types: ['Files'],
    items: [
      { kind: 'file', webkitGetAsEntry: () => dirEntry('A', [fileEntry('a.docx')]) },
      { kind: 'file', webkitGetAsEntry: () => fileEntry('loose.docx') },
      { kind: 'string', webkitGetAsEntry: () => dirEntry('B', [fileEntry('b.docx')]) },
      { kind: 'file', webkitGetAsEntry: () => dirEntry('B', [fileEntry('b.docx')]) }
    ]
  } as unknown as DataTransfer
  expect((await readDroppedFolders(transfer)).map(file => file.webkitRelativePath)).toEqual(['A/a.docx', 'B/b.docx'])
  expect(await readDroppedFolders(dropOf(fileEntry('form.docx')))).toEqual([])
})

it('stops when a dropped folder exceeds the file limit', async () => {
  const children = Array.from({ length: 4 }, (_, index) => fileEntry(`${index + 1}.1.jpg`))
  await expect(readDroppedFolders(dropOf(dirEntry('总目录', children, 2)), { maxFiles: 3 })).rejects.toThrow(/超过 3 个文件/)
})
