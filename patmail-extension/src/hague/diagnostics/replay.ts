import {analyzeOfflineFixture} from './fixtures'
import { buildDiagnosticReport } from './reports'

/** Offline data transformation only. Never imports an executor, fetch or browser bridge. */
export function replayDiagnostics(text: string) {
  if (text.length > 2_000_000) throw new Error('REPLAY_LIMIT')
  let records: unknown
  try {
    const trimmed = text.trim()
    try { records = JSON.parse(trimmed) } catch { records = trimmed.split(/\r?\n/).filter(Boolean).map((line): unknown => JSON.parse(line)) }
  } catch { throw new Error('INVALID_REPLAY') }
  if (records && typeof records === 'object' && !Array.isArray(records) && 'kind' in records && 'content' in records) { const fixture = records as Parameters<typeof analyzeOfflineFixture>[0]; return {provenance:'offline-replay' as const,report:buildDiagnosticReport(analyzeOfflineFixture(fixture))} }
  if (records && typeof records === 'object' && !Array.isArray(records) && 'events' in records) records = records.events
  if (records && typeof records === 'object' && !Array.isArray(records) && 'version' in records) records = [records]
  if (!Array.isArray(records) || records.length > 5000) throw new Error('REPLAY_LIMIT')
  const items: unknown[] = records
  for (const value of items) {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) throw new Error('UNSUPPORTED_SCHEMA')
    const item = value as Record<string, unknown>
    if ((item.source !== 'application' && item.source !== 'cdp' && item.source !== 'fixture') || typeof item.phase !== 'string' || typeof item.timestamp !== 'string' || !Number.isFinite(Date.parse(item.timestamp))) throw new Error('INVALID_REPLAY')
  }
  const report = buildDiagnosticReport(records)
  if (report.events.length !== records.length) throw new Error('INVALID_REPLAY')
  return { provenance: 'offline-replay' as const, report }
}

