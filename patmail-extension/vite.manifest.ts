import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Plugin } from 'vite'

/** 把 manifest.json 拷进 dist。两段构建都挂：content 那段会清空 dist，缺了它 manifest 会被冲掉。 */
export function copyManifestPlugin(): Plugin {
  return {
    name: 'copy-manifest',
    writeBundle() {
      const from = resolve(__dirname, 'manifest.json')
      const to = resolve(__dirname, 'dist/manifest.json')
      mkdirSync(dirname(to), { recursive: true })
      copyFileSync(from, to)
      copyFileSync(resolve(__dirname, 'delivery/使用说明.txt'), resolve(__dirname, 'dist/使用说明.txt'))
      const licenseDir = resolve(__dirname, 'dist/licenses')
      mkdirSync(licenseDir, { recursive: true })
      copyFileSync(resolve(__dirname, 'node_modules/@zip.js/zip.js/LICENSE'), resolve(licenseDir, 'zip.js.txt'))
    }
  }
}
