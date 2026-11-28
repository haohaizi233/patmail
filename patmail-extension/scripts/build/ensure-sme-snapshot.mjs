#!/usr/bin/env node
import { EXTENSION_ROOT, REPO_ROOT } from '../shared/paths.mjs'
/**
 * 构建前保证中小客户快照（assets/sme-customers.json）就位。
 *
 * 真实快照由 scripts/data/pull-sme-customers.py 从备份数据库生成（含公司名/联系人等敏感数据，不入仓），
 * 干净检出（如 GitHub Actions）没有这份文件，构建产物会缺 manifest 声明的 web_accessible_resources。
 * 文件缺失时：
 *   - 显式 SME_SNAPSHOT_STUB=1 → 写一份确定性的空占位快照，
 *     让构建与 verify:manifest / verify:dist 在无数据环境下能跑通；
 *   - 其他情况 → 直接报错，避免把没有客户名单的构建误当成正式交付。
 *
 * 占位快照带 "stub": true 标记、customers 为空：运行时解析结果与缺失等价（明确报错提示拉数据），
 * verify:dist 在未显式豁免时会拒绝占位内容进入交付。已有文件一律不覆盖，
 * 保证 verify:repro 连续两次构建哈希一致。
 *
 * 用法：node scripts/build/ensure-sme-snapshot.mjs（pnpm build 自动前置）
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const root = EXTENSION_ROOT
const repoRoot = REPO_ROOT
const targets = [
  join(repoRoot, 'public', 'assets', 'sme-customers.json'),
  join(root, 'src', 'assets', 'sme-customers.json'),
]

const stubAllowed = process.env.SME_SNAPSHOT_STUB === '1'

if (existsSync(targets[0])) {
  console.log('中小客户快照已存在，直接复用（内容不会被覆盖）。')
  process.exit(0)
}

if (!stubAllowed) {
  console.error(
    '缺 public/assets/sme-customers.json（中小客户名单快照，含敏感数据不入仓）。\n' +
      '正式构建：在有数据库权限的机器上跑 scripts/data/pull-sme-customers.py 生成后重试。\n' +
      '调试构建（占位空名单，不可交付）：设 SME_SNAPSHOT_STUB=1 后重试。',
  )
  process.exit(1)
}

// 与 pull-sme-customers.py 同构（takenAt/count/customers），stub 标记供 verify:dist 识别。
const text = '{"takenAt":"","count":0,"customers":[],"stub":true}'
for (const target of targets) {
  if (existsSync(target)) continue
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, text, 'utf8')
}
console.log('⚠ 未找到真实中小客户快照，已写入空占位快照（stub）：仅供 CI / 调试构建，不可用于正式交付。')
