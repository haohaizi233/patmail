import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { AnalysisWorker } from '../../../scripts/hague/research/hague-research-broker.mjs'
import { TEST_RESULTS_ROOT } from '../../../scripts/shared/paths.mjs'

it('reports a missing Worker file and recovers after the Worker exits', async () => {
  mkdirSync(TEST_RESULTS_ROOT, { recursive: true })
  const fixture = mkdtempSync(join(TEST_RESULTS_ROOT, 'worker-path-'))
  const withinWorkspace = relative(TEST_RESULTS_ROOT, fixture)
  if (!withinWorkspace || withinWorkspace.startsWith('..')) throw new Error('Unexpected fixture cleanup path')
  const workerPath = join(fixture, 'worker.mjs')
  const worker = new AnalysisWorker({ timeoutMs: 5000, workerUrl: pathToFileURL(workerPath) })
  try {
    await expect(worker.analyze('lookup', {})).rejects.toMatchObject({
      code: 'analysis_error', message: 'analysis worker file is missing'
    })
    expect(worker.pending.size).toBe(0)
    writeFileSync(workerPath, [
      "import { parentPort } from 'node:worker_threads'",
      "parentPort.on('message', ({ id, kind }) => {",
      "  if (kind === 'exit') process.exit(1)",
      "  parentPort.postMessage({ id, result: { ready: true } })",
      '})',
    ].join('\n'))
    await expect(worker.analyze('exit', {})).rejects.toMatchObject({ code: 'analysis_error' })
    await expect(worker.analyze('lookup', {})).resolves.toEqual({ ready: true })
  } finally {
    worker.clear()
    rmSync(fixture, { recursive: true, force: true })
  }
})
