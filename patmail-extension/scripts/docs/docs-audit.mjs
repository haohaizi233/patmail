import { REPO_ROOT } from '../shared/paths.mjs'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
export const root = REPO_ROOT
const generated = new Set([
  'patmail-extension/docs/governance/inventory.md',
  'patmail-extension/docs/governance/audit-report.md',
])
export function trackedMarkdown() {
  return [
    ...new Set(
      execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root })
        .toString()
        .split('\0')
        .filter(p => /\.md$/i.test(p) && !generated.has(p) && fs.existsSync(path.join(root, p))),
    ),
  ].sort()
}
export function links(body) {
  return [
    ...body
      .replace(/(^|\n) {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n {0,3}\2\s*(?=\n|$)/g, '')
      .matchAll(/\[[^\]]*\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+"[^"]*")?\s*\)/g),
  ].map(m => m[1] ?? m[2])
}
export function targetOf(from, href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null
  let decoded
  try {
    decoded = decodeURIComponent(href.split(/[?#]/)[0])
  } catch {
    return '__invalid_encoding__'
  }
  if (!decoded) return null
  return path.posix.normalize(
    decoded.startsWith('/') ? decoded.slice(1) : path.posix.join(path.posix.dirname(from), decoded),
  )
}
function category(p, s) {
  if (p.includes('/archive/')) return 'ARCHIVE'
  if (p.includes('/plans/')) return 'IMPLEMENTATION_PLAN'
  if (p.startsWith('API/')) return 'API_CONTRACT'
  if (p.includes('/usage/')) return 'USER_GUIDE'
  if (p.includes('/workflows/')) return 'WORKFLOW'
  if (/^docs\/\d\d-/.test(p)) return 'LEARNING_NOTES'
  if (/验收|acceptance/i.test(p + ' ' + s.slice(0, 200))) return 'ACCEPTANCE'
  if (/故障|复盘|incident|integration-gap/i.test(p + ' ' + s.slice(0, 120))) return 'INCIDENT'
  if (/算法|状态机|algorithm|state-machine/.test(p + ' ' + s.slice(0, 100))) return 'ALGORITHM'
  if (/逆向|AST|CDP|research/i.test(s.slice(0, 100))) return 'REVERSE_ENGINEERING'
  return 'TECHNICAL_REFERENCE'
}
function grams(s) {
  const text = s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 10000),
    set = new Set()
  for (let i = 0; i < text.length - 2; i++) set.add(text.slice(i, i + 3))
  return set
}
export function similarity(a, b) {
  const x = grams(a),
    y = grams(b)
  let overlap = 0
  for (const s of x) if (y.has(s)) overlap++
  return overlap / (x.size + y.size - overlap || 1)
}
export function build() {
  const files = trackedMarkdown(),
    catalog = JSON.parse(fs.readFileSync(path.join(root, 'patmail-extension/docs/governance/catalog.json'), 'utf8')),
    metas = new Map(catalog.documents.map(d => [d.path, d])),
    history = new Map()
  const log = execFileSync('git', ['log', '--format=@@%H|%cI', '--name-only', '--', '*.md'], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  }).toString()
  let commit = '',
    date = ''
  for (const line of log.split(/\r?\n/)) {
    if (line.startsWith('@@')) [commit, date] = line.slice(2).split('|')
    else if (line && !history.has(line)) history.set(line, { commit, date })
  }
  const all = files.map(p => ({ path: p, body: fs.readFileSync(path.join(root, p), 'utf8') })),
    hashes = new Map(),
    incoming = new Map()
  for (const d of all) {
    const hash = crypto.createHash('sha256').update(d.body).digest('hex')
    d.hash = hash
    hashes.set(hash, [...(hashes.get(hash) ?? []), d.path])
    for (const href of links(d.body)) {
      const target = targetOf(d.path, href)
      if (target) incoming.set(target, [...(incoming.get(target) ?? []), d.path])
    }
  }
  const documents = all.map(d => {
    const meta = metas.get(d.path),
      h = history.get(d.path),
      refs = links(d.body)
        .map(link => targetOf(d.path, link))
        .filter(Boolean),
      status = meta?.status,
      sourceRefs = [
        ...new Set([...(meta?.related_sources ?? []), ...refs.filter(p => /\.(?:[cm]?[jt]sx?|vue)$/.test(p))]),
      ]
    let validity = status === 'historical' ? 'HISTORICAL' : status === 'superseded' ? 'SUPERSEDED' : 'REVIEW_REQUIRED'
    if (meta?.status === 'current') {
      let changed = true
      try {
        changed = !!execFileSync('git', ['diff', '--name-only', meta.last_verified_commit, '--', ...sourceRefs], {
          cwd: root,
        })
          .toString()
          .trim()
      } catch {
        changed = true
      }
      validity = changed ? 'REVIEW_REQUIRED' : 'CURRENT'
    }
    return {
      path: d.path,
      title: d.body.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(d.path),
      category: category(d.path, d.body),
      sourceRefs,
      gitLastCommit: h?.commit ?? null,
      gitLastDate: h?.date ?? null,
      status: status ?? 'unverified',
      validity,
      sha256: d.hash,
      duplicatePaths: hashes.get(d.hash).filter(p => p !== d.path),
      inboundReferences: [...new Set(incoming.get(d.path) ?? [])],
      displaySuitable: meta?.display === true,
      operation: status === 'superseded' ? 'MERGE' : status === 'historical' ? 'ARCHIVE' : meta ? 'KEEP' : 'UPDATE',
      reason: meta ? '参见结构化状态与迁移记录' : '未逐条核验；保留原文，按调用链复核后再升为 current',
    }
  })
  const exactDuplicates = [...hashes.values()].filter(g => g.length > 1),
    semanticCandidates = []
  for (let i = 0; i < all.length; i++)
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i],
        b = all[j]
      if (
        a.hash === b.hash ||
        Math.min(a.body.length, b.body.length) < 500 ||
        Math.min(a.body.length, b.body.length) / Math.max(a.body.length, b.body.length) < 0.6 ||
        documents[i].category !== documents[j].category
      )
        continue
      const score = similarity(a.body, b.body)
      if (score >= 0.72)
        semanticCandidates.push({
          paths: [a.path, b.path],
          similarity: Number(score.toFixed(3)),
          operation: 'REVIEW_ONLY',
        })
    }
  return {
    baseline: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim(),
    documents,
    exactDuplicates,
    semanticCandidates,
    migrations: catalog.migrations,
    notes: [
      '高相似度仅供人工审查，不自动删除。',
      'CURRENT 是基线与相关源码变化提示，不是事实正确性证明。',
      '用户确认最新真实业务验收已通过；本轮无真实站点操作。',
    ],
  }
}
export function render() {
  const audit = build()
  const md =
    '# 文档审计清单\n\n' +
    `扫描 ${audit.documents.length} 份 Markdown；完全重复 ${audit.exactDuplicates.length} 组；高相似度候选 ${audit.semanticCandidates.length} 组。\n\n` +
    '| 路径 | 分类 | 时效提示 | 建议 | 最后提交 |\n|---|---|---|---|---|\n' +
    audit.documents
      .map(
        d =>
          `| ${d.path} | ${d.category} | ${d.validity} | ${d.operation} | ${d.gitLastCommit?.slice(0, 7) ?? '未提交新文件'} |`,
      )
      .join('\n') +
    '\n'
  return { json: JSON.stringify(audit, null, 2) + '\n', md }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = render(),
    dir = path.join(root, 'patmail-extension/docs/governance')
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'inventory.json'), output.json)
  fs.writeFileSync(path.join(dir, 'inventory.md'), output.md)
  console.log('Document inventory generated.')
}
