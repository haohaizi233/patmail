import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
import { parse } from '@babel/parser'
import { parse as parseSfc } from 'vue/compiler-sfc'

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function directiveComments(source, path) {
  if (!source.includes('eslint-disable')) return []
  const comments = []
  const scriptComments = (content, offset = 0, lineOffset = 0) => {
    const ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: ['typescript', ...(path.endsWith('.tsx') || path.endsWith('.jsx') ? ['jsx'] : [])],
    })
    for (const comment of ast.comments ?? [])
      comments.push({ value: comment.value.trim(), end: comment.end + offset, line: comment.loc.end.line + lineOffset })
  }
  if (path.endsWith('.vue')) {
    const { descriptor } = parseSfc(source)
    for (const block of [descriptor.script, descriptor.scriptSetup])
      if (block) scriptComments(block.content, block.loc.start.offset, block.loc.start.line - 1)
    const visit = node => {
      if (!node) return
      if (node.type === 3)
        comments.push({ value: node.content.trim(), end: node.loc.end.offset, line: node.loc.end.line })
      for (const child of node.children ?? []) visit(child)
    }
    visit(descriptor.template?.ast)
  } else scriptComments(source)
  return comments.filter(comment => /^eslint-disable(?:-next-line|-line)?(?:\s|$)/.test(comment.value))
}

// Freeze both directive scope and actual suppressed diagnostics. Line numbers
// are deliberately excluded: moving unchanged code must not spend an exemption.
export function collectExemptions(files, root, readSource = path => readFileSync(path, 'utf8')) {
  const exemptions = []
  for (const file of files) {
    const path = relative(root, file.filePath).replaceAll('\\', '/')
    const source = readSource(file.filePath)
    const lines = source.split(/\r?\n/)
    for (const { value: directive, end, line } of directiveComments(source, path)) {
      // Historical block/file disables are conservatively frozen through EOF,
      // including enable boundaries. Moving/removing a boundary cannot widen
      // a registered scope silently; changing such files requires review.
      const code = directive.includes('eslint-disable-next-line')
        ? lines[line]?.trim()
        : directive.includes('eslint-disable-line')
          ? lines[line - 1].trim()
          : source
              .slice(end)
              .split(/\r?\n/)
              .map(line => line.trim())
              .join('\n')
      exemptions.push(`${path}|directive|${digest([directive, code])}`)
    }
    for (const message of file.suppressedMessages ?? []) {
      exemptions.push(
        `${path}|${message.ruleId}|${digest([message.message, message.severity, lines[message.line - 1]?.trim(), message.suppressions ?? []])}`,
      )
    }
  }
  return exemptions.sort()
}

export function compareExemptions(current, baseline) {
  if (!Array.isArray(baseline) || baseline.some(value => typeof value !== 'string'))
    return ['缺少有效豁免登记；请显式运行 --update-exemptions 并审查登记差异。']
  const remaining = new Map()
  for (const entry of baseline) remaining.set(entry, (remaining.get(entry) ?? 0) + 1)
  const violations = []
  for (const entry of current) {
    const count = remaining.get(entry) ?? 0
    if (count > 0) remaining.set(entry, count - 1)
    else violations.push(`新增或变更的 lint 豁免：${entry}`)
  }
  return violations
}
