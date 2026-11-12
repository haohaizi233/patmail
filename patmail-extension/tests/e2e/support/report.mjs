import { mkdir, writeFile } from 'node:fs/promises'
import { reportsDir, resultPath } from './paths.mjs'

/** checks 计数、✓ 日志、备注行与 test-results/reports 产物写入；每个脚本各自创建实例，互不共享。 */
export function createReporter() {
  let checks = 0
  const notes = []
  return {
    get checks() {
      return checks
    },
    get notes() {
      return [...notes]
    },
    // 与原脚本一致：action 完成后才计数并打 ✓ 日志。
    check(name, action) {
      return Promise.resolve()
        .then(action)
        .then(() => {
          checks += 1
          console.log(`✓ ${name}`)
        })
    },
    pass(name) {
      checks += 1
      console.log(`✓ ${name}`)
    },
    note(line) {
      notes.push(line)
    },
    async ensureResultsDir() {
      await mkdir(reportsDir, { recursive: true })
    },
    async screenshot(target, name) {
      await mkdir(reportsDir, { recursive: true })
      await target.screenshot({ path: resultPath(name) })
    },
    async writeText(name, content) {
      await mkdir(reportsDir, { recursive: true })
      await writeFile(resultPath(name), content)
    },
    async writeJson(name, value) {
      await mkdir(reportsDir, { recursive: true })
      await writeFile(resultPath(name), JSON.stringify(value, null, 2))
    },
  }
}
