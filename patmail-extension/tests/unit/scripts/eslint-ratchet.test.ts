import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { collectExemptions } from '../../../scripts/quality/eslint-exemptions.mjs'

describe('lint gate command', () => {
  let root: string
  let sourcePath: string
  let inputPath: string
  const code = '// eslint-disable-next-line no-unused-vars -- legacy\nconst old = 1\n'
  beforeEach(() => {
    mkdirSync('test-results', { recursive: true })
    root = mkdtempSync(join(process.cwd(), 'test-results/lint-gate-'))
    for (const directory of ['scripts/quality', 'scripts/shared', 'ci', 'node_modules/eslint/bin'])
      mkdirSync(join(root, directory), { recursive: true })
    for (const file of ['quality/eslint-ratchet.mjs', 'quality/eslint-exemptions.mjs', 'shared/paths.mjs'])
      copyFileSync(join('scripts', file), join(root, 'scripts', file))
    sourcePath = join(root, 'scripts/example.mjs')
    inputPath = join(root, 'node_modules/eslint/bin/input.json')
    writeFileSync(sourcePath, code)
    const report = [
      {
        filePath: sourcePath,
        errorCount: 0,
        warningCount: 0,
        messages: [],
        suppressedMessages: [{ ruleId: 'no-unused-vars', severity: 2, line: 2, message: 'old unused' }],
      },
    ]
    writeFileSync(inputPath, JSON.stringify(report))
    writeFileSync(
      join(root, 'node_modules/eslint/bin/eslint.js'),
      "require('node:fs').copyFileSync(__dirname + '/input.json', process.argv.at(-1))\n",
    )
    writeFileSync(
      join(root, 'ci/eslint-baseline.json'),
      JSON.stringify({ totals: { errors: 0, warnings: 0 }, rules: {} }),
    )
    writeFileSync(
      join(root, 'ci/eslint-exemptions.json'),
      JSON.stringify({ version: 1, exemptions: collectExemptions(report, root) }),
    )
  })
  afterEach(() => {
    const withinWorkspace = relative(join(process.cwd(), 'test-results'), root)
    if (!withinWorkspace || withinWorkspace.startsWith('..')) throw new Error('Unexpected fixture cleanup path')
    rmSync(root, { recursive: true, force: true })
  })
  const run = (rootPath: string, ...args: string[]) =>
    spawnSync(process.execPath, [join(rootPath, 'scripts/quality/eslint-ratchet.mjs'), ...args], { encoding: 'utf8' })
  it('passes registered exemptions and rejects changed protected code even with --update', () => {
    expect(run(root).status).toBe(0)
    writeFileSync(sourcePath, code.replace('old = 1', 'old = 1, added = 2'))
    expect(run(root).status).toBe(1)
    expect(run(root, '--update').status).toBe(1)
    expect(run(root, '--update-exemptions').status).toBe(0)
  })
  it('does not bootstrap a missing warning baseline', () => {
    unlinkSync(join(root, 'ci/eslint-baseline.json'))
    expect(run(root).status).toBe(1)
    expect(run(root, '--update').status).toBe(0)
  })
  it('rejects a missing exemption register', () => {
    unlinkSync(join(root, 'ci/eslint-exemptions.json'))
    expect(run(root).status).toBe(1)
  })
  it('fails closed on an interrupted linter without reusing a previous report', () => {
    expect(run(root).status).toBe(0)
    writeFileSync(join(root, 'node_modules/eslint/bin/eslint.js'), 'process.exit(2)\n')
    expect(run(root).status).toBe(2)
    expect(readFileSync(join(root, 'test-results/ci/eslint.json'), 'utf8')).toBe('')
  })
})
