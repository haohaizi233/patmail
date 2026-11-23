import { icon } from '../../../shell/assets'
import type { HomeMetricCardDef } from '../types'

const cards: HomeMetricCardDef[] = [
  {
    id: 'metric-submitted',
    kind: 'metric',
    title: '本页已交审核',
    description: '当前标签页里已提交审核的发文数量',
    order: 10,
    defaultEnabled: true,
    tone: 'green',
    icon: icon(11),
    route: '/records',
    value: ctx => ctx.report.submitted,
    subtitle: () => '这个标签页里的事项',
  },
  {
    id: 'metric-pending-tasks',
    kind: 'metric',
    title: '待发任务',
    description: '尚未发出且可继续处理的发文任务与预计邮件/文件数',
    order: 20,
    defaultEnabled: true,
    tone: 'pink',
    icon: icon(18),
    route: '/tasks',
    value: ctx => ctx.report.pendingTasks,
    subtitle: ctx => `计划 ${ctx.report.letters} 封 · ${ctx.report.files} 个文件`,
  },
  {
    id: 'metric-unknown-tasks',
    kind: 'metric',
    title: '结果未知',
    description: '提交回执未确认的任务数量，需人工核对后处理',
    order: 30,
    defaultEnabled: true,
    tone: 'orange',
    icon: icon(17),
    route: '/tasks',
    value: ctx => ctx.report.unknownTasks,
    subtitle: () => '不能自动再提交',
  },
  {
    id: 'metric-customers',
    kind: 'metric',
    title: '在册客户',
    description: '已保存查询与发文配置的客户总数及主要工作流分布',
    order: 40,
    defaultEnabled: true,
    tone: 'blue',
    icon: '/assets/icons/img_customer.png',
    route: '/customers',
    value: ctx => ctx.report.customers,
    subtitle: ctx => {
      const bound = ctx.report.workflows.filter(item => item.label !== '未绑工作流')
      if (bound.length === 0) return '尚未配置客户工作流'
      const preview = bound
        .slice(0, 2)
        .map(item => `${item.label} ${item.count}`)
        .join(' · ')
      return bound.length > 2 ? `${preview} · 等${bound.length}类` : preview
    },
  },
]

export default cards
