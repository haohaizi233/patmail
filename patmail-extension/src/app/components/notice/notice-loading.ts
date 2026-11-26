import type { NoticeTabId } from '../../../api/notice-types'

const TAB_LABELS: Record<NoticeTabId, string> = {
  import: '导入来文',
  download: '来文下载',
  cert: '专利电子证书下载',
  replay: '来文二次下载',
  hand: '异常来文',
  handHis: '异常处理记录',
  nolaiuto: '无需导入来文',
  handExcel: '电子申请清单对比'
}

export function noticeTabLabel(tab: NoticeTabId): string {
  return TAB_LABELS[tab] ?? '来文'
}

/** 查询与任务执行共用一套加载态文案，任务态优先展示正在执行的动作。 */
export function noticeLoadingTitle(tab: NoticeTabId, taskLabel = ''): string {
  const label = taskLabel.trim()
  return label ? `正在${label}…` : `正在查询「${noticeTabLabel(tab)}」列表…`
}

export function noticeLoadingHint(elapsedSec: number, runningTask = false): string {
  if (runningTask) return 'EASY 原站任务执行中，完成后会自动刷新列表，无需重复点击'
  if (elapsedSec >= 15) return 'EASY 原站正在筛选或汇总数据，耗时较长属于正常现象，请耐心等待，无需重复点击'
  if (elapsedSec >= 5) return '正在等待 EASY 原站查询并返回分页数据…'
  return '已向 EASY 原站发起查询请求，即将展示最新列表'
}
