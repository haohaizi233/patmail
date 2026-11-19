import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { projectRoot } from '../helpers/project'

interface E2eReport {
  status: string
  suites: Array<{ name: string; status: string }>
}

it('partitions full into disjoint runner groups and preserves failures in shard reports', () => {
  const root = mkdtempSync(join(tmpdir(), 'patmail-shards-'))
  try {
    mkdirSync(join(root, 'scripts'))
    mkdirSync(join(root, 'dist'))
    mkdirSync(join(root, 'tests/e2e'), { recursive: true })
    cpSync(join(projectRoot, 'scripts/run-e2e.mjs'), join(root, 'scripts/run-e2e.mjs'))
    writeFileSync(join(root, 'dist/manifest.json'), '{}')
    const files = ['extension', 'workspace', 'limit-query', 'download', 'native-browser-download', 'file-pages', 'download-editor', 'prewarm-pagination', 'jihua-upload', 'billing', 'browser-download-store', 'native-stream-lifetime', 'native-pipeline-fault', 'resume-protocol', 'docs']
    for (const file of files) writeFileSync(join(root, `tests/e2e/${file}.e2e.mjs`), '')
    const run = (group: string) => {
      const result = spawnSync(process.execPath, ['scripts/run-e2e.mjs', group], { cwd: root, encoding: 'utf8' })
      if (result.status === 2) throw new Error(result.stderr)
      return { result, report: JSON.parse(readFileSync(join(root, `test-results/ci/e2e-${group}.json`), 'utf8')) as E2eReport }
    }
    const full = run('full')
    const functional = run('full-functional')
    const lifetime = run('full-lifetime')
    expect(functional.result.status, functional.result.stderr).toBe(0)
    expect(lifetime.result.status, lifetime.result.stderr).toBe(0)
    const names = (report: E2eReport) => report.suites.map(suite => suite.name)
    const combined = [...names(functional.report), ...names(lifetime.report)]
    expect(combined.sort()).toEqual(names(full.report).sort())
    expect(new Set(combined).size).toBe(combined.length)
    expect(names(lifetime.report)).toEqual(['native-stream-lifetime'])
    writeFileSync(join(root, 'tests/e2e/native-stream-lifetime.e2e.mjs'), 'process.exit(1)')
    const failed = run('full-lifetime')
    expect(failed.result.status).toBe(1)
    expect(failed.report.status).toBe('fail')
    expect(failed.report.suites[0].status).toBe('fail')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

it('aggregates both shard reports and rejects failed or blocked shards', () => {
  const root = mkdtempSync(join(tmpdir(), 'patmail-shard-report-'))
  try {
    mkdirSync(join(root, 'scripts'))
    const reports = join(root, 'test-results/ci')
    mkdirSync(reports, { recursive: true })
    cpSync(join(projectRoot, 'scripts/ci-report.mjs'), join(root, 'scripts/ci-report.mjs'))
    writeFileSync(join(reports, 'e2e-full-functional.json'), JSON.stringify({ group: 'full-functional', status: 'pass', suites: [{ name: 'workspace', status: 'pass' }] }))
    for (const status of ['pass', 'fail', 'blocked']) {
      writeFileSync(join(reports, 'e2e-full-lifetime.json'), JSON.stringify({ group: 'full-lifetime', status, suites: status === 'blocked' ? [] : [{ name: 'native-stream-lifetime', status }] }))
      const result = spawnSync(process.execPath, ['scripts/ci-report.mjs', '--gate'], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: '' } })
      const summary = JSON.parse(readFileSync(join(reports, 'summary.json'), 'utf8')) as { rows: { E2E: { status: string; detail: string; suites: number } } }
      expect(result.status).toBe(status === 'pass' ? 0 : 1)
      expect(summary.rows.E2E.status).toBe(status === 'pass' ? 'PASS' : status === 'blocked' ? 'BLOCKED' : 'FAIL')
      expect(summary.rows.E2E.detail).toContain('full-functional+full-lifetime')
      expect(summary.rows.E2E.suites).toBe(status === 'blocked' ? 1 : 2)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
