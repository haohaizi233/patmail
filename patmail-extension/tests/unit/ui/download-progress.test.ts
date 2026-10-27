import { describe, expect, it } from 'vitest'
import { isDownloadProgress } from '../../../src/shared/download-progress'

describe('下载阶段进度', () => {
  it('仅接受完整且范围正确的阶段计数', () => {
    expect(isDownloadProgress({ phase: 'naming', done: 120, total: 1597 })).toBe(true)
    expect(isDownloadProgress({ phase: 'packing', done: 0, total: 1 })).toBe(true)
    expect(isDownloadProgress({ phase: 'packing', done: 0, total: 1, elapsedMs: 400000, receivedBytes: 1024 })).toBe(true)
    expect(isDownloadProgress({ phase: 'packing', done: 0, total: 1, receivedBytes: -1 })).toBe(false)
    expect(isDownloadProgress({ phase: 'packing', done: 0, total: 1, elapsedMs: Infinity })).toBe(false)
    expect(isDownloadProgress({ phase: 'saving', done: 1, total: 1 })).toBe(true)
    for (const value of [null, {}, { phase: 'other', done: 0, total: 1 }, { phase: 'naming', done: -1, total: 1 },
      { phase: 'naming', done: 2, total: 1 }, { phase: 'naming', done: 0, total: 0 },
      { phase: 'naming', done: 0.5, total: 1 }, { phase: 'naming', done: 1, total: Infinity }]) {
      expect(isDownloadProgress(value)).toBe(false)
    }
  })
})
