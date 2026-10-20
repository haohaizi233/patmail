import { describe, expect, it } from 'vitest'
import { documentBlocks } from '../src/app/docs/markdown'

describe('document Markdown', () => {
  it('extracts real Mermaid fences and preserves surrounding Markdown and other code', () => {
    const blocks = documentBlocks('# 查询流程\n\n前文 **说明**。\n\n```mermaid\nflowchart TD\n A --> B\n```\n\n```ts\nconst x = 1\n```\n\n后文。')
    expect(blocks.map(block => block.kind)).toEqual(['html', 'mermaid', 'html'])
    expect(blocks[0]).toMatchObject({ html: expect.stringContaining('<strong>说明</strong>') })
    expect(blocks[1]).toEqual({ kind: 'mermaid', title: '查询流程', source: 'flowchart TD\n A --> B' })
    expect(blocks[2]).toMatchObject({ html: expect.stringContaining('const x = 1') })
  })

  it('does not treat a Mermaid example nested in a larger code fence as a diagram', () => {
    const blocks = documentBlocks('````md\n```mermaid\nflowchart TD\n A --> B\n```\n````')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('html')
  })

  it('keeps local workflow navigation while rejecting executable links and HTML', () => {
    const [block] = documentBlocks('[专案](PCT鹏城专案.md)\n\n[坏链接](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n[外链](https://example.com)')
    expect(block).toMatchObject({ kind: 'html' })
    if (block.kind !== 'html') throw new Error('expected HTML')
    expect(block.html).toContain('data-doc-file="PCT鹏城专案.md"')
    expect(block.html).not.toContain('javascript:')
    expect(block.html).not.toContain('<script>')
    expect(block.html).toContain('&lt;script&gt;')
    expect(block.html).toContain('rel="noopener noreferrer"')
  })
})
