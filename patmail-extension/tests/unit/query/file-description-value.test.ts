import { describe, expect, it } from 'vitest'
import { normalizeFileDescriptionValue, previewFileDescription, resolveFileDescriptionDisplay } from '../../../src/schema'

const CERT = '603ca943-a07a-4894-9461-29dff2d60c4b'
const NOTICE = '703ca943-a07a-4894-9461-29dff2d60c4b'
const nodes = [
  { id: CERT, name: '专利证书(CERT)' },
  { id: NOTICE, name: '受理通知书' }
]

function idAt(index: number): string {
  return `${String(index).padStart(8, '0')}-0000-4000-8000-000000000000`
}

describe('文件描述值清洗', () => {
  it('名字换回内部 ID，空段和中文逗号都容错，换不了的点名留下', () => {
    const cleaned = normalizeFileDescriptionValue('专利证书(CERT)，,受理通知书,不认识的描述,', nodes)
    expect(cleaned.value).toBe(`${CERT},${NOTICE}`)
    expect(cleaned.dropped).toEqual(['不认识的描述'])
  })

  it('内部 ID 原样留；描述树没加载时只清空段，不瞎猜', () => {
    expect(normalizeFileDescriptionValue(`${CERT},,`, nodes).value).toBe(CERT)
    expect(normalizeFileDescriptionValue('专利证书(CERT)', []).value).toBe('专利证书(CERT)')
    expect(normalizeFileDescriptionValue('专利证书(CERT)', []).dropped).toEqual([])
    // 同名多项有歧义，不能随便挑一个
    const ambiguous = normalizeFileDescriptionValue('受理通知书', [...nodes, { id: idAt(9), name: '受理通知书' }])
    expect(ambiguous.value).toBe('')
    expect(ambiguous.dropped).toEqual(['受理通知书'])
  })

  it('名字自带逗号时按树里的名字把片段并回去', () => {
    const notice = 'NOTIFICATION CONCERNING SUBMISSION,OBTENTION OR TRANSMITTAL(PCT/IB/304)'
    const tree = [...nodes, { id: idAt(3), name: notice }]
    const cleaned = normalizeFileDescriptionValue(`${notice},受理通知书`, tree)
    expect(cleaned.value).toBe(`${idAt(3)},${NOTICE}`)
    expect(cleaned.dropped).toEqual([])
  })
})

describe('文件描述展示', () => {
  it('超过 10 项只摆前 10 项，尾巴标总数', () => {
    const ids = Array.from({ length: 12 }, (_, index) => idAt(index))
    const display = resolveFileDescriptionDisplay({
      savedIds: ids.join(','),
      descriptions: ids.map((id, index) => ({ id, name: `描述${index}` }))
    })
    expect(display.count).toBe(12)
    expect(display.items).toHaveLength(12)
    const preview = previewFileDescription(display)
    expect(preview.truncated).toBe(true)
    expect(preview.short).toContain('…（共 12 项）')
    expect(preview.short.split('、')).toHaveLength(10)
  })

  it('10 项以内不截断；解析不出时按历史文本的逗号拆开展示', () => {
    const ids = Array.from({ length: 3 }, (_, index) => idAt(index))
    const display = resolveFileDescriptionDisplay({
      savedIds: ids.join(','),
      descriptions: ids.map((id, index) => ({ id, name: `描述${index}` }))
    })
    expect(previewFileDescription(display)).toEqual({ short: '描述0、描述1、描述2', truncated: false })
    const history = resolveFileDescriptionDisplay({
      savedIds: Array.from({ length: 11 }, (_, index) => idAt(index + 50)).join(','),
      historyText: Array.from({ length: 11 }, (_, index) => `名字${index}`).join(',')
    })
    expect(history.count).toBe(11)
    const preview = previewFileDescription(history)
    expect(preview.truncated).toBe(true)
    expect(preview.short).toContain('…（共 11 项）')
  })
})
