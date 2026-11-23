import type { HomeBoardCardDef } from '../types'

const cards: HomeBoardCardDef[] = [
  {
    id: 'board-tasks',
    kind: 'board',
    title: '发文任务',
    description: '按待发、阻塞、未知和已完成统计所有任务',
    order: 10,
    defaultEnabled: true,
    route: '/tasks',
    slices: ctx => ctx.report.tasks,
  },
  {
    id: 'board-workflows',
    kind: 'board',
    title: '客户工作流',
    description: '按工作流目录动态统计在册客户绑定分布',
    order: 20,
    defaultEnabled: true,
    route: '/customers',
    slices: ctx => ctx.report.workflows,
  },
  {
    id: 'board-ledger',
    kind: 'board',
    title: '本页发文',
    description: '当前标签页内发送台账状态分布',
    order: 30,
    defaultEnabled: true,
    route: '/records',
    slices: ctx => ctx.report.ledger,
    note: () => '账本只留在这个标签页，关掉就清空。',
  },
]

export default cards
