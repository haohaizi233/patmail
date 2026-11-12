import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { projectRoot } from '../../helpers/project'

const root = projectRoot

function classify(names: string[]): Array<{ name: string; reason: string | null }> {
  // 名单走stdin；打包后的清单上千条时，命令行长度会超出Windows上限。
  const script = `import { readFileSync } from 'node:fs'; import { forbiddenDeliveryName } from './scripts/delivery-guard.mjs'; const names = JSON.parse(readFileSync(0, 'utf8')); console.log(JSON.stringify(names.map(name => ({ name, reason: forbiddenDeliveryName(name) }))))`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, encoding: 'utf8', input: JSON.stringify(names) })
  if (result.status !== 0) throw new Error(result.stderr || 'delivery guard failed')
  return JSON.parse(result.stdout) as Array<{ name: string; reason: string | null }>
}

describe('交付包私钥检查', () => {
  it('rejects private key file names without reading key contents', () => {
    const classified = classify(['patmail-extension/dist.pem', 'dist.pem', 'src/app.html', 'keys/demo.pem'])
    expect(classified.find(item => item.name === 'patmail-extension/dist.pem')?.reason).toBe('private-key')
    expect(classified.find(item => item.name === 'dist.pem')?.reason).toBe('private-key')
    expect(classified.find(item => item.name === 'src/app.html')?.reason).toBeNull()
    expect(classified.find(item => item.name === 'keys/demo.pem')?.reason).toBe('private-key')
  })

  it('fails a generated archive that contains a pem file name', () => {
    const directory = mkdtempSync(join(tmpdir(), 'patmail-pack-'))
    writeFileSync(join(directory, 'dist.pem'), 'placeholder\n')
    writeFileSync(join(directory, 'readme.txt'), 'notes\n')
    const archive = join(directory, 'sample.zip')
    // tar 参数用相对路径（cwd=临时目录）：MSYS tar 会把带盘符的绝对路径当成远程主机名。
    const packed = spawnSync('tar', ['-a', '-c', '-f', 'sample.zip', 'dist.pem', 'readme.txt'], { cwd: directory, encoding: 'utf8' })
    expect(packed.status).toBe(0)
    const listed = spawnSync('tar', ['-tf', 'sample.zip'], { cwd: directory, encoding: 'utf8' })
    const names = listed.stdout.split(/\r?\n/).filter(Boolean)
    expect(classify(names).some(item => item.reason === 'private-key')).toBe(true)
  })

  it('fails verify:archive when a zip contains a private key name', () => {
    const directory = mkdtempSync(join(tmpdir(), 'patmail-verify-'))
    writeFileSync(join(directory, 'dist.pem'), 'placeholder\n')
    writeFileSync(join(directory, 'readme.txt'), 'notes\n')
    const archive = join(directory, 'sample.zip')
    const packed = spawnSync('tar', ['-a', '-c', '-f', 'sample.zip', 'dist.pem', 'readme.txt'], { cwd: directory, encoding: 'utf8' })
    expect(packed.status).toBe(0)
    const checked = spawnSync(process.execPath, ['scripts/verify-archive.mjs', archive], { cwd: root, encoding: 'utf8' })
    expect(checked.status).not.toBe(0)
    expect(`${checked.stdout}${checked.stderr}`).not.toContain('placeholder')
  })

  it('builds the source package without a private key name', () => {
    const packed = spawnSync('node', ['scripts/pack-source.mjs'], { cwd: root, encoding: 'utf8' })
    expect(packed.status).toBe(0)
    const listed = spawnSync('tar', ['-tf', 'test-results/delivery/patmail-source.zip'], { cwd: root, encoding: 'utf8' })
    const names = listed.stdout.split(/\r?\n/).filter(Boolean)
    expect(classify(names).every(item => item.reason === null)).toBe(true)
    expect(names.some(name => name.toLowerCase().endsWith('.pem'))).toBe(false)
    const verified = spawnSync(process.execPath, ['scripts/verify-archive.mjs', 'test-results/delivery/patmail-source.zip'], { cwd: root, encoding: 'utf8' })
    expect(verified.status).toBe(0)
  }, 30_000)
})
