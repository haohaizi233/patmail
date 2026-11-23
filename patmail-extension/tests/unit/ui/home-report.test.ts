import { describe, expect, it } from 'vitest'
import { barWidth, homeReport } from '../../../src/app/home-report'

describe('首页发文报表', () => {
  it('按任务状态、工作流和本页账本分开计数', () => {
    const report = homeReport({
      customers: [
        { workflowId: 'pct-reminder' },
        { workflowId: 'pct-pengcheng' },
        { pctTask: { workflowId: 'pct-reminder' } },
        {}
      ],
      tasks: [
        { status: 'DRY_RUN_COMPLETED', fileCount: 2, mailCount: 1 },
        { status: 'BLOCKED', fileCount: 1, mailCount: 1 },
        { status: 'UNKNOWN', fileCount: 3, mailCount: 2 },
        { status: 'COMPLETED', fileCount: 4, mailCount: 1 }
      ],
      ledger: [
        { state: 'submitted' },
        { state: 'submitted' },
        { state: 'created' },
        { state: 'unknown' }
      ]
    })
    expect(report.submitted).toBe(2)
    expect(report.pendingTasks).toBe(1)
    expect(report.unknownTasks).toBe(1)
    expect(report.customers).toBe(4)
    expect(report.files).toBe(10)
    expect(report.letters).toBe(5)
    expect(report.tasks.map(item => item.count)).toEqual([1, 1, 1, 1])
    expect(report.workflows.map(item => item.count)).toEqual([2, 1, 1])
    expect(report.ledger.map(item => item.count)).toEqual([2, 1, 1])
  })

  it('没有数据时条子宽度是 0', () => {
    const report = homeReport({ customers: [], tasks: [], ledger: [] })
    expect(barWidth(0, report.tasks)).toBe(0)
    expect(report.workflows.map(item => item.count)).toEqual([0, 0, 0])
  })

  it('按传入工作流目录动态计数并兼容目录外自定义绑定', () => {
    const report = homeReport({
      workflows: [
        { id: 'pct-reminder', label: 'PCT提醒' },
        { id: 'file-manage', label: '文件管理' },
        { id: 'custom-vip', label: 'VIP 专案' },
      ],
      customers: [
        { workflowId: 'pct-reminder' },
        { workflowId: 'file-manage' },
        { workflowId: 'custom-vip' },
        { workflowId: 'legacy-flow' },
        {},
      ],
      tasks: [],
      ledger: [],
    })
    expect(report.customers).toBe(5)
    expect(report.workflows).toEqual([
      { label: 'PCT提醒', count: 1, tone: 'pink' },
      { label: '文件管理', count: 1, tone: 'blue' },
      { label: 'VIP 专案', count: 1, tone: 'green' },
      { label: 'legacy-flow', count: 1, tone: 'orange' },
      { label: '未绑工作流', count: 1, tone: 'muted' },
    ])
  })
})
