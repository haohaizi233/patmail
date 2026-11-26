import { isRecord } from './guards'

export const NOTICE_STATUS_CHANNEL = 'patmail-notice-status'

export type NoticeTaskPhase =
  | 'checking_login'
  | 'submitting'
  | 'polling'
  | 'syncing_rows'
  | 'done'
  | 'background'
  | 'need_login'
  | 'error'

export type NoticeTaskAction =
  | 'fetchTzsList'
  | 'downloadTzsList'
  | 'fetchCertList'
  | 'downloadCertList'

export interface NoticeTaskStatusEvent {
  phase: NoticeTaskPhase
  action: NoticeTaskAction
  call?: string
  pollAttempt?: number
  maxPolls?: number
  serverMessage: string
  elapsedMs?: number
}

const VALID_PHASES = new Set<NoticeTaskPhase>([
  'checking_login',
  'submitting',
  'polling',
  'syncing_rows',
  'done',
  'background',
  'need_login',
  'error'
])

const VALID_ACTIONS = new Set<NoticeTaskAction>([
  'fetchTzsList',
  'downloadTzsList',
  'fetchCertList',
  'downloadCertList'
])

export function isNoticeTaskStatusEvent(value: unknown): value is NoticeTaskStatusEvent {
  if (!isRecord(value)) return false
  if (typeof value.phase !== 'string' || !VALID_PHASES.has(value.phase as NoticeTaskPhase)) return false
  if (typeof value.action !== 'string' || !VALID_ACTIONS.has(value.action as NoticeTaskAction)) return false
  if (typeof value.serverMessage !== 'string') return false
  if (value.call !== undefined && typeof value.call !== 'string') return false
  if (
    value.pollAttempt !== undefined &&
    (typeof value.pollAttempt !== 'number' || !Number.isSafeInteger(value.pollAttempt) || value.pollAttempt < 0)
  ) {
    return false
  }
  if (
    value.maxPolls !== undefined &&
    (typeof value.maxPolls !== 'number' || !Number.isSafeInteger(value.maxPolls) || value.maxPolls <= 0)
  ) {
    return false
  }
  if (
    value.elapsedMs !== undefined &&
    (typeof value.elapsedMs !== 'number' || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0)
  ) {
    return false
  }
  return true
}
