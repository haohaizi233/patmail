import { icon } from '../../../shell/assets'
import type { HomeMetricCardDef } from '../types'

const cards: HomeMetricCardDef[] = [
  {
    id: 'metric-templates',
    kind: 'metric',
    title: '查询模板',
    description: '当前账号保存的可复用查询条件模板数量',
    order: 50,
    defaultEnabled: false,
    tone: 'purple',
    icon: icon(36),
    route: '/templates',
    value: ctx => ctx.templates.length,
    subtitle: ctx => (ctx.templates.length > 0 ? '已保存可复用条件' : '去查询模板保存常用条件'),
  },
  {
    id: 'metric-file-runs',
    kind: 'metric',
    title: '文件批处理',
    description: '最近文件管理批量发文的执行次数与成功/失败摘要',
    order: 60,
    defaultEnabled: false,
    tone: 'sky',
    icon: icon(41),
    route: '/files',
    value: ctx => ctx.fileManageRuns.length,
    subtitle: ctx => {
      let submitted = 0
      let failed = 0
      for (const run of ctx.fileManageRuns) {
        if (run.status === 'submitted') submitted += 1
        else if (run.status === 'failed') failed += 1
      }
      return `已交 ${submitted} · 失败 ${failed}`
    },
  },
]

export default cards
