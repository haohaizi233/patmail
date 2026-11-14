import { apiDocFiles, apiDocRawText } from '../../agent/api-docs'

export interface DocEntry {
  /** 树里的显示名。 */
  title: string
  file?: string
  /** 仓库内路径，用于按当前文档解析相对链接。 */
  path?: string
  /** 点开这一篇时才加载 Markdown 原文。没有 load 的是目录节点。 */
  load?: () => Promise<string>
  /** 有 children 时是二级目录节点，点开收起。 */
  children?: DocEntry[]
}

export interface DocGroup {
  name: string
  entries: DocEntry[]
}

/** 使用文档成篇落在 docs/usage 目录，构建时按文件名排序，点开才加载。 */
const usageFiles = import.meta.glob('../../../docs/usage/*.md', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

function usageTitle(path: string): string {
  const name = path.split(/[/\\]/).pop() ?? path
  return name.replace(/\.md$/i, '').replace(/^(\d+)-/, '$1 ')
}

const usageEntries: DocEntry[] = Object.keys(usageFiles)
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))
  .map(path => ({ title: usageTitle(path), path: `patmail-extension/docs/usage/${path.split('/').pop()}`, load: usageFiles[path] }))

const mechanismFiles = import.meta.glob('../../../docs/mechanisms/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
const mechanismEntries: DocEntry[] = Object.keys(mechanismFiles).sort().map(path => ({
  title: usageTitle(path), path: `patmail-extension/docs/mechanisms/${path.split('/').pop()}`, load: mechanismFiles[path]
}))

/** 每条工作流各一篇；索引固定排第一，源文件随扩展离线打包。 */
const workflowFiles = import.meta.glob('../../../docs/workflows/*.md', {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

const workflowOrder = ['README.md', 'PCT提醒.md', 'PCT鹏城专案.md', '文件管理.md', '递交管理-已完成导出.md', '季华实验室-文件导入.md', '海牙新申请.md']
const workflowRank = (path: string) => {
  const rank = workflowOrder.indexOf(path.split('/').pop() ?? '')
  return rank < 0 ? workflowOrder.length : rank
}
const workflowEntries: DocEntry[] = Object.keys(workflowFiles)
  .sort((a, b) => {
    return workflowRank(a) - workflowRank(b) || a.localeCompare(b, 'zh-Hans-CN')
  })
  .map(path => ({
    title: path.endsWith('/README.md') ? '工作流总览' : usageTitle(path),
    file: path.split('/').pop(),
    path: `patmail-extension/docs/workflows/${path.split('/').pop()}`,
    load: workflowFiles[path]
  }))

/** 接口文档直接用仓库 API 目录里的原文，不另抄一份。README 当目录排最前。 */
function apiTitle(file: string): string {
  return /^readme\.md$/i.test(file) ? '接口索引' : file.replace(/\.md$/i, '')
}

const apiSorted = [...apiDocFiles()].sort((a, b) => {
  const aReadme = /^readme\.md$/i.test(a)
  const bReadme = /^readme\.md$/i.test(b)
  if (aReadme !== bReadme) return aReadme ? -1 : 1
  return a.localeCompare(b, 'zh-Hans-CN')
})

const apiEntries: DocEntry[] = apiSorted.map(file => ({
  title: apiTitle(file),
  path: `API/${file}`,
  // eslint-disable-next-line @typescript-eslint/require-await -- 存量豁免：保留 async 接口契约（Promise 返回）
  load: async () => apiDocRawText(file)
}))

const externalApiFiles = import.meta.glob('../../../../API/external-platforms/*.md', { query: '?raw', import: 'default' }) as Record<string, () => Promise<string>>
const externalApiEntries: DocEntry[] = Object.keys(externalApiFiles).sort().map(path => ({
  title: path.endsWith('/jihualab-attachments.md') ? '季华实验室附件接口' : path.endsWith('/jihualab.md') ? '季华实验室平台接口' : usageTitle(path),
  path: `API/external-platforms/${path.split('/').pop()}`, load: externalApiFiles[path]
}))

/** agent 学习文档在仓库根的 docs 目录，一层子目录按二级树展开，点开才加载。 */
const agentFiles = import.meta.glob(['../../../../docs/README.md', '../../../../docs/[0-9][0-9]-*/*.md'], {
  query: '?raw',
  import: 'default'
}) as Record<string, () => Promise<string>>

interface AgentFile {
  dir: string
  name: string
  path: string
}

const agentList: AgentFile[] = Object.keys(agentFiles).map(path => {
  const rel = path.replace(/^(\.\.\/)+/, '')
  const parts = rel.split('/')
  const file = parts[parts.length - 1] ?? ''
  const dir = parts.length > 2 ? parts[parts.length - 2] : ''
  return { dir, name: file, path }
})

const agentRoots: DocEntry[] = agentList
  .filter(item => !item.dir)
  .sort((a, b) => /^readme\.md$/i.test(b.name) ? 1 : a.name.localeCompare(b.name, 'zh-Hans-CN'))
  .map(item => ({
    title: /^readme\.md$/i.test(item.name) ? '学习笔记总览' : item.name.replace(/\.md$/i, ''),
    path: 'docs/README.md',
    load: agentFiles[item.path]
  }))

const agentSectionNames = [...new Set(agentList.filter(item => item.dir).map(item => item.dir))]
  .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'))

const agentSections: DocEntry[] = agentSectionNames.map(dir => ({
  title: dir,
  children: agentList
    .filter(item => item.dir === dir)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
    .map(item => ({ title: item.name.replace(/\.md$/i, ''), path: `docs/${item.dir}/${item.name}`, load: agentFiles[item.path] }))
}))

const agentEntries: DocEntry[] = [...agentRoots, ...agentSections]

/** 文档浮窗左侧的文件树。前两组是平铺文章，agent学习按子目录展开二级树。 */
export const DOC_GROUPS: DocGroup[] = [
  { name: '使用文档', entries: usageEntries },
  { name: '工作流', entries: workflowEntries },
  { name: '原理说明', entries: mechanismEntries },
  { name: '接口文档', entries: [{ title: 'EASY 接口', children: apiEntries }, { title: '外部平台接口', children: externalApiEntries }] },
  { name: 'agent学习', entries: agentEntries }
]

/** 只导航至展示目录内的文件，隐藏资料不会因正文链接重新出现。 */
export function resolveDocLink(groups: DocGroup[], current: DocEntry | null, href: string): DocEntry | undefined {
  if (!current?.path || /^(?:[a-z]+:|\/|#)/i.test(href)) return undefined
  let target: string
  try { target = decodeURIComponent(href.split('#')[0]) } catch { return undefined }
  if (target.endsWith('/')) target += 'README.md'
  const parts = current.path.split('/').slice(0, -1)
  for (const part of target.split('/')) {
    if (part === '..') parts.pop()
    else if (part && part !== '.') parts.push(part)
  }
  const path = parts.join('/')
  const find = (entries: DocEntry[]): DocEntry | undefined => {
    for (const entry of entries) {
      if (entry.path === path) return entry
      const child = entry.children && find(entry.children)
      if (child) return child
    }
    return undefined
  }
  return find(groups.flatMap(group => group.entries))
}
