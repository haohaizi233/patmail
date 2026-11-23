#!/usr/bin/env node
/**
 * Manifest V3 合规与扩展安全校验。
 *
 * 直接读 manifest.json 与构建产物 dist/（README 不是真值来源）：
 *   - MV3 基本结构、service worker / content script / 图标等入口文件真实存在；
 *   - permissions 逐项对照审计清单，未知权限直接失败；
 *   - CSP 不允许远程脚本与 eval；web_accessible_resources 不允许宽泛 Origin；
 *   - 宽泛通配 Origin、远程代码加载、update_url 一律失败；
 *   - 本地调试面（127.0.0.1/localhost）与明文 HTTP Origin 只登记审计记录，不擅自改业务配置。
 *
 * 用法：pnpm verify:manifest [--json]
 * 产出：test-results/ci/manifest-report.json
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifestPath = join(root, 'manifest.json')
const distDir = join(root, 'dist')
const reportDir = join(root, 'test-results', 'ci')

// 权限审计清单：key = 权限名，value = 业务用途（来源见 docs/ci/security-policy.md）。
const PERMISSION_AUDIT = {
  tabs: '读取/查询工作台标签与 EASY 页面标签（content script PING 握手、面板定位、页面池）。',
  storage: '本地设置、查询模板、下载账本、任务状态（chrome.storage.local）。',
  unlimitedStorage: '下载账本与文件查询 WAL 需要长期本地缓存，默认 5MB 不够（IndexedDB + storage 混用）。',
  scripting: '向目标标签执行面板注入/隔离世界探测（content script 生命周期管理）。',
  alarms: '下载任务续期、会话检测与后台任务的定时调度（MV3 SW 会被回收，靠 alarms 唤醒）。',
  downloads: '原生浏览器下载落盘与下载终态确认（v1.6.1 下载机制核心）。',
  webNavigation: '工作台页面关闭/导航事件监听，用于下载取消与页面池回收。',
  debugger:
    'eHague Summary 临时 Page.printToPDF，固定官方站点/文档/案件，结束即 detach；不监听凭据，不更改下载行为（docs/ci/security-policy.md §4.1）。',
}
const KNOWN_CONTENT_SCRIPTS = ['content.js']
const REQUIRED_DIST_FILES = ['background.js', 'content.js', 'app.html', 'popup.js', 'manifest.json']
const REQUIRED_ICONS = ['icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png']
// 宽泛通配 Origin 一律不许进交付。
const WIDE_ORIGIN = [/^\*:/, /^<all_urls>$/, /^\*:\/\/\*\/\*/, /^https?:\/\/\*\/\*/, /^http:\/\/\*$/, /^https:\/\/\*$/]
const LOCAL_ORIGINS = ['http://127.0.0.1/', 'http://localhost/']

const problems = []
const records = []
let warnings = 0
const fail = message => problems.push(message)
const note = message => records.push(message)

