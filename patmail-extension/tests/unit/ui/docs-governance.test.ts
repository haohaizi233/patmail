import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { checkCatalog, inspectMarkdown } from '../../../scripts/docs/docs-check.mjs'
import { similarity } from '../../../scripts/docs/docs-audit.mjs'
const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    // Only remove the temporary fixtures created by this suite.
    if (!resolve(directory).startsWith(resolve(tmpdir()) + sep + 'patmail-docs-'))
      throw new Error('Unexpected fixture path')
    rmSync(directory, { recursive: true, force: true })
  }
})
it('detects injected broken links, malformed fences, hidden statuses, metadata and duplicate authorities', () => {
  const directory = mkdtempSync(join(tmpdir(), 'patmail-docs-'))
  directories.push(directory)
  writeFileSync(join(directory, 'a.md'), '# 文档\n\n[不存在](missing.md)\n\n```mermaid\nflowchart TD\n')
  expect(inspectMarkdown(directory, 'a.md')).toEqual(expect.arrayContaining(['LINK a.md -> missing.md', 'FENCE a.md']))
  const doc = {
    path: 'a.md',
    title: 'A',
    status: 'historical',
    scope: 'test',
    last_verified_commit: 'a'.repeat(40),
    last_reviewed: '2026-11-16',
    evidence_level: 'code_verified',
    display: true,
  }
  expect(checkCatalog(directory, { documents: [doc] })).toContain('HIDDEN_STATUS a.md')
  writeFileSync(join(directory, 'a.md'), '# 内容\n')
  expect(inspectMarkdown(directory, 'a.md', true)).toEqual([])
  writeFileSync(join(directory, 'a.md'), '# 内容\n\n[坏锚点](#不存在)\n')
  expect(inspectMarkdown(directory, 'a.md', true)).toContain('ANCHOR a.md -> #不存在')
  writeFileSync(join(directory, 'a.md'), '# 内容\n')
  writeFileSync(join(directory, 'b.md'), '# 内容\n')
  expect(
    checkCatalog(directory, {
      documents: [
        { ...doc, status: 'current' },
        { ...doc, path: 'b.md', title: 'B', status: 'current' },
      ],
    }),
  ).toContain('AUTHORITY_DUPLICATE b.md')
  expect(
    checkCatalog(directory, { documents: [{ ...doc, status: 'current', last_verified_commit: 'unknown' }] }),
  ).toContain('METADATA_ENUM a.md')
})
it('reports text similarity only as a review signal', () => {
  expect(similarity('文档状态机与恢复规则', '文档状态机与恢复规则')).toBe(1)
  expect(similarity('abcdefgh', '完全不同的描述')).toBe(0)
})
