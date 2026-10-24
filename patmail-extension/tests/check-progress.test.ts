import { describe, expect, it } from 'vitest'
import { paintTaskCheckProgress, resetTaskCheckProgress, sessionInterrupted, taskCheckProgress, taskCheckSnapshot } from '../src/app/check-progress'

describe('发文核对进度', () => {
  it('还没对上时只给百分比，不写结束时间', () => {
    const view = taskCheckSnapshot(0, 200, 1_000, 5_000, 'run')
    expect(view.percent).toBe(0)
    expect(view.eta).toBe('')
  })

  it('按已用时间外推预计结束时刻', () => {
    // 用当天凌晨 4 点起算，预计结束不会跨天，早上 4 点后断言稳定。
    const day = new Date()
    const started = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 4, 0, 0).getTime()
    const now = started + 100_000
    const view = taskCheckSnapshot(25, 100, started, now, 'run')
    expect(view.percent).toBe(25)
    const finish = new Date(now + 300_000)
    const pad = (value: number) => String(value).padStart(2, '0')
    expect(view.eta).toBe(`${pad(finish.getHours())}:${pad(finish.getMinutes())}:${pad(finish.getSeconds())}`)
  })

  it('刚翻第一页就给预计完成时间，不等预热', () => {
    // 翻页几页就完事，预热 800ms 的话彩虹条从头到尾只有「正在估算结束时间」。
    const started = 1_000
    const view = taskCheckSnapshot(1, 10, started, started + 300, 'run')
    expect(view.eta).not.toBe('')
  })

  it('对完之后不再写预计时间', () => {
    const view = taskCheckSnapshot(80, 80, 1_000, 9_000, 'done')
    expect(view.percent).toBe(100)
    expect(view.eta).toBe('')
  })

  it('登录中断时保留进度，不估结束时间', () => {
    const view = taskCheckSnapshot(48, 179, 1_000, 9_000, 'hold')
    expect(view.done).toBe(48)
    expect(view.total).toBe(179)
    expect(view.percent).toBe(26.8)
    expect(view.eta).toBe('')
  })

  it('登录和会话中断要整表停住等接回', () => {
    expect(sessionInterrupted('登录已失效。')).toBe(true)
    expect(sessionInterrupted('登录检测超时。')).toBe(true)
    expect(sessionInterrupted('会话已变化，请重新检测后再继续。')).toBe(true)
    expect(sessionInterrupted('尚未连接 EASY。')).toBe(true)
    expect(sessionInterrupted('绑定的 EASY 标签页已失效。')).toBe(true)
    expect(sessionInterrupted('原网站查询太慢，没有在 1 分钟内返回。')).toBe(false)
  })

  it('进度条的动词跟着任务走：核对、翻页、取数', () => {
    paintTaskCheckProgress(3, 10, 1_000, 'run', '翻页')
    expect(taskCheckProgress.label).toBe('翻页')
    expect(taskCheckProgress.done).toBe(3)
    paintTaskCheckProgress(10, 10, 1_000, 'done', '取数')
    expect(taskCheckProgress.label).toBe('取数')
    expect(taskCheckProgress.status).toBe('done')
    resetTaskCheckProgress()
    expect(taskCheckProgress.label).toBe('核对')
  })
})
