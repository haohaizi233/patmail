import { describe, expect, it } from 'vitest'
import type { NoticeTabId } from '../../../src/api/notice-types'
import { noticeLoadingHint, noticeLoadingTitle, noticeTabLabel } from '../../../src/app/components/notice/notice-loading'

describe('noticeTabLabel', () => {
  it('covers every notice tab', () => {
    const expected: Record<NoticeTabId, string> = {
      import: '导入来文',
      download: '来文下载',
      cert: '专利电子证书下载',
      replay: '来文二次下载',
      hand: '异常来文',
      handHis: '异常处理记录',
      nolaiuto: '无需导入来文',
      handExcel: '电子申请清单对比'
    }
    for (const tab of Object.keys(expected) as NoticeTabId[]) {
      expect(noticeTabLabel(tab)).toBe(expected[tab])
    }
  })
})

describe('noticeLoadingTitle', () => {
  it('uses the generic query title when no task is running', () => {
    expect(noticeLoadingTitle('cert')).toBe('正在查询「专利电子证书下载」列表…')
    expect(noticeLoadingTitle('download', '   ')).toBe('正在查询「来文下载」列表…')
  })

  it('prefers the running task label', () => {
    expect(noticeLoadingTitle('cert', '获取证书列表')).toBe('正在获取证书列表…')
    expect(noticeLoadingTitle('replay', '  二次下载分析 (2 条)  ')).toBe('正在二次下载分析 (2 条)…')
  })
})

describe('noticeLoadingHint', () => {
  it('escalates hint text with elapsed time for plain queries', () => {
    expect(noticeLoadingHint(0)).toBe('已向 EASY 原站发起查询请求，即将展示最新列表')
    expect(noticeLoadingHint(5)).toBe('正在等待 EASY 原站查询并返回分页数据…')
    expect(noticeLoadingHint(15)).toContain('耗时较长属于正常现象')
  })

  it('shows the task hint regardless of elapsed time', () => {
    for (const sec of [0, 5, 20]) {
      expect(noticeLoadingHint(sec, true)).toBe('EASY 原站任务执行中，完成后会自动刷新列表，无需重复点击')
    }
  })
})
