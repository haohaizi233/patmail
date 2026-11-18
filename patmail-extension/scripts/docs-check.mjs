import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { root, trackedMarkdown, links, targetOf } from './docs-audit.mjs'
const states = new Set(['current', 'historical', 'superseded', 'experimental', 'unverified']),
  levels = new Set(['design_only', 'code_verified', 'tested_offline', 'browser_e2e', 'live_business_verified'])
const slug = s =>
  s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
export function inspectMarkdown(base, file, strictAnchors = false) {
  const errors = [],
    body = fs.readFileSync(path.join(base, file), 'utf8')
  let fence = null
  for (const line of body.split(/\r?\n/)) {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (!m) continue
    if (!fence) fence = { char: m[1][0], size: m[1].length }
    else if (m[1][0] === fence.char && m[1].length >= fence.size && !m[2].trim()) fence = null
  }
  if (fence) errors.push(`FENCE ${file}`)
  if (body.startsWith('---\n') || body.startsWith('---\r\n')) {
    const end = body.slice(4).search(/^---\s*$/m)
    if (end < 0) errors.push(`FRONT_MATTER ${file}`)
  }
  for (const href of links(body)) {
    let target = strictAnchors && href.startsWith('#') ? file : targetOf(file, href)
    if (!target) continue
    if (target.endsWith('/')) target += 'README.md'
    const absolute = path.resolve(base, target)
    if (!absolute.startsWith(path.resolve(base) + path.sep) || !fs.existsSync(absolute)) {
      errors.push(`LINK ${file} -> ${href}`)
      continue
    }
    if (fs.statSync(absolute).isDirectory()) {
      target += '/README.md'
      if (!fs.existsSync(path.join(base, target))) {
        errors.push(`LINK ${file} -> ${href}`)
        continue
      }
    }
    if (strictAnchors && href.includes('#') && /\.md$/i.test(target)) {
      let anchor
      try {
        anchor = decodeURIComponent(href.slice(href.indexOf('#') + 1))
      } catch {
        errors.push(`ANCHOR ${file} -> ${href}`)
        continue
      }
      const headings = [...fs.readFileSync(path.join(base, target), 'utf8').matchAll(/^#{1,6}\s+(.+)$/gm)].map(m =>
        slug(m[1]),
      )
      if (anchor && !headings.includes(anchor) && !headings.includes(anchor.replace(/^doc-/, '')))
        errors.push(`ANCHOR ${file} -> ${href}`)
    }
  }
  for (const code of body.matchAll(/^```mermaid\s*\n([\s\S]*?)^```\s*$/gm))
    if (!code[1].trim() || !/^\s*(?:%%[^\n]*\n\s*)*[a-zA-Z]/.test(code[1])) errors.push(`MERMAID ${file}`)
  return errors
}
export function checkCatalog(base, catalog) {
  const errors = [],
    paths = new Set(),
    titles = new Set(),
    hashes = new Map()
  for (const d of catalog.documents ?? []) {
    if (paths.has(d.path)) errors.push(`DUPLICATE_PATH ${d.path}`)
    paths.add(d.path)
    for (const key of ['path', 'title', 'status', 'scope', 'last_verified_commit', 'last_reviewed', 'evidence_level'])
      if (typeof d[key] !== 'string' || !d[key]) errors.push(`METADATA ${d.path}: ${key}`)
    if (
      !states.has(d.status) ||
      !levels.has(d.evidence_level) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(d.last_reviewed ?? '') ||
      !/^[a-f0-9]{40}$/.test(d.last_verified_commit ?? '')
    )
      errors.push(`METADATA_ENUM ${d.path}`)
    if (d.display && d.status !== 'current') errors.push(`HIDDEN_STATUS ${d.path}`)
    if (
      typeof d.path !== 'string' ||
      !path.resolve(base, d.path).startsWith(path.resolve(base) + path.sep) ||
      !fs.existsSync(path.join(base, d.path))
    ) {
      errors.push(`REGISTERED_PATH ${d.path}`)
      continue
    }
    if (d.display) {
      if (titles.has(d.title)) errors.push(`TITLE ${d.title}`)
      titles.add(d.title)
      const hash = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(base, d.path)))
        .digest('hex')
      if (hashes.has(hash)) errors.push(`AUTHORITY_DUPLICATE ${d.path}`)
      hashes.set(hash, d.path)
      errors.push(...inspectMarkdown(base, d.path, true))
    }
    for (const source of d.related_sources ?? [])
      if (!fs.existsSync(path.join(base, source))) errors.push(`SOURCE ${d.path} -> ${source}`)
  }
  for (const m of catalog.migrations ?? [])
    if (!fs.existsSync(path.join(base, m.old_path)) || !fs.existsSync(path.join(base, m.canonical_path)))
      errors.push(`MIGRATION ${m.old_path}`)
  return [...new Set(errors)].sort()
}
export function check({ writeBaseline = false } = {}) {
  const dir = path.join(root, 'patmail-extension/docs/governance'),
    catalog = JSON.parse(fs.readFileSync(path.join(dir, 'catalog.json'), 'utf8'))
  const files = trackedMarkdown()
  const strict = checkCatalog(root, catalog)
  for (const file of files) {
    if (file.startsWith('patmail-extension/docs/engineering/') && !catalog.documents.some(d => d.path === file))
      strict.push(`UNREGISTERED_AUTHORITY ${file}`)
  }
  const migrations = JSON.parse(fs.readFileSync(path.join(dir, 'migrations.json'), 'utf8'))
  if (JSON.stringify(migrations) !== JSON.stringify(catalog.migrations)) strict.push('MIGRATION_CATALOG_MISMATCH')
  const baselineFile = path.join(dir, 'legacy-baseline.json'),
    all = files.flatMap(p => inspectMarkdown(root, p)),
    strictSet = new Set(strict)
  const legacy = [...new Set(all.filter(e => !strictSet.has(e)))].sort()
  if (writeBaseline) {
    fs.writeFileSync(
      baselineFile,
      JSON.stringify(
        {
          description: '仅冻结首次引入时的历史链接/结构问题；不豁免正式目录，不允许自动更新以绕过新增错误。',
          issues: legacy,
        },
        null,
        2,
      ) + '\n',
    )
  }
  const baseline = fs.existsSync(baselineFile) ? JSON.parse(fs.readFileSync(baselineFile, 'utf8')).issues : []
  const errors = [...new Set([...strict, ...legacy.filter(e => !baseline.includes(e))])]
  return { errors, legacyIssues: legacy.length, grandfathered: legacy.filter(e => baseline.includes(e)).length }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = check({ writeBaseline: process.argv.includes('--write-baseline') })
  console.log(JSON.stringify(result, null, 2))
  if (result.errors.length) process.exitCode = 1
}
