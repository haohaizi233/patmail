import type { HomeBoardCardDef } from '../types'

const cards: HomeBoardCardDef[] = [
  {
    id: 'board-file-runs',
    kind: 'board',
    title: '文件批处理分布',
    description: '按已交审核、已拦截、已跳过与失败统计文件管理运行记录',
    order: 40,
    defaultEnabled: false,
    route: '/files',
    slices: ctx => {
      let submitted = 0
      let held = 0
      let skipped = 0
      let failed = 0
      for (const run of ctx.fileManageRuns) {
        if (run.status === 'submitted') submitted += 1
        else if (run.status === 'held') held += 1
        else if (run.status === 'skipped') skipped += 1
        else failed += 1
      }
      return [
        { label: '已交审核', count: submitted, tone: 'green' },
        { label: '已保留', count: held, tone: 'orange' },
        { label: '已跳过', count: skipped, tone: 'muted' },
        { label: '执行失败', count: failed, tone: 'pink' },
      ]
    },
  },
]

export default cards
