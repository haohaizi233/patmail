import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'
import { REPO_ROOT, SCRIPTS_ROOT, TEST_RESULTS_ROOT } from '../../scripts/shared/paths.mjs'

it('validates the toolchain layout from the repository root', () => {
  const result = execFileSync(process.execPath, [join(SCRIPTS_ROOT, 'architecture', 'scripts-layout-check.mjs')], {
    cwd: REPO_ROOT,
    encoding: 'utf8'
  })
  expect(result).toContain('Scripts layout checks passed')
})

it('rejects unclassified files, cycles, missing Worker paths and stale CLI references', () => {
  mkdirSync(TEST_RESULTS_ROOT, { recursive: true })
  const fixture = mkdtempSync(join(TEST_RESULTS_ROOT, 'toolchain-layout-'))
  const withinWorkspace = relative(TEST_RESULTS_ROOT, fixture)
  if (!withinWorkspace || withinWorkspace.startsWith('..')) throw new Error('Unexpected fixture cleanup path')
  try {
    const scripts = join(fixture, 'extension', 'scripts')
    for (const domain of ['architecture', 'shared', 'ci', 'build', 'hague/research']) {
      mkdirSync(join(scripts, domain), { recursive: true })
    }
    cpSync(join(SCRIPTS_ROOT, 'architecture', 'scripts-layout-check.mjs'), join(scripts, 'architecture', 'scripts-layout-check.mjs'))
    cpSync(join(SCRIPTS_ROOT, 'shared', 'paths.mjs'), join(scripts, 'shared', 'paths.mjs'))
    writeFileSync(join(scripts, 'loose.mjs'), 'export {}\n')
    writeFileSync(join(scripts, 'ci', 'run.mjs'), "import '../build/run.mjs'\n")
    writeFileSync(join(scripts, 'build', 'run.mjs'), "import '../ci/run.mjs'\n")
    writeFileSync(join(scripts, 'shared', 'reverse.mjs'), "import '../ci/run.mjs'\n")
    writeFileSync(join(scripts, 'hague', 'worker.mjs'), "new URL('./missing-worker.mjs', import.meta.url)\n")
    writeFileSync(join(fixture, 'extension', 'package.json'), JSON.stringify({ scripts: { start: 'node scripts/stale.mjs' } }))
    const result = spawnSync(process.execPath, [join(scripts, 'architecture', 'scripts-layout-check.mjs')], {
      cwd: REPO_ROOT,
      encoding: 'utf8'
    })
    expect(result.status).toBe(1)
    for (const error of ['no toolchain domain', 'circular dependency', 'missing-worker.mjs', 'missing CLI path', 'shared may only depend']) {
      expect(result.stderr).toContain(error)
    }
  } finally {
    rmSync(fixture, { recursive: true, force: true })
  }
})
