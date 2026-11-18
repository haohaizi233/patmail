import { PermitPool } from '../utils/permit-pool'
import type { CaseFolder, Filing } from './materials'
import type { Decision } from './arbitration'
import type { DraftCheckpoint } from './draft-contract'

export type CaseState = 'parsing' | 'waiting-session' | 'ready' | 'blocked' | 'reading' | 'queued' | 'arbitrating' | 'review' | 'confirmed' | 'failed' | 'stopped'
export const STATE_LABELS: Record<CaseState, string> = { parsing: '解析材料', 'waiting-session': '等待 eHague 登录验证', ready: '待处理', blocked: '材料待修正', reading: '读取知易通', queued: '等待 AI 仲裁', arbitrating: 'Agent 统一仲裁', review: '待核对结果', confirmed: '已核对', failed: '处理失败', stopped: '已停止，可继续' }
export interface HagueRow { folder: CaseFolder; filing?: Filing; decision?: Decision; source?: string; state: CaseState; error: string; confirmed: boolean; draft?: DraftCheckpoint }
export interface BatchProgress { phase: 'running' | 'waiting' | 'stopped' | 'completed'; total: number; settled: number; succeeded: number; failed: number; doneUnits: number; totalUnits: number; active: string; stage: string; parsing?: number; reading?: number; queued?: number; arbitrating?: number }
const ALLOWED: Record<CaseState, CaseState[]> = {
  parsing: ['ready', 'blocked', 'stopped'], 'waiting-session': ['reading', 'queued', 'blocked', 'ready', 'stopped'], ready: ['waiting-session', 'reading', 'queued', 'blocked', 'stopped'], blocked: ['waiting-session', 'reading', 'blocked', 'ready'],
  reading: ['queued', 'arbitrating', 'failed', 'stopped'], queued: ['arbitrating', 'failed', 'stopped'], arbitrating: ['review', 'failed', 'stopped'],
  review: ['waiting-session', 'reading', 'queued', 'arbitrating', 'confirmed', 'ready', 'blocked'], confirmed: ['waiting-session', 'reading', 'queued', 'ready', 'review', 'blocked'],
  failed: ['waiting-session', 'reading', 'queued', 'arbitrating', 'blocked', 'ready'], stopped: ['waiting-session', 'reading', 'queued', 'arbitrating', 'blocked', 'ready']
}
export function transition(row: HagueRow, state: CaseState): void {
  if (row.state !== state && !ALLOWED[row.state].includes(state)) throw new Error(`无效案件状态切换：${row.state} → ${state}`)
  row.state = state
}
interface Dependencies { canRead?(): boolean; parse?(row: HagueRow): Promise<void>; validate(row: HagueRow): string[]; read(row: HagueRow, signal: AbortSignal): Promise<string>; decide(row: HagueRow, signal: AbortSignal, onStart?: () => void): Promise<Decision> }
export async function runBatch(rows: HagueRow[], deps: Dependencies, signal: AbortSignal, update: (progress: BatchProgress) => void): Promise<BatchProgress> {
  const units = deps.parse ? 3 : 2
  const progress: BatchProgress = { phase: 'running', total: rows.length, settled: 0, succeeded: 0, failed: 0, doneUnits: 0, totalUnits: rows.length * units, active: '', stage: '' }
  const parsePool = new PermitPool(2)
  const paint = () => update({ ...progress, parsing: rows.filter(r => r.state === 'parsing').length, reading: rows.filter(r => r.state === 'reading').length, queued: rows.filter(r => r.state === 'queued').length, arbitrating: rows.filter(r => r.state === 'arbitrating').length })
  paint()
  await Promise.all(rows.map(async row => {
    if (signal.aborted) return
    row.error = ''; row.confirmed = false; row.decision = undefined
    let completed = 0
    const step = () => { completed++; progress.doneUnits++; paint() }
    try {
      if (deps.parse) {
        progress.stage = '解析、取数、仲裁流水线运行中'
        await parsePool.run(() => deps.parse!(row), signal)
        if (signal.aborted) { transition(row, 'stopped'); return }
        transition(row, 'ready'); step()
      }
      const issues = deps.validate(row)
      if (issues.length) { transition(row, 'blocked'); throw new Error(issues.join('；')) }
      if (deps.canRead && !deps.canRead()) { transition(row, 'waiting-session'); paint(); return }
      if (!row.source) {
        transition(row, 'reading'); progress.stage = '取数与仲裁流水线运行中'; paint()
        row.source = await deps.read(row, signal)
        if (signal.aborted) { transition(row, 'stopped'); return }
      }
      step()
      transition(row, 'queued'); paint()
      const decision = await deps.decide(row, signal, () => { transition(row, 'arbitrating'); progress.active = row.folder.caseVolume; paint() })
      if (signal.aborted) { transition(row, 'stopped'); return }
      if (row.state === 'queued') transition(row, 'arbitrating')
      row.decision = decision; transition(row, 'review'); step(); progress.succeeded++
    } catch (error) {
      if (signal.aborted) { transition(row, 'stopped'); return }
      row.error = error instanceof Error ? error.message : String(error)
      if (row.state !== 'blocked') transition(row, row.state === 'parsing' ? 'blocked' : 'failed')
      progress.failed++
      progress.doneUnits += units - completed
    }
    progress.settled++; paint()
  }))
  progress.phase = signal.aborted ? 'stopped' : rows.some(r => r.state === 'waiting-session') ? 'waiting' : 'completed'
  progress.stage = signal.aborted ? '已停止，可继续处理剩余案件' : progress.phase === 'waiting' ? '材料已就绪，正在等待 eHague 自动验证登录态' : `处理结束：成功 ${progress.succeeded}，异常 ${progress.failed}`
  paint()
  return progress
}