if (!existsSync(manifestPath)) {
  console.error(`找不到 ${manifestPath}`)
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

// ---- MV3 结构 ----
if (manifest.manifest_version !== 3) fail(`manifest_version 应为 3，实际 ${manifest.manifest_version}`)
if (typeof manifest.name !== 'string' || !manifest.name) fail('缺少 name')
if (typeof manifest.version !== 'string' || !/^\d+(\.\d+)*$/.test(manifest.version))
  fail(`version 非法：${manifest.version}`)
note(`扩展版本 ${manifest.version}，minimum_chrome_version ${manifest.minimum_chrome_version ?? '未声明'}`)

// ---- 入口文件真实存在 ----
const mustExist = [...REQUIRED_DIST_FILES, ...REQUIRED_ICONS]
const background = manifest.background
if (!background?.service_worker) {
  fail('MV3 必须声明 background.service_worker')
} else {
  mustExist.push(background.service_worker)
  if (background.type !== 'module')
    note(`service worker type=${background.type ?? 'classic'}（非 module 时需确认打包格式）`)
}
for (const script of manifest.content_scripts ?? []) {
  for (const file of script.js ?? []) {
    mustExist.push(file)
    if (!KNOWN_CONTENT_SCRIPTS.includes(file)) note(`content script 不在审计清单：${file}`)
  }
  for (const file of script.css ?? []) mustExist.push(file)
}
for (const icon of Object.values(manifest.icons ?? {})) mustExist.push(icon)
for (const icon of Object.values(manifest.action?.default_icon ?? {})) mustExist.push(icon)

if (!existsSync(distDir)) {
  fail('dist/ 不存在，先执行 pnpm build（校验必须对着构建产物做）')
} else {
  for (const file of new Set(mustExist)) {
    if (!existsSync(join(distDir, file))) fail(`构建产物缺入口文件：${file}`)
  }
  // 构建产物里的 manifest 必须与源码 manifest 一致，防止打包环节漏拷或覆盖。
  const distManifestPath = join(distDir, 'manifest.json')
  if (existsSync(distManifestPath)) {
    const distManifest = JSON.parse(readFileSync(distManifestPath, 'utf8'))
    if (JSON.stringify(distManifest) !== JSON.stringify(manifest))
      fail('dist/manifest.json 与源码 manifest.json 不一致')
    else note('dist/manifest.json 与源码 manifest.json 一致')
  }
}

// ---- permissions 审计 ----
for (const permission of manifest.permissions ?? []) {
  if (PERMISSION_AUDIT[permission]) note(`permissions ✓ ${permission}：${PERMISSION_AUDIT[permission]}`)
  else fail(`permissions 出现未审计的新权限：${permission}（先在 docs/ci/security-policy.md 登记用途再放行）`)
}
const unusedPermissions = Object.keys(PERMISSION_AUDIT).filter(item => !(manifest.permissions ?? []).includes(item))
for (const permission of unusedPermissions)
  ((warnings += 1), note(`审计清单里有但 manifest 未声明的权限：${permission}`))

// ---- host_permissions / content_scripts matches / WAR ----
const allOrigins = [
  ...(manifest.host_permissions ?? []),
  ...(manifest.content_scripts ?? []).flatMap(item => item.matches ?? []),
  ...(manifest.web_accessible_resources ?? []).flatMap(item => item.matches ?? []),
]
for (const origin of new Set(allOrigins)) {
  if (WIDE_ORIGIN.some(pattern => pattern.test(origin))) fail(`宽泛 Origin 不允许进入交付：${origin}`)
}
for (const origin of new Set(manifest.host_permissions ?? [])) {
  if (LOCAL_ORIGINS.some(prefix => origin.startsWith(prefix))) {
    warnings += 1
    note(`host_permissions 含本地调试/桥接面：${origin}（本机下载桥接 42843 需要；移除前先做迁移方案）`)
  } else if (origin === 'http://43.138.138.200:8588/*') {
    warnings += 1
    note(`host_permissions 含内置 Qwen 明文 HTTP 地址：${origin}（运行时仅允许固定模型和 /v1 端点）`)
  } else if (origin.startsWith('http://')) {
    warnings += 1
    note(`host_permissions 含明文 HTTP 业务 Origin：${origin}（历史 EASY 部署如此；不得无迁移方案强制改 https）`)
  }
}
for (const entry of manifest.web_accessible_resources ?? []) {
  for (const resource of entry.resources ?? []) {
    if (resource === '*' || resource.includes('*')) {
      warnings += 1
      note(`web_accessible_resources 含通配资源：${resource}`)
      continue
    }
    // WAR 资源必须在构建产物里真实存在，避免暴露面指向缺失文件或被误塞敏感文件。
    if (existsSync(distDir) && !existsSync(join(distDir, resource)))
      fail(`web_accessible_resources 引用的文件不存在：${resource}`)
  }
  if ((entry.matches ?? []).some(origin => WIDE_ORIGIN.some(pattern => pattern.test(origin)))) {
    fail('web_accessible_resources 的 matches 含宽泛 Origin')
  }
  note(`web_accessible_resources 暴露 ${(entry.resources ?? []).join(', ')} → ${(entry.matches ?? []).join(', ')}`)
}

// ---- CSP：不允许远程脚本 / eval ----
const csp = manifest.content_security_policy?.extension_pages ?? ''
if (!csp) {
  warnings += 1
  note('未声明 extension_pages CSP（MV3 默认值可用，但显式声明更可审计）')
} else {
  // 'wasm-unsafe-eval' 是 MV3 合法指令（sql.js 需要），先剔除再判断真正的 eval/远程脚本。
  const cspStrict = csp.replaceAll('wasm-unsafe-eval', '')
  if (/script-src[^;]*https?:/i.test(cspStrict)) fail(`CSP 允许远程脚本：${csp}`)
  if (/script-src[^;]*(unsafe-eval|unsafe-inline)/i.test(cspStrict)) fail(`CSP 允许 eval/inline 脚本：${csp}`)
  if (!/object-src[^;]*'(none|self)'/i.test(csp)) {
    warnings += 1
    note(`object-src 未收紧：${csp}`)
  }
  note(`extension_pages CSP：${csp}`)
}
if (manifest.content_security_policy?.sandbox)
  note(`sandbox CSP：${JSON.stringify(manifest.content_security_policy.sandbox)}`)

// ---- 远程代码 / 调试面残留 ----
if (manifest.externally_connectable) {
  warnings += 1
  note(`externally_connectable：${JSON.stringify(manifest.externally_connectable)}（确认没有对不可信 Origin 开放）`)
}
if (manifest.update_url) fail(`交付 manifest 不应带 update_url：${manifest.update_url}`)
if (manifest.key) note('manifest 带 key（固定扩展 ID 的开发配置，交付包确认是否需要）')

// ---- 报告 ----
mkdirSync(reportDir, { recursive: true })
const report = {
  generatedAt: new Date().toISOString(),
  manifestVersion: manifest.manifest_version,
  version: manifest.version,
  permissions: Object.fromEntries((manifest.permissions ?? []).map(item => [item, PERMISSION_AUDIT[item] ?? '未审计'])),
  hostPermissions: manifest.host_permissions ?? [],
  problems,
  warnings,
  records,
}
writeFileSync(join(reportDir, 'manifest-report.json'), `${JSON.stringify(report, null, 2)}\n`)
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
if (problems.length > 0) {
  for (const message of problems) console.error(`✗ ${message}`)
  console.error(`manifest 校验失败：${problems.length} 个问题。`)
  process.exit(1)
}
for (const message of records) console.log(`  · ${message}`)
console.log(`manifest 校验通过（${warnings} 条审计记录见 test-results/ci/manifest-report.json）。`)
