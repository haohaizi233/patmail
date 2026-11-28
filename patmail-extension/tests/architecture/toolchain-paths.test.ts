import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CI_ROOT, DIST_ROOT, EXTENSION_PUBLIC_ROOT, EXTENSION_ROOT, REPO_PUBLIC_ROOT,
  REPO_ROOT, SCRIPTS_ROOT, SRC_ROOT, TEST_RESULTS_ROOT, TESTS_ROOT
} from '../../scripts/shared/paths.mjs'

describe('toolchain paths', () => {
  it('exports the repository, extension and distinct public directories', () => {
    expect(EXTENSION_ROOT).toBe(join(REPO_ROOT, 'patmail-extension'))
    expect(SCRIPTS_ROOT).toBe(join(EXTENSION_ROOT, 'scripts'))
    expect(SRC_ROOT).toBe(join(EXTENSION_ROOT, 'src'))
    expect(DIST_ROOT).toBe(join(EXTENSION_ROOT, 'dist'))
    expect(CI_ROOT).toBe(join(EXTENSION_ROOT, 'ci'))
    expect(TEST_RESULTS_ROOT).toBe(join(EXTENSION_ROOT, 'test-results'))
    expect(TESTS_ROOT).toBe(join(EXTENSION_ROOT, 'tests'))
    expect(EXTENSION_PUBLIC_ROOT).toBe(join(EXTENSION_ROOT, 'public'))
    expect(REPO_PUBLIC_ROOT).toBe(join(REPO_ROOT, 'public'))
  })

  it('resolves the same roots from arbitrary working directories', () => {
    const unrelated = mkdtempSync(join(tmpdir(), 'PatMail 测试目录 '))
    try {
      const source = "import {pathToFileURL} from 'node:url'; const m = await import(pathToFileURL(process.argv[1]).href); console.log(JSON.stringify([m.REPO_ROOT,m.EXTENSION_ROOT]))"
      for (const cwd of [REPO_ROOT, EXTENSION_ROOT, unrelated]) {
        const output = execFileSync(process.execPath, ['--input-type=module', '-e', source, join(SCRIPTS_ROOT, 'shared', 'paths.mjs')], { cwd, encoding: 'utf8' })
        expect(output.trim()).toBe(JSON.stringify([REPO_ROOT, EXTENSION_ROOT]))
      }
    } finally {
      rmdirSync(unrelated)
    }
  })
})
