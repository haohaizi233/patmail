import { spawnSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { projectRoot } from '../../helpers/project'

it('requires explicit stub permission and never permits stubs for delivery', () => {
  const root = mkdtempSync(join(tmpdir(), 'patmail-sme-gate-'))
  try {
    for (const domain of ['build', 'release', 'shared']) mkdirSync(join(root, 'scripts', domain), { recursive: true })
    mkdirSync(join(root, 'dist/assets'), { recursive: true })
    for (const name of ['build/verify-dist.mjs', 'release/delivery-guard.mjs', 'release/pack-delivery.mjs', 'release/release-check.mjs', 'shared/paths.mjs']) cpSync(join(projectRoot, 'scripts', name), join(root, 'scripts', name))
    writeFileSync(join(root, 'dist/manifest.json'), '{}')
    for (const name of ['background.js', 'content.js', 'app.html', 'popup.js', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png', 'licenses/zip.js.txt', '使用说明.txt', ...Array.from({ length: 20 }, (_, i) => `avatars/avatar-${i}.png`)]) {
      const path = join(root, 'dist', name)
      mkdirSync(join(path, '..'), { recursive: true })
      writeFileSync(path, '')
    }
    writeFileSync(join(root, 'dist/assets/sme-customers.json'), JSON.stringify({ stub: true, customers: [] }))
    const check = (allowed: string, delivery = false) => {
      const result = spawnSync(process.execPath, ['scripts/build/verify-dist.mjs', ...(delivery ? ['--delivery'] : [])], {
        cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', SME_SNAPSHOT_STUB: allowed }
      })
      return result
    }
    expect(check('0').stderr).toContain('是占位快照')
    expect(check('1').status).toBe(0)
    expect(check('1', true).stderr).toContain('是占位快照')
    for (const entry of ['pack-delivery.mjs', 'release-check.mjs']) {
      const result = spawnSync(process.execPath, [`scripts/release/${entry}`], { cwd: root, encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: 'true', SME_SNAPSHOT_STUB: '1' } })
      expect(result.status).toBe(1)
      expect(result.stderr).toContain('是占位快照')
    }
    writeFileSync(join(root, 'dist/assets/sme-customers.json'), JSON.stringify({ takenAt: '2026-11-05', customers: [['aaaaaaaa-1111-4111-8111-111111111111', '测试客户']] }))
    expect(check('0', true).status).toBe(0)
    const marker = 'fixture-retired-model-marker'
    writeFileSync(join(root, '.env.production.local'), `VITE_AGENT_DEFAULT_KEY=${marker}\n`)
    writeFileSync(join(root, 'dist/background.js'), JSON.stringify(marker))
    const rejected = check('0', true)
    expect(rejected.status).toBe(1)
    expect(rejected.stderr).toContain('交付产物含已退役的模型凭据：background.js')
    expect(rejected.stderr).not.toContain(marker)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
