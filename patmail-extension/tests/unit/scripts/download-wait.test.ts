import { describe, expect, it, vi, afterEach } from 'vitest'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { observeDownload, waitForControllingWorker } from '../../e2e/support/download-wait.mjs'

afterEach(() => vi.unstubAllGlobals())

describe('lifetime E2E download admission', () => {
  it('observes an early teardown rejection without hiding its eventual failure', () => {
    const moduleUrl = pathToFileURL(resolve('tests/e2e/support/download-wait.mjs')).href
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import assert from 'node:assert/strict';
      import {observeDownload} from ${JSON.stringify(moduleUrl)};
      const failures=[];
      const pending=observeDownload({waitForEvent:()=>Promise.reject(Error('context closed'))}, error=>failures.push(error.message));
      await new Promise(resolve=>setTimeout(resolve,20));
      assert.deepEqual(failures,['context closed']);
      await assert.rejects(pending,/context closed/);
    `,
      ],
      { encoding: 'utf8' },
    )
    expect(run.stderr).toBe('')
    expect(run.status).toBe(0)
  })
  it('returns the real download and uses the requested timeout', async () => {
    const item = { filename: 'fixture.zip' }
    const waitForEvent = vi.fn(() => Promise.resolve(item))
    const failure = vi.fn()
    await expect(observeDownload({ waitForEvent }, failure, 1234)).resolves.toBe(item)
    expect(waitForEvent).toHaveBeenCalledWith('download', { timeout: 1234 })
    expect(failure).not.toHaveBeenCalled()
  })
  it('waits for the expected worker to control the page before admitting download navigation', async () => {
    const serviceWorker: { controller: { scriptURL: string } | null } = { controller: null }
    vi.stubGlobal('navigator', { serviceWorker })
    let controlled = () => false
    const waitForFunction = vi.fn((predicate: (expected: string) => boolean, expected: string) => {
      controlled = () => predicate(expected)
      return Promise.resolve(undefined)
    })
    await waitForControllingWorker({ waitForFunction }, 'chrome-extension://fixture/worker.js')
    expect(controlled()).toBe(false)
    serviceWorker.controller = { scriptURL: 'chrome-extension://other/worker.js' }
    expect(controlled()).toBe(false)
    serviceWorker.controller = { scriptURL: 'chrome-extension://fixture/worker.js' }
    expect(controlled()).toBe(true)
    expect(waitForFunction).toHaveBeenCalledWith(expect.any(Function), 'chrome-extension://fixture/worker.js', {
      timeout: 15000,
    })
  })
})
