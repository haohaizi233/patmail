import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { chromium } from 'playwright'

const path = new URL('../../src/browser-download/store.ts', import.meta.url)
const source = await readFile(path, 'utf8').catch(() => '')
assert.ok(source, 'persistent browser store must be implemented')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  await page.route('https://cache.test/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Cache fixture</title>' }))
  await page.goto('https://cache.test/')
  await page.addScriptTag({ content: js.replace('export function createBrowserDownloadStore', 'window.createBrowserDownloadStore = function createBrowserDownloadStore') })
  const result = await page.evaluate(async () => {
    const check = (condition, message) => { if (!condition) throw new Error(message) }
    const rejects = async (op, message) => { let failed = false; try { await op() } catch { failed = true } check(failed, message) }
    const store = window.createBrowserDownloadStore()
    const task = id => ({ taskId: id, owner: 'alice', fileName: 'a.zip', manifest: { frozen: ['a'] }, state: 'running', zipCreatedAt: '2026-01-01', updatedAt: Date.now() })
    await store.create(task('one'))
    await store.create(task('skips'))
    await store.reset('skips', 0, { totalBytes: 0, skipReason: '文件不存在或权限不足' })
    await store.finishBlob('skips', 0, { totalBytes: 0, skipReason: '文件不存在或权限不足' })
    check((await store.info('skips', 0)).skipReason === '文件不存在或权限不足', 'skip decision survives durable metadata roundtrip')
    check(await store.skipped('skips') === 1, 'skip count is derived from complete attachment markers')
    await rejects(() => store.create({ ...task('one'), owner: 'bob' }), 'owner collision')
    await store.append('one', 0, 0, new Uint8Array([1, 2, 3]))
    await store.append('one', 0, 1, new Uint8Array([2, 3, 4, 5]))
    check(String(await store.read('one', 0, 0)) === '1,2,3,4,5', 'matching overlap extends prefix')
    await rejects(() => store.append('one', 0, 2, new Uint8Array([9])), 'conflicting overlap')
    await rejects(() => store.append('one', 0, 9, new Uint8Array([9])), 'gap')
    await Promise.all([store.append('one', 1, 0, new Uint8Array([7])), store.append('one', 2, 0, new Uint8Array([8]))])
    await Promise.all([store.update('one', { state: 'paused' }), store.update('one', { completedBytes: 99 })])
    check((await store.get('one')).state === 'paused' && (await store.get('one')).completedBytes === 99, 'concurrent updates retain fields')
    await store.saveNames('one', 0, ['a.pdf'])
    await store.saveNames('one', 0, ['a.pdf'])
    await rejects(() => store.saveNames('one', 0, ['b.pdf']), 'name collision')
    check((await store.names('one'))['0'][0] === 'a.pdf', 'names persist')
    await store.saveNames('one', 1, ['b.pdf', 'c.pdf'])
    await rejects(() => store.saveNames('one', 2, ['changed.pdf']), 'overlapping name batch conflict')
    await store.update('one', { owner: 'intruder', taskId: 'stolen' })
    check((await store.get('one')).owner === 'alice', 'updates cannot replace identity')
    const targetId = '86cc59ca-53b8-4d74-9120-522b956b7de5'
    await store.update('one', { activeTargetId: targetId })
    check((await window.createBrowserDownloadStore().get('one')).activeTargetId === targetId, 'active target identity persists across store instances')
    await store.update('one', { state: 'paused' })
    check((await store.get('one')).activeTargetId === targetId, 'unrelated updates retain target identity')
    await rejects(() => store.update('one', { activeTargetId: 'invalid' }), 'invalid target UUID refused')
    await rejects(() => store.update('one', { activeTargetId: null }), 'null target identity refused')
    check((await store.get('one')).activeTargetId === targetId, 'invalid target update preserves identity')
    await store.update('one', { activeTargetId: undefined })
    check((await window.createBrowserDownloadStore().get('one')).activeTargetId === undefined, 'explicit undefined clears persisted target identity')
    await store.finishBlob('one', 0, { totalBytes: 5 })
    check((await store.info('one', 0)).complete, 'finish attachment')
    await rejects(() => store.append('one', 0, 5, new Uint8Array([6])), 'cannot extend complete attachment')
    await store.reset('one', 0, { etag: 'v2', totalBytes: 1 })
    check((await store.info('one', 0)).receivedBytes === 0, 'reset clears prefix')
    await store.append('one', 0, 0, new Uint8Array([6]))
    await store.finishBlob('one', 0)
    await store.append('one', 'archive', 0, new Uint8Array(700000).fill(42))
    check((await store.info('one', 'archive')).receivedBytes === 700000, 'large append split')
    check((await store.read('one', 'archive', 250000, 30000)).length === 30000, 'cross chunk read')
    const db = await new Promise((resolve, reject) => { const r = indexedDB.open('patmail-browser-downloads', 1); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    const mutate = body => new Promise((resolve, reject) => { const tx = db.transaction(['chunks'], 'readwrite'); body(tx.objectStore('chunks')); tx.oncomplete = resolve; tx.onabort = () => reject(tx.error) })
    const persisted = await new Promise((resolve, reject) => { const r = db.transaction('chunks').objectStore('chunks').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
    check(persisted.every(part => part.bytes instanceof Uint8Array && part.bytes.length <= 262144), 'binary cache blocks are bounded')
    await store.create(task('corrupt'))
    await store.append('corrupt', 0, 0, new Uint8Array([4, 5, 6]))
    await mutate(records => { const r = records.get(['corrupt', '0', 0]); r.onsuccess = () => records.put({ ...r.result, bytes: new Uint8Array([4, 0, 6]) }) })
    await rejects(() => store.read('corrupt', 0, 0), 'corrupt persisted bytes refused')
    await rejects(() => store.append('corrupt', 0, 0, new Uint8Array([4, 0, 6, 7])), 'corrupt overlap refused')
    await store.discard('corrupt')
    await store.create(task('aborted'))
    const originalTransaction = IDBDatabase.prototype.transaction
    let abortNextChunk = true, strictObserved = false
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const tx = originalTransaction.call(this, stores, mode, options)
      if (mode === 'readwrite' && options?.durability === 'strict') {
        strictObserved = true
        if (abortNextChunk) {
          const originalObjectStore = tx.objectStore.bind(tx)
          tx.objectStore = name => {
            const records = originalObjectStore(name)
            if (name === 'chunks') {
              const originalAdd = records.add.bind(records)
              records.add = (...args) => {
                const req = originalAdd(...args)
                req.addEventListener('success', () => { if (abortNextChunk) { abortNextChunk = false; tx.abort() } })
                return req
              }
            }
            return records
          }
        }
      }
      return tx
    }
    try { await rejects(() => store.append('aborted', 0, 0, new Uint8Array([1])), 'request success followed by abort must reject ACK') }
    finally { IDBDatabase.prototype.transaction = originalTransaction }
    check(strictObserved, 'cache mutations request strict durability')
    check((await store.info('aborted', 0)).receivedBytes === 0, 'aborted chunks do not advance watermark')
    await store.append('aborted', 0, 0, new Uint8Array([2]))
    check((await store.read('aborted', 0, 0))[0] === 2, 'retry after transaction abort')
    await store.discard('aborted')
    // Pause hashing outside the IDB transaction, then replace the blob/task.
    const duringHash = async (taskId, change) => {
      const originalDigest = crypto.subtle.digest.bind(crypto.subtle)
      let reached, release
      const hashing = new Promise(resolve => { reached = resolve })
      const gate = new Promise(resolve => { release = resolve })
      crypto.subtle.digest = async (...args) => { const result = await originalDigest(...args); reached(); await gate; return result }
      const writing = store.append(taskId, 0, 0, new Uint8Array([7]))
      const rejected = rejects(() => writing, 'stale write must not cross reset or task recreation')
      try { await hashing; await change(); release(); await rejected }
      finally { release(); crypto.subtle.digest = originalDigest }
    }
    await store.create(task('replace'))
    await duringHash('replace', () => store.reset('replace', 0, { etag: 'new' }))
    check((await store.info('replace', 0)).receivedBytes === 0, 'old producer cannot append after reset')
    await store.discard('replace')
    await store.create(task('replace'))
    await duringHash('replace', async () => { await store.discard('replace'); await store.create({ ...task('replace'), owner: 'bob' }) })
    check((await store.get('replace')).owner === 'bob' && (await store.info('replace', 0)).receivedBytes === 0, 'task recreation does not mix owners')
    await store.discard('replace')
    db.close()
    const resumed = window.createBrowserDownloadStore()
    check((await resumed.get('one')).manifest.frozen[0] === 'a', 'frozen task persists')
    check((await resumed.read('one', 0, 0))[0] === 6, 'fresh store resumes cached bytes')
    await Promise.all([store.append('one', 3, 0, new Uint8Array([1, 2])), resumed.append('one', 3, 0, new Uint8Array([1, 2, 3]))])
    check(String(await store.read('one', 3, 0)) === '1,2,3', 'concurrent same blob compare and swap')
    await store.finishBlob('one', 'archive')
    await store.complete('one', 700000)
    check((await resumed.get('one')).state === 'done', 'done receipt persists')
    check((await resumed.get('one')).completedBytes === 700000, 'receipt size')
    check((await resumed.info('one', 'archive')).receivedBytes === 0, 'completion clears big cache')
    await rejects(() => store.append('one', 0, 0, new Uint8Array([1])), 'done immutable')
    await store.discard('one')
    check(await store.get('one') === null, 'discard')
    await rejects(() => store.append('missing', 0, 0, new Uint8Array([1])), 'missing task writes refused')
    await rejects(() => store.info('missing', 0), 'missing task reads refused')
    await store.create({ ...task('old'), state: 'paused', updatedAt: Date.now() - 8 * 86400000 })
    await store.create(task('active'))
    check(await store.get('old') === null, 'old paused task garbage collected')
    check((await store.get('active')).owner === 'alice', 'active task retained')
    return 'browser download store behavioral checks passed'
  })
  console.log(result)
} finally { await browser.close() }
