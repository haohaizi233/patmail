#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { parse } from '@babel/parser'
import { EXTENSION_ROOT, REPO_ROOT, SCRIPTS_ROOT } from '../shared/paths.mjs'

const domains = new Set([
  'architecture',
  'build',
  'cdp',
  'ci',
  'data',
  'docs',
  'download',
  'graphics',
  'hague',
  'quality',
  'release',
  'security',
  'shared',
])
const forwards = new Map([
  ['start-stream-download.ps1', 'download/bridge/start-stream-download.ps1'],
  ['stream-download-bridge.py', 'download/bridge/stream-download-bridge.py'],
])
const issues = []
const modules = new Map()
const implementations = new Set()
const relativeName = file => relative(SCRIPTS_ROOT, file).split(sep).join('/')
const isFile = file => existsSync(file) && statSync(file).isFile()

function nodes(node, visit) {
  if (!node || typeof node !== 'object') return
  if (typeof node.type === 'string') visit(node)
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(child => nodes(child, visit))
    else if (value && typeof value === 'object') nodes(value, visit)
  }
}

function checkModule(file, name, domain) {
  const program = parse(readFileSync(file, 'utf8'), { sourceType: 'module', createImportExpressions: true })
  const dependencies = []
  nodes(program, node => {
    if (node.type === 'CallExpression' && node.callee?.name === 'join' && node.arguments[0]?.name === 'SCRIPTS_ROOT') {
      const segments = node.arguments.slice(1).map(segment => segment.value)
      if (
        segments.every(segment => typeof segment === 'string') &&
        /\.(?:mjs|py|ps1)$/.test(segments.at(-1) ?? '') &&
        !isFile(join(SCRIPTS_ROOT, ...segments))
      ) {
        issues.push(`${name}: missing tool path ${segments.join('/')}`)
      }
    }
    const source = node.source?.value
    const arg = node.arguments?.[0]?.value
    const specifier =
      source ??
      ((node.type === 'NewExpression' &&
        node.callee?.name === 'URL' &&
        node.arguments?.[1]?.type === 'MemberExpression' &&
        node.arguments[1].object?.type === 'MetaProperty') ||
      (node.type === 'CallExpression' && node.callee?.name === 'require')
        ? arg
        : undefined)
    if (typeof specifier !== 'string') return
    if (domain === 'shared' && !specifier.startsWith('node:')) {
      issues.push(`${name}: shared may only depend on Node built-ins`)
    }
    if (!specifier.startsWith('.')) return
    const target = resolve(dirname(file), specifier)
    if (!isFile(target) && !isFile(target + '.mjs') && !(specifier.endsWith('/') && existsSync(target))) {
      issues.push(`${name}: missing relative dependency ${specifier}`)
    }
    dependencies.push(target)
  })
  modules.set(file, dependencies)
}

function visitDirectory(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name)
    const name = relativeName(file)
    if (entry.isDirectory()) {
      visitDirectory(file)
      continue
    }
    if (!/\.(?:mjs|mts|py|ps1|sh|bat|cmd|js|ts|cjs)$/.test(name)) continue
    const domain = name.split('/')[0]
    if (forwards.has(name)) {
      if (!isFile(join(SCRIPTS_ROOT, forwards.get(name)))) issues.push(`${name}: missing forwarding target`)
      continue
    }
    if (!domains.has(domain)) issues.push(`${name}: no toolchain domain`)
    if (name.endsWith('.d.mts')) {
      if (!isFile(file.replace(/\.d\.mts$/, '.mjs'))) issues.push(`${name}: implementation must be adjacent`)
      continue
    }
    if (implementations.has(basename(file))) issues.push(`${name}: duplicate tool name`)
    implementations.add(basename(file))
    if (name.endsWith('.mjs')) checkModule(file, name, domain)
  }
}

function checkCli(text, caller, root) {
  for (const [match] of text.matchAll(/(?:patmail-extension\/)?scripts\/[\w./-]+\.(?:mjs|py|ps1)\b/g)) {
    const base = match.startsWith('patmail-extension/') ? REPO_ROOT : root
    if (!isFile(join(base, match))) issues.push(`${caller}: missing CLI path ${match}`)
    if (forwards.has(basename(match)) && match === `scripts/${basename(match)}`) {
      issues.push(`${caller}: use the canonical bridge path ${forwards.get(basename(match))}`)
    }
  }
}

const active = new Set()
const checked = new Set()
function checkCycles(file) {
  if (active.has(file)) {
    issues.push(`${relativeName(file)}: circular dependency`)
    return
  }
  if (checked.has(file) || !modules.has(file)) return
  active.add(file)
  for (const target of modules.get(file)) checkCycles(target)
  active.delete(file)
  checked.add(file)
}

visitDirectory(SCRIPTS_ROOT)
for (const file of modules.keys()) checkCycles(file)
for (const root of [REPO_ROOT, EXTENSION_ROOT]) {
  const pkg = join(root, 'package.json')
  if (!isFile(pkg)) continue
  for (const [name, command] of Object.entries(JSON.parse(readFileSync(pkg, 'utf8')).scripts ?? {})) {
    // Removed in f933b3c. The old compatibility command is tracked as a pre-existing missing implementation.
    if (root === EXTENSION_ROOT && name === 'live:readonly' && command === 'node scripts/live-readonly.mjs') continue
    checkCli(command, `package.json#${name}`, root)
  }
}
const workflows = join(REPO_ROOT, '.github', 'workflows')
if (existsSync(workflows)) {
  for (const workflow of readdirSync(workflows).filter(name => /\.ya?ml$/.test(name))) {
    checkCli(readFileSync(join(workflows, workflow), 'utf8'), workflow, EXTENSION_ROOT)
  }
}
if (issues.length) {
  for (const issue of issues) console.error(issue)
  process.exitCode = 1
} else {
  console.log(`Scripts layout checks passed (${implementations.size} implementations).`)
}
