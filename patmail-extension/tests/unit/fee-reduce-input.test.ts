import { describe, expect, it } from 'vitest'
import {
  extractCaseVolumesFromSheet,
  parseCaseVolumeText,
  pickFeeReduceReviewer
} from '../../src/workflow/fee-reduce-input'

describe('fee-reduce-input', () => {
  it('parses pasted case volumes with mixed separators and deduplicates case-insensitively', () => {
    const parsed = parseCaseVolumeText('PE26115584CND\npe26115584cnd; PE26115585CND，PE26115586CND,  PE26115587CND ')
    expect(parsed).toEqual([
      'PE26115584CND',
      'PE26115585CND',
      'PE26115586CND',
      'PE26115587CND'
    ])
  })

  it('auto-detects 我方文号 column from sheet rows and supports explicit column selection', () => {
    const rows = [
      ['序号', '我方文号', '客户名称'],
      ['1', 'PE26115584CND', '客户A'],
      ['2', 'pe26115584cnd', '客户A'],
      ['3', 'PE26115585CND', '客户B']
    ]
    const auto = extractCaseVolumesFromSheet(rows)
    expect(auto.detectedColumn).toBe(1)
    expect(auto.headers).toEqual(['序号', '我方文号', '客户名称'])
    expect(auto.volumes).toEqual(['PE26115584CND', 'PE26115585CND'])

    const col2 = extractCaseVolumesFromSheet(rows, 2)
    expect(col2.detectedColumn).toBe(2)
    expect(col2.volumes).toEqual(['客户A', '客户B'])
  })

  it('selects reviewer by override, specific, least_busy, or first', () => {
    const candidates = [
      { userId: 'u1', name: '邓锐', count: 26 },
      { userId: 'u2', name: '冯志文', count: 0 }
    ]
    expect(pickFeeReduceReviewer(candidates, 'first')?.userId).toBe('u1')
    expect(pickFeeReduceReviewer(candidates, 'least_busy')?.userId).toBe('u2')
    expect(pickFeeReduceReviewer(candidates, 'specific', 'u2')?.userId).toBe('u2')
    expect(pickFeeReduceReviewer(candidates, 'least_busy', 'u2', 'u1')?.userId).toBe('u1')
    expect(pickFeeReduceReviewer([], 'first')).toBeNull()
    expect(pickFeeReduceReviewer(candidates, 'specific', 'missing')).toBeNull()
    expect(pickFeeReduceReviewer(candidates, 'first', undefined, 'missing')).toBeNull()
  })

  it('preserves the first case volume on a headerless sheet', () => {
    const rows = [['PE26115584CND'], ['PE26115585CND']]
    expect(extractCaseVolumesFromSheet(rows)).toMatchObject({
      headers: ['第 1 列'], volumes: ['PE26115584CND', 'PE26115585CND']
    })
  })

  it('prioritizes the office volume over other reference headings', () => {
    const rows = [['客户文号', '案号', '我方文号'], ['CLIENT-01', 'CASE-01', 'PE26115584CND']]
    expect(extractCaseVolumesFromSheet(rows).volumes).toEqual(['PE26115584CND'])
  })
})
