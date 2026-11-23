import { afterEach, describe, expect, it } from 'vitest'
import {
  getHomeCards,
  registerHomeCard,
  resetExtraHomeCards,
  unregisterHomeCard,
  useHomeCardRegistry,
} from '../../../src/app/home-cards/registry'
import type { HomeCardContext } from '../../../src/app/home-cards/types'
import { resolveHomeCards } from '../../../src/app/home-cards/use-home-cards'
import { homeReport } from '../../../src/app/home-report'

afterEach(() => {
  resetExtraHomeCards()
})

function sampleContext(): HomeCardContext {
  const workflows = [
    { id: 'custom-alpha', label: 'Alpha专案', summary: '', steps: [] },
    { id: 'custom-beta', label: 'Beta提醒', summary: '', steps: [] },
    { id: 'file-manage', label: '文件管理', summary: '', steps: [] },
  ]
  const customers: HomeCardContext['customers'] = [
    {
      id: 'c1',
      name: '客户一',
      baseTemplateId: 't1',
      overrides: {},
      workflowId: 'pct-reminder',
      enabled: true,
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
    {
      id: 'c2',
      name: '客户二',
      baseTemplateId: 't1',
      overrides: {},
      workflowId: 'file-manage',
      enabled: true,
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ]
  const tasks: HomeCardContext['tasks'] = [
    {
      taskId: 'task-1',
      createdAt: '2026-11-23T00:00:00Z',
      customerName: '客户一',
      fileCount: 3,
      mailCount: 2,
      status: 'READY',
      verifiedAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ]
  const templates: HomeCardContext['templates'] = [
    {
      id: 't1',
      name: '默认模板',
      source: 'local',
      queryType: 'FileSearch',
      fields: {},
      version: 1,
      createdAt: '2026-11-23T00:00:00Z',
      updatedAt: '2026-11-23T00:00:00Z',
    },
  ]
  const fileManageRuns: HomeCardContext['fileManageRuns'] = [
    { id: 'r1', at: '2026-11-23T00:00:00Z', customerName: '客户一', subject: '发文1', fileCount: 2, status: 'submitted', note: '' },
    { id: 'r2', at: '2026-11-23T00:01:00Z', customerName: '客户二', subject: '发文2', fileCount: 1, status: 'failed', note: 'err' },
    { id: 'r3', at: '2026-11-23T00:02:00Z', customerName: '客户二', subject: '发文3', fileCount: 1, status: 'held', note: '' },
  ]
  const ledger: HomeCardContext['ledger'] = [{ procId: 'p1', mailId: 'm1', state: 'submitted' }]
  const report = homeReport({
    customers,
    tasks,
    ledger,
    workflows: workflows.map(item => ({ id: item.id, label: item.label })),
  })
  return { report, customers, tasks, templates, fileManageRuns, ledger, workflows }
}

describe('首页可扩展卡片注册表与热解析', () => {
  it('自动发现内置核心卡片与默认隐藏的扩展卡片并按 order 排序', () => {
    const ids = getHomeCards().map(card => card.id)
    expect(ids).toEqual(
      expect.arrayContaining([
        'metric-submitted',
        'metric-pending-tasks',
        'metric-unknown-tasks',
        'metric-customers',
        'metric-templates',
        'metric-file-runs',
        'board-tasks',
        'board-workflows',
        'board-ledger',
        'board-file-runs',
      ]),
    )
    const defaultsOn = getHomeCards().filter(card => card.defaultEnabled)
    expect(defaultsOn.filter(card => card.kind === 'metric').map(card => card.id)).toEqual([
      'metric-submitted',
      'metric-pending-tasks',
      'metric-unknown-tasks',
      'metric-customers',
    ])
    expect(defaultsOn.filter(card => card.kind === 'board').map(card => card.id)).toEqual([
      'board-tasks',
      'board-workflows',
      'board-ledger',
    ])
  })

  it('支持运行时热注册与移除自定义扩展卡片', () => {
    const registry = useHomeCardRegistry()
    const before = registry.value.length
    registerHomeCard({
      id: 'metric-custom-live',
      kind: 'metric',
      title: '热扩展指标',
      order: 25,
      defaultEnabled: true,
      tone: 'rose',
      icon: '/assets/icons/img_1.png',
      value: ctx => ctx.workflows.length,
      subtitle: () => '动态注册无需改页面',
    })
    expect(registry.value.length).toBe(before + 1)
    expect(registry.value.some(card => card.id === 'metric-custom-live')).toBe(true)

    const { metricCards } = resolveHomeCards(registry.value, {}, sampleContext())
    const custom = metricCards.find(card => card.def.id === 'metric-custom-live')
    expect(custom?.value).toBe(3)
    expect(custom?.subtitle).toBe('动态注册无需改页面')

    expect(unregisterHomeCard('metric-custom-live')).toBe(true)
    expect(registry.value.some(card => card.id === 'metric-custom-live')).toBe(false)
  })

  it('根据工作流目录与扩展显隐开关动态生成卡片文案与分布统计', () => {
    const ctx = sampleContext()
    const { metricCards, boardCards } = resolveHomeCards(
      getHomeCards(),
      {
        'metric-templates': true,
        'metric-file-runs': true,
        'board-file-runs': true,
      },
      ctx,
    )

    const customersCard = metricCards.find(card => card.def.id === 'metric-customers')
    expect(customersCard?.value).toBe(2)
    expect(customersCard?.subtitle).toBe('Alpha专案 0 · Beta提醒 0 · 等4类')

    const templatesCard = metricCards.find(card => card.def.id === 'metric-templates')
    expect(templatesCard?.value).toBe(1)

    const runsCard = metricCards.find(card => card.def.id === 'metric-file-runs')
    expect(runsCard?.value).toBe(3)
    expect(runsCard?.subtitle).toBe('已交 1 · 失败 1')

    const runsBoard = boardCards.find(card => card.def.id === 'board-file-runs')
    expect(runsBoard?.total).toBe(3)
    expect(runsBoard?.slices.map(item => item.count)).toEqual([1, 1, 0, 1])
  })
})
