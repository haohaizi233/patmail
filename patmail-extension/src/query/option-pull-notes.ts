/** 静默校对的回执文案：有更新点名，拉不到就说明用账本兜底，手动点开时至少给一句话。 */

export function describeOptionUpdate(changedLabels: string[]): string {
  return changedLabels.length ? `下拉选项已更新：${changedLabels.join('、')}。` : ''
}

export const OPTION_PULL_UNCHANGED = '已经和原网站对过，选项没有变化。'
export const OPTION_PULL_FALLBACK = '没有拉到最新下拉，继续用上次的选项。'

export interface OptionPullSummary {
  /** 这次真正换上的下拉对应的字段名。 */
  updatedLabels: string[]
  /** 拉取失败、部分字典没回传之类的说明；静默兜底时不会展示。 */
  failures: string[]
  /** 用户手动点「校对最新字段」时才给没变化的回执。 */
  manual: boolean
  /** 账本里已有非空选项：拉不到就用账本兜底，而不是报错。 */
  hasLedger: boolean
  /** 各界面自己的补充说明，比如自定义栏位改名。 */
  extra?: string[]
}

export function describeOptionPull(summary: OptionPullSummary): string {
  const parts: string[] = []
  const updated = describeOptionUpdate(summary.updatedLabels)
  if (updated) parts.push(updated)
  if (summary.failures.length) parts.push(summary.hasLedger ? OPTION_PULL_FALLBACK : summary.failures[0]!)
  for (const line of summary.extra ?? []) {
    if (line) parts.push(line)
  }
  if (!parts.length && summary.manual) parts.push(OPTION_PULL_UNCHANGED)
  return parts.join('')
}
