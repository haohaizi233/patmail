import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
// eslint-disable-next-line no-unused-vars -- 存量豁免：保留解构占位与接口形态
import { join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { build } from 'vite'
import { ZipReader, Uint8ArrayReader, Uint8ArrayWriter } from '@zip.js/zip.js'
import { distDir, tmpPath, resultPath } from './support/paths.mjs'
import { extensionWorker } from './support/browser.mjs'

await build({
  configFile: false,
  publicDir: false,
  logLevel: 'error',
  build: {
    outDir: distDir,
    emptyOutDir: false,
    lib: {
      entry: resolve('src/utils/download-documents.ts'),
      formats: ['es'],
      fileName: () => 'document-export-fixture.js',
    },
  },
})
const profile = await mkdtemp(tmpPath('document-export-profile-'))
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  ignoreDefaultArgs: ['--disable-extensions'],
  headless: true,
  acceptDownloads: true,
  ...(process.env.PATMAIL_TEST_CHROMIUM ? { executablePath: process.env.PATMAIL_TEST_CHROMIUM } : {}),
  args: [
    '--enable-unsafe-extension-debugging',
    ...(process.env.PATMAIL_TEST_CHROMIUM
      ? []
      : [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`]),
  ],
})
try {
  let loadedId
  if (process.env.PATMAIL_TEST_CHROMIUM) {
    const session = await context.browser().newBrowserCDPSession()
    const loaded = await session.send('Extensions.loadUnpacked', { path: distDir })
    loadedId = loaded.id
    console.log('loaded extension', loadedId)
    await session.detach()
  }
  const page = await context.newPage()
  if (loadedId) await page.goto(`chrome-extension://${loadedId}/app.html`)
  const worker = await extensionWorker(context),
    id = new URL(worker.url()).host
  if (!loadedId) await page.goto(`chrome-extension://${id}/app.html`)
  console.log('worker ready')
  const downloads = []
  page.on('download', d => downloads.push(d))
  const receipts = await page.evaluate(async () => {
    const { downloadDocuments } = await import(chrome.runtime.getURL('document-export-fixture.js'))
    const bytes = new TextEncoder().encode('%PDF-1.7\nNative export regression\n%%EOF')
    // eslint-disable-next-line require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
    const source = name => ({ name, open: async () => bytes })
    const pdf = await downloadDocuments('pdf', [source('案件摘要.pdf')], '案件摘要.pdf')
    const zip = await downloadDocuments('zip', [source('First.pdf'), source('Second.pdf')], '案件摘要归档.zip')
    return { pdf, zip }
  })
  assert.equal(downloads.length, 2)
  assert.equal(downloads[0].suggestedFilename(), '案件摘要.pdf')
  assert.equal(downloads[1].suggestedFilename(), '案件摘要归档.zip')
  const original = Buffer.from('%PDF-1.7\nNative export regression\n%%EOF')
  assert.deepEqual(await readFile(await downloads[0].path()), original)
  const zip = new ZipReader(new Uint8ArrayReader(new Uint8Array(await readFile(await downloads[1].path()))))
  const entries = await zip.getEntries()
  assert.deepEqual(
    entries.map(e => e.filename),
    ['First.pdf', 'Second.pdf'],
  )
  for (const entry of entries) assert.deepEqual(Buffer.from(await entry.getData(new Uint8ArrayWriter())), original)
  await zip.close()
  const states = await worker.evaluate(
    async ids =>
      (await chrome.downloads.search({})).filter(x => ids.includes(x.id)).map(x => ({ id: x.id, state: x.state })),
    [receipts.pdf.downloadId, receipts.zip.downloadId],
  )
  assert.equal(states.length, 2)
  assert.ok(states.every(s => s.state === 'complete'))
  const report = { pdf: true, streamZipEntries: 2, nativeCompleted: states.length }
  await writeFile(resultPath('document-export.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await context.close()
}
