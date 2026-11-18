import { expect, it } from 'vitest'
import { DOC_GROUPS, resolveDocLink, type DocEntry } from '../../../src/app/docs'
import catalog from '../../../docs/governance/catalog.json'

const leaves = (entries: DocEntry[]): DocEntry[] =>
  entries.flatMap(entry => (entry.children ? leaves(entry.children) : [entry]))
it('registers every displayed authority and excludes historical registry entries', () => {
  const paths = new Set(leaves(DOC_GROUPS.flatMap(group => group.entries)).map(entry => entry.path))
  for (const document of catalog.documents) {
    if (document.display) expect(paths.has(document.path)).toBe(true)
    else if (document.status !== 'current') expect(paths.has(document.path)).toBe(false)
  }
})
it('loads the offline current engineering collection and resolves anchors and encoded paths', async () => {
  const entries = leaves(DOC_GROUPS.find(group => group.name === '逆向与算法')!.entries)
  expect(entries).toHaveLength(11)
  for (const entry of entries) {
    expect(entry.metadata?.status).toBe('current')
    expect(await entry.load!()).toMatch(/^# /)
  }
  const overview = entries.find(e => e.title === '海牙技术总览')!
  expect(resolveDocLink(DOC_GROUPS, overview, '#生产调用核验')).toBe(overview)
  expect(resolveDocLink(DOC_GROUPS, overview, '../README.md')?.title).toBe('技术知识总览')
  expect(resolveDocLink(DOC_GROUPS, overview, '../../archive/hague/README.md')).toBeUndefined()
  expect(resolveDocLink(DOC_GROUPS, overview, '../../hague-ast-analysis.md')?.title).toBe('JavaScript AST')
  const workflow = DOC_GROUPS.find(g => g.name === '工作流')!.entries[0]
  expect(resolveDocLink(DOC_GROUPS, workflow, encodeURIComponent('海牙新申请.md')))?.toHaveProperty(
    'file',
    '海牙新申请.md',
  )
  expect(resolveDocLink(DOC_GROUPS, overview, '%zz.md')).toBeUndefined()
})

it('keeps learning notes while excluding implementation plans and investigation logs', () => {
  const entries = leaves(DOC_GROUPS.find(group => group.name === 'agent学习')!.entries)
  expect(entries.some(entry => entry.title === '提示词')).toBe(true)
  expect(entries.some(entry => /procedure-mapping|jihua-upload|案件状态与专利标签排查/.test(entry.title))).toBe(false)
})

it('resolves links relative to the current file without exposing hidden documents', () => {
  const entries = leaves(DOC_GROUPS.flatMap(group => group.entries))
  const algorithm = entries.find(entry => entry.title === '下载去重算法')!
  expect(resolveDocLink(DOC_GROUPS, algorithm, '../usage/11-查询模板.md')?.title).toBe('11 查询模板')
  const workflow = entries.find(entry => entry.file === 'PCT提醒.md')!
  expect(resolveDocLink(DOC_GROUPS, workflow, 'README.md')?.path).toBe('patmail-extension/docs/workflows/README.md')
  const agentIndex = entries.find(entry => entry.path === 'docs/README.md')!
  expect(resolveDocLink(DOC_GROUPS, agentIndex, '02-提示与记忆/提示词.md')?.title).toBe('提示词')
  expect(resolveDocLink(DOC_GROUPS, agentIndex, 'superpowers/plans/2026-11-04-procedure-mapping.md')).toBeUndefined()
  expect(resolveDocLink(DOC_GROUPS, agentIndex, 'https://example.com/README.md')).toBeUndefined()
  expect(new Set(entries.map(entry => entry.path)).size).toBe(entries.length)
})

it('separates implementation explanations from usage and includes external platform API docs', () => {
  expect(DOC_GROUPS.find(group => group.name === '工作流')!.entries.map(entry => entry.title)).toEqual([
    '工作流总览',
    'PCT提醒',
    'PCT鹏城专案',
    '文件管理',
    '递交管理-已完成导出',
    '季华实验室-文件导入',
    '海牙新申请',
  ])
  const usage = leaves(DOC_GROUPS.find(group => group.name === '使用文档')!.entries)
  expect(usage.some(entry => entry.title.includes('下载去重算法'))).toBe(false)
  expect(
    DOC_GROUPS.find(group => group.name === '原理说明')?.entries.some(entry => entry.title.includes('下载去重算法')),
  ).toBe(true)
  const apis = leaves(DOC_GROUPS.find(group => group.name === '接口文档')!.entries)
  expect(apis.some(entry => entry.title.includes('季华实验室附件'))).toBe(true)
  expect(apis.some(entry => entry.title.includes('季华实验室平台'))).toBe(true)
})
it('loads the Hague stage guide from workflows and resolves its catalog and API navigation', async () => {
  const guide = DOC_GROUPS.find(group => group.name === '工作流')!.entries.find(
    entry => entry.file === '海牙新申请.md',
  )!
  const source = await guide.load!()
  expect(source).toContain('# 海牙新申请工作流')
  expect(source.match(/^```mermaid$/gm) ?? []).toHaveLength(8)
  expect(source).toContain('6 路并发')
  expect(resolveDocLink(DOC_GROUPS, guide, 'README.md')?.title).toBe('工作流总览')
  expect(resolveDocLink(DOC_GROUPS, guide, '../../../API/external-platforms/hague.md')?.path).toBe(
    'API/external-platforms/hague.md',
  )
})
